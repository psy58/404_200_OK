"""문서 요약을 만든다. Summary Index의 재료다.

조각을 그대로 임베딩하면 "이 문장이 어디 있나"는 잘 찾지만 "이 공문이 무슨
업무인가"는 잘 못 찾는다. 문서마다 요약을 하나 만들어 따로 인덱스를 두면,
검색을 문서 단위로 먼저 좁힐 수 있다.

요약에는 사람 이름과 연락처를 넣지 않는다. 업무를 찾는 데 필요하지 않고,
Summary Index는 문서 본문보다 여러 곳에서 오래 돌아다니게 된다.
"""

import json
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import tiktoken

from .. import settings

# 1M 토큰당 입력 요금(달러). 요약은 입력이 대부분이라 입력가로 어림한다.
INPUT_PRICE_PER_MILLION = {
    "gpt-4.1": 2.00,
    "gpt-4.1-mini": 0.40,
    "gpt-4.1-nano": 0.10,
    "gpt-4o": 2.50,
    "gpt-4o-mini": 0.15,
    "gpt-5": 1.25,
    "gpt-5-mini": 0.25,
}

MAX_INPUT_CHARACTERS = 8000  # 문서 앞부분만 보낸다. 공문은 앞에 요지가 나온다
MAX_WORKERS = 8

SYSTEM_PROMPT = (
    "당신은 학교 행정 문서를 정리하는 사람입니다. "
    "담당 교사가 '이 업무 어떻게 처리하지?'라고 물었을 때 이 문서를 찾아낼 수 있도록 요약합니다."
)

USER_PROMPT = """다음은 학교 공문서입니다. 3~5문장으로 요약하세요.

반드시 담을 것
- 어떤 업무에 관한 문서인지
- 처리 절차나 해야 할 일
- 기한, 제출 서류, 관련 기관이나 부서가 나오면 함께

넣지 말 것
- 학생·교직원 개인 이름, 전화번호, 이메일, 계좌번호
- "이 문서는", "본 공문은" 같은 군더더기 도입부

제목: {title}
문서번호: {doc_number}
구분: {kind} / {direction}

본문
---
{body}
---"""


@dataclass
class SummaryPlan:
    model: str
    total_documents: int
    already_done: int
    pending: list[dict]
    token_count: int

    @property
    def cost(self) -> float:
        price = INPUT_PRICE_PER_MILLION.get(self.model, 0.0)
        return self.token_count / 1_000_000 * price

    def render(self) -> str:
        return "\n".join(
            [
                f"모델        {self.model}",
                f"전체 문서   {self.total_documents:,}건",
                f"이미 완료   {self.already_done:,}건",
                f"이번에 처리 {len(self.pending):,}건",
                f"입력 토큰   약 {self.token_count:,}개",
                f"예상 요금   약 ${self.cost:.2f} (출력 토큰 요금은 별도)",
            ]
        )


def build_llm(model: str | None = None):
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=model or settings.SUMMARY_MODEL,
        api_key=settings.require_openai_api_key(),
        temperature=0,
        max_retries=5,
        timeout=120,
    )


def document_body(record: dict, limit: int = MAX_INPUT_CHARACTERS) -> str:
    """요약에 넣을 본문. 조각을 이어 붙여 앞부분만 쓴다."""
    text = "\n\n".join(chunk["content"] for chunk in record["chunks"])
    return text[:limit]


def build_prompt(record: dict) -> str:
    return USER_PROMPT.format(
        title=record.get("title") or "(제목 없음)",
        doc_number=record.get("doc_number") or "(없음)",
        kind=record.get("kind") or "(구분 없음)",
        direction={"drafted": "기안한 문서", "received": "접수한 문서"}.get(
            record.get("direction"), "(방향 없음)"
        ),
        body=document_body(record),
    )


def count_tokens(texts: list[str], model: str) -> int:
    try:
        encoding = tiktoken.encoding_for_model(model)
    except KeyError:
        encoding = tiktoken.get_encoding("o200k_base")
    return sum(len(encoding.encode(text)) for text in texts)


def load_summaries(path: Path | None = None) -> dict[str, str]:
    path = path or settings.SUMMARIES_PATH
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as stream:
        return json.load(stream).get("summaries", {})


def save_summaries(summaries: dict[str, str], model: str, path: Path | None = None) -> None:
    path = path or settings.SUMMARIES_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", errors="replace") as stream:
        stream.write(
            json.dumps(
                {"model": model, "count": len(summaries), "summaries": summaries},
                ensure_ascii=False,
            )
        )


def plan(
    records: list[dict],
    done: dict[str, str],
    model: str,
    limit: int | None = None,
) -> SummaryPlan:
    pending = [record for record in records if record["document_id"] not in done]
    if limit is not None:
        pending = pending[:limit]
    return SummaryPlan(
        model=model,
        total_documents=len(records),
        already_done=len(done),
        pending=pending,
        token_count=count_tokens([build_prompt(record) for record in pending], model),
    )


def summarize(llm, record: dict) -> str:
    response = llm.invoke(
        [("system", SYSTEM_PROMPT), ("human", build_prompt(record))]
    )
    return (response.content or "").strip()


def run(
    llm,
    pending: list[dict],
    done: dict[str, str],
    save: Callable[[dict[str, str]], None],
    workers: int = MAX_WORKERS,
    save_every: int = 50,
    on_progress: Callable[[int, int, float], None] | None = None,
) -> dict[str, str]:
    """문서를 여럿 동시에 요약한다. 중간중간 저장해 끊겨도 이어 할 수 있다."""
    summaries = dict(done)
    started = time.time()
    finished = 0

    def work(record: dict) -> tuple[str, str]:
        try:
            return record["document_id"], summarize(llm, record)
        except Exception as exc:  # 한 건 실패로 전체를 버리지 않는다
            print(f"  요약 실패: {record.get('title', '')[:30]} ({exc})", flush=True)
            return record["document_id"], ""

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for document_id, summary in pool.map(work, pending):
            finished += 1
            if summary:
                summaries[document_id] = summary
            if finished % save_every == 0:
                save(summaries)
            if on_progress:
                on_progress(finished, len(pending), time.time() - started)

    save(summaries)
    return summaries
