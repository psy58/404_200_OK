"""찾아낸 문서들을 시간순으로 늘어놓는다.

"이 업무가 어떻게 진행됐나요"라는 질문에는 조각 몇 개로 답할 수 없다.
공모 안내를 받고, 신청하고, 선정되고, 운영 계획을 세우고, 정산하는 흐름을
날짜와 함께 보여 주어야 담당자가 지금 어디쯤인지 안다.

    2025-08-18  받음  AI 중심학교 2차 공모 선정 결과      (안내·공모)
    2025-08-20  받음  중심학교 운영비 교부                 (지출·정산)
    2025-09-19  기안  예산 및 운영 계획서                  (계획)
    2025-12-05  기안  운영 결과보고서 제출                 (결과보고)

재료는 이미 있다. 검색으로 찾은 문서에서 출발해, 공문 분석으로 만들어 둔
연결(relations.json)을 한 걸음 따라가 같은 사업의 문서를 모으고, 날짜순으로
정렬한다. 새로 부르는 API는 없다.
"""

from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

from .. import settings
from . import doctype

MAX_ENTRIES = 20  # 월별 흐름을 물으면 열 건 남짓으로는 모자라다
MAX_SEED_DOCUMENTS = 8

# 담당자가 알고 싶은 것은 "이걸 교육청에 내야 하나, 우리끼리 하면 되나"다.
EXTERNAL = "교육청 제출"  # 우리가 기안해 밖으로 보낸 문서
INTERNAL = "내부 진행"  # 내부결재로 끝난 문서
INCOMING = "교육청 수신"  # 받은 공문
INTERNAL_RECIPIENTS = ("내부결재", "내부 결재")

# 흐름을 보여 주는 데 도움이 되는 종류만 싣는다. 빈 서식과 명단은 사업의
# 진행을 말해 주지 않는다.
INCLUDED_KINDS = frozenset(
    {doctype.PLAN, doctype.GUIDE, doctype.NOTICE, doctype.REPORT, doctype.SPENDING, doctype.MEETING}
)

# 같은 사업으로 이어 주는 연결. 첨부는 같은 공문의 부속이라 따로 세지 않는다.
FOLLOWED_EDGES = frozenset({"related", "follow_up", "same_topic", "likely_follow_up"})


@dataclass
class TimelineEntry:
    document_id: str
    title: str
    date: str | None  # ISO 날짜. 날짜를 못 찾은 문서도 있다
    kind: str
    direction: str | None  # drafted / received
    audience: str = INTERNAL  # 교육청 제출 / 내부 진행 / 교육청 수신
    doc_number: str | None = None

    @property
    def month(self) -> str | None:
        return self.date[:7] if self.date else None


def audience_of(node: dict) -> str:
    """이 문서가 밖으로 나가는 것인지 안에서 끝나는 것인지.

    기안 문서의 수신이 "내부결재"면 학교 안에서 끝난 일이고, 교육청이나 다른
    학교면 내보낸 일이다. 받은 공문은 교육청에서 온 것으로 본다.
    """
    if node.get("direction") == "received":
        return INCOMING
    recipient = (node.get("recipient") or "").strip()
    if not recipient or recipient.startswith(INTERNAL_RECIPIENTS):
        return INTERNAL
    return EXTERNAL


_graph: dict | None = None


def load_graph(path: Path | None = None) -> dict:
    """연결 그래프를 한 번만 읽어 둔다."""
    global _graph
    if _graph is None:
        from ..ingest import relations

        _graph = relations.load(path or settings.DATA_DIR / "relations.json")
    return _graph


def reset_cache() -> None:
    global _graph
    _graph = None


def _event_date(node: dict) -> str | None:
    for key in ("approval_date", "issuing_date", "receipt_date"):
        if node.get(key):
            return node[key]
    return None


def _sort_key(entry: TimelineEntry) -> tuple[int, date]:
    """날짜가 있는 것부터 시간순으로. 날짜를 모르는 문서는 뒤로 보낸다."""
    if not entry.date:
        return (1, date.max)
    try:
        return (0, datetime.strptime(entry.date, "%Y-%m-%d").date())
    except ValueError:
        return (1, date.max)


def _neighbours(graph: dict, document_id: str) -> list[str]:
    """이어진 문서. 양쪽 방향을 다 본다.

    "어떻게 진행됐나"는 대개 앞선 문서를 묻는 말이다. 나가는 연결만 따라가면
    이 문서를 낳은 공모 안내나 지정 계획으로 거슬러 올라가지 못한다.
    """
    linked = []
    for edge in graph.get("edges", []):
        if edge["type"] not in FOLLOWED_EDGES:
            continue
        if edge["source"] == document_id:
            linked.append(edge["target"])
        elif edge["target"] == document_id:
            linked.append(edge["source"])
    return linked


def _parents(graph: dict) -> dict[str, str]:
    """첨부 → 그 첨부가 딸린 본문.

    날짜와 문서번호는 본문 꼬리말에만 있다. 검색은 대개 알맹이가 든 첨부를
    집어 오므로, 흐름을 그릴 때는 본문으로 올려 잡아야 날짜가 붙는다.
    """
    return {
        edge["target"]: edge["source"]
        for edge in graph.get("edges", [])
        if edge["type"] == "attachment"
    }


def build(
    document_ids: list[str],
    graph: dict | None = None,
    limit: int = MAX_ENTRIES,
) -> list[TimelineEntry]:
    """검색으로 찾은 문서에서 출발해 같은 사업의 흐름을 만든다."""
    graph = graph if graph is not None else load_graph()
    nodes = graph.get("nodes", {})
    if not nodes:
        return []

    parents = _parents(graph)

    def to_body(document_id: str) -> str:
        """첨부면 본문으로 바꾼다."""
        return parents.get(document_id, document_id)

    # 검색 결과와 그 이웃을 모은다. 이웃까지 한 걸음만 간다.
    collected: dict[str, dict] = {}
    for document_id in document_ids[:MAX_SEED_DOCUMENTS]:
        seed = to_body(document_id)
        for candidate in [seed, *(to_body(n) for n in _neighbours(graph, seed))]:
            node = nodes.get(candidate)
            if node is not None:
                collected.setdefault(candidate, node)

    entries: list[TimelineEntry] = []
    seen_titles: set[str] = set()
    for document_id, node in collected.items():
        kind = doctype.classify(node.get("title"), node.get("subject"))
        if kind not in INCLUDED_KINDS:
            continue

        title = " ".join((node.get("title") or "").split())
        if not title or title in seen_titles:
            continue  # 같은 공문을 두 번 받은 경우가 있다
        seen_titles.add(title)

        entries.append(
            TimelineEntry(
                document_id=document_id,
                title=title,
                date=_event_date(node),
                kind=kind,
                direction=node.get("direction"),
                audience=audience_of(node),
                doc_number=node.get("doc_number"),
            )
        )

    entries.sort(key=_sort_key)
    return entries[:limit]
