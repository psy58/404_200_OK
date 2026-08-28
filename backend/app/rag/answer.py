"""찾아온 근거로 사용자에게 보여 줄 답변 문장을 만든다.

LLM이 만드는 것은 message 하나뿐이다. 워크플로 단계나 문서 목록 같은
구조화 정보는 애플리케이션이 채운다(API 계약 13항). LLM이 JSON을 통째로
지어내게 하면 화면이 무엇을 받을지 보장할 수 없다.
"""

from dataclasses import dataclass

from .. import settings
from .retriever import Hit

MAX_EVIDENCE = 8  # 넓게 답하려면 근거도 넓어야 한다
MAX_EVIDENCE_CHARACTERS = 700

SYSTEM_PROMPT = (
    "당신은 학교 행정 업무를 돕는 안내자입니다. "
    "주어진 근거 문서에 있는 내용만으로 답합니다. "
    "근거에 없는 절차나 기한을 지어내지 않습니다."
)

USER_PROMPT = """담당 교사의 질문에 답하세요.

규칙
- 근거 문서와 진행 기록에 있는 내용만 씁니다. 없으면 "관련 문서에서 확인되지 않습니다"라고 밝힙니다.
- **질문이 시기·순서·흐름을 묻는다면**(월별, 언제, 어떤 순서로, 어떻게 진행) 진행 기록을
  **월별로 묶어** 정리합니다.
    - 달마다 그 달에 한 일을 한두 줄로 적습니다.
    - 각 줄 앞에 [교육청 제출] [내부 진행] [교육청 수신] 중 하나를 붙여 구분합니다.
    - 문서 제목을 그대로 옮기지 말고 무슨 일이었는지 풀어 씁니다.
    - 마지막에 처음 맡은 사람이 눈여겨볼 점을 한 줄 덧붙입니다.
- 그 밖의 질문에는 2~4문장으로 답합니다. 기한, 제출 서류, 담당 기관이 근거에 있으면
  반드시 포함합니다.
- 존댓말로, 군더더기 없이 씁니다.

질문
{query}
{reference_frame}{workflow_context}
진행 기록 (날짜순)
---
{timeline}
---

근거 문서
---
{evidence}
---"""

NO_EVIDENCE_MESSAGE = (
    "관련 문서를 찾지 못했습니다. 질문을 조금 더 구체적으로 적어 주시거나, "
    "업무 이름으로 다시 물어봐 주세요."
)

FALLBACK_MESSAGE = (
    "답변 문장을 만들지 못했습니다. 아래 근거 문서를 직접 확인해 주세요."
)


@dataclass
class WorkflowContext:
    """답변에 함께 알려 줄 업무 진행 상황.

    focus_stage는 질문이 가리키는 단계다. 진행 상태(next_stage)와 다를 수 있다.
    담당자가 아직 오지 않은 단계를 미리 물어보는 일이 흔하다.
    """

    name: str
    current_stage: str | None
    next_stage: str | None
    focus_stage: str | None = None

    def render(self) -> str:
        lines = [f"\n현재 업무: {self.name}"]
        if self.current_stage:
            lines.append(f"완료된 단계: {self.current_stage}")
        if self.next_stage:
            lines.append(f"다음 단계: {self.next_stage}")
        if self.focus_stage and self.focus_stage != self.next_stage:
            lines.append(f"질문이 가리키는 단계: {self.focus_stage}")
        return "\n".join(lines) + "\n"


def build_llm(model: str | None = None):
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=model or settings.ANSWER_MODEL,
        api_key=settings.require_openai_api_key(),
        temperature=0,
        max_retries=3,
        timeout=60,
    )


def format_evidence(hits: list[Hit]) -> str:
    parts = []
    for index, hit in enumerate(hits[:MAX_EVIDENCE], start=1):
        text = " ".join(hit.content.split())[:MAX_EVIDENCE_CHARACTERS]
        parts.append(f"[근거 {index}] {hit.title}\n{text}")
    return "\n\n".join(parts)


def format_timeline(entries) -> str:
    """진행 기록을 월별로 묶어 프롬프트에 넣는다.

    LLM이 월별로 정리하려면 재료가 월별로 보여야 한다. 날짜만 죽 늘어놓으면
    문서 목록을 그대로 옮겨 적는 답이 나온다.
    """
    if not entries:
        return "(이어진 문서를 찾지 못했습니다)"

    lines = []
    last_month = None
    for entry in entries:
        # 날짜는 문자열로 올 때도 있고 date 객체로 올 때도 있다.
        raw = entry.date
        if raw is None:
            month = "날짜 미상"
        elif hasattr(raw, "strftime"):
            month = raw.strftime("%Y-%m")
        else:
            month = str(raw)[:7]
        if month != last_month:
            lines.append(f"[{month}]")
            last_month = month
        audience = getattr(entry, "audience", None) or ""
        lines.append(f"  - ({audience}) {entry.title}")
    return "\n".join(lines)


def _reference_frame(today) -> str:
    """"작년"이 언제인지 못 박는다.

    문서가 전부 지난 학년도 것이라, 기준을 안 주면 모델이 문서의 연도를
    올해로 착각하고 "작년 기록은 없다"고 답한다. 실제로 그랬다.
    """
    if today is None:
        return ""
    year = today.year if today.month >= 3 else today.year - 1
    return (
        f"\n오늘은 {today.isoformat()}, 지금은 {year}학년도다. "
        f"질문의 '작년'은 {year - 1}학년도({year - 1}년 3월~{year}년 2월)를 뜻한다. "
        f"진행 기록의 날짜가 그 시기라면 그것이 곧 작년 기록이다.\n"
    )


def build_prompt(
    query: str,
    hits: list[Hit],
    workflow: WorkflowContext | None,
    timeline=None,
    today=None,
) -> str:
    return USER_PROMPT.format(
        query=query,
        reference_frame=_reference_frame(today),
        workflow_context=workflow.render() if workflow else "",
        timeline=format_timeline(timeline or []),
        evidence=format_evidence(hits),
    )


def write_message(
    llm,
    query: str,
    hits: list[Hit],
    workflow: WorkflowContext | None = None,
    timeline=None,
    today=None,
) -> str:
    """답변 문장 하나를 만든다.

    근거가 없으면 LLM을 부르지 않는다. 부를 이유도 없고, 근거 없이 그럴듯한
    문장을 만들어 내는 것이 이 서비스에서 가장 나쁜 실패다.
    """
    if not hits:
        return NO_EVIDENCE_MESSAGE

    response = llm.invoke(
        [
            ("system", SYSTEM_PROMPT),
            ("human", build_prompt(query, hits, workflow, timeline, today)),
        ]
    )
    return (response.content or "").strip() or FALLBACK_MESSAGE
