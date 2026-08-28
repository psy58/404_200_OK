"""질의 응답 서비스.

    질문
     │
     ├─ 검색   두 인덱스에서 근거 조각을 찾는다        → data.documents
     ├─ 업무   질문이나 요청에서 워크플로를 잡는다     → data.workflow / stage / next_actions
     └─ 문장   LLM이 근거를 읽고 설명을 쓴다           → message

구조화 정보(data)는 애플리케이션이 채우고, 자연어 설명(message)만 LLM이 만든다.
API 계약은 이 파일 바깥에서 그대로 유지된다.

엔진이 둘이다.

    RagQueryEngine     실제 검색과 LLM. 벡터 저장소와 API 키가 있을 때 쓴다.
    SampleQueryEngine  고정 응답. 저장소나 키가 없을 때, 그리고 프론트 Mock과
                       계약 테스트에서 쓴다. 계약을 확정할 때 만든 그 응답이다.
"""

import uuid
from datetime import date
from typing import Protocol

from .. import settings
from ..models.common import DocumentResult, NextAction, StageRef, TimelineEntry, WorkflowRef
from ..models.common import StepStatus
from ..models.query import QueryData, QueryRequest, QueryResponse
from . import workflow_matcher, workflow_service

MAX_DOCUMENTS = 5
MAX_NEXT_ACTIONS = 3
SNIPPET_CHARACTERS = 200

MOCK_QUERY_ID = "qry_01HZX3K9"


class QueryEngine(Protocol):
    def answer(self, request: QueryRequest) -> QueryResponse: ...


# --- 업무 흐름 채우기 ---------------------------------------------------------


def _workflow_data(workflow_id: str | None, focus_step_id: str | None = None) -> dict:
    """워크플로에서 현재·다음 단계와 할 일을 뽑는다.

    focus_step_id는 질문이 가리키는 단계다. 진행 순서는 그대로 두고 그 단계만
    할 일 목록 맨 앞으로 올린다. 담당자가 물어본 것을 먼저 보여 주기 위해서다.
    """
    if workflow_id is None:
        return {}

    try:
        detail = workflow_service.get_workflow(workflow_id)
    except Exception:
        return {}  # 없는 업무를 물었다고 질문 자체를 실패시키지 않는다

    completed = [s for s in detail.steps if s.status is StepStatus.COMPLETED]
    current = next((s for s in detail.steps if s.status is StepStatus.CURRENT), None)
    upcoming = [s for s in detail.steps if s.status is not StepStatus.COMPLETED]
    if focus_step_id:
        upcoming.sort(key=lambda step: step.step_id != focus_step_id)

    return {
        "workflow": WorkflowRef(workflow_id=detail.workflow_id, name=detail.name),
        # 사용자가 지금까지 한 일이 current_stage, 앞으로 할 일이 next_stage다.
        "current_stage": (
            StageRef(step_id=completed[-1].step_id, name=completed[-1].name)
            if completed
            else None
        ),
        "next_stage": StageRef(step_id=current.step_id, name=current.name) if current else None,
        "next_actions": [
            NextAction(step_id=step.step_id, title=step.name, description=step.description)
            for step in upcoming[:MAX_NEXT_ACTIONS]
        ],
    }


def _to_contract_timeline(entries) -> list[TimelineEntry]:
    from ..rag import doctype

    return [
        TimelineEntry(
            document_id=entry.document_id,
            title=entry.title,
            date=entry.date,
            kind=doctype.LABEL.get(entry.kind, entry.kind),
            direction=entry.direction,
            audience=entry.audience,
            doc_number=entry.doc_number,
        )
        for entry in entries
    ]


def _timeline(hits) -> list[TimelineEntry]:
    """찾은 문서에서 출발해 같은 사업의 흐름을 시간순으로 만든다.

    연결 그래프(relations.json)가 없으면 빈 목록이다. 답변 자체는 그대로 나간다.
    """
    from ..rag import timeline as timeline_module

    try:
        entries = timeline_module.build([hit.document_id for hit in hits])
    except Exception as exc:
        print(f"[query] 진행 흐름을 만들지 못했습니다: {exc}")
        return []
    return _to_contract_timeline(entries)


def _task_scope(workflow_id: str | None) -> tuple[list[str], list]:
    """업무를 알고 묻는 질문이면 (그 사업의 문서 범위, 작년 처리 흐름).

    화면의 업무 id(wf_/wf26_)일 때만 잡힌다. 흐름은 검색이 아니라 워크플로
    기록에서 오므로 다른 사업 문서가 섞이지 않는다.
    """
    if not workflow_id:
        return [], []
    try:
        from . import frontend_service

        scope = frontend_service.task_document_ids(workflow_id)
        flow = frontend_service.task_flow(workflow_id) if scope else []
        return scope, flow
    except Exception as exc:
        print(f"[query] 업무 범위를 잡지 못했습니다: {exc}")
        return [], []


def _resolve_task_id(workflow_id: str | None) -> str | None:
    """투영 업무 id(wf26_…)를 워크플로 기록 id(wf_…)로 되돌린다."""
    if workflow_id and workflow_id.startswith("wf26_"):
        return "wf_" + workflow_id.removeprefix("wf26_")
    return workflow_id


def _document_results(hits) -> list[DocumentResult]:
    return [
        DocumentResult(
            document_id=hit.document_id,
            chunk_id=hit.chunk_id,
            title=hit.title,
            page=hit.page,
            snippet=" ".join(hit.content.split())[:SNIPPET_CHARACTERS],
            relevance=round(hit.relevance, 3),
        )
        for hit in hits
    ]


# --- 실제 엔진 ---------------------------------------------------------------


class RagQueryEngine:
    """검색과 LLM으로 답한다."""

    def __init__(self, searcher, llm, matcher=None) -> None:
        self.searcher = searcher
        self.llm = llm
        self.matcher = matcher

    @classmethod
    def open(cls) -> "RagQueryEngine":
        from ..rag import answer as answer_module
        from ..rag.retriever import Searcher

        return cls(
            Searcher.open(), answer_module.build_llm(), workflow_matcher.build_matcher()
        )

    def find_workflow(self, request: QueryRequest):
        """요청이 업무를 지정했으면 그대로, 아니면 질문에서 고른다."""
        if request.workflow_id:
            return request.workflow_id, None
        try:
            match = (
                self.matcher.match(request.query)
                if self.matcher
                else workflow_matcher.keyword_match(request.query)
            )
        except (Exception, SystemExit) as exc:
            print(f"[query] 업무 추정 실패: {exc}")
            return None, None
        if match is None:
            return None, None
        return match.workflow_id, match

    def answer(self, request: QueryRequest) -> QueryResponse:
        from ..rag import answer as answer_module

        # 특정 업무를 보며 묻는 질문이면 그 사업의 문서 안에서만 찾는다.
        # 전체를 뒤지면 이름만 비슷한 다른 사업 문서가 근거로 끼어든다.
        scope, flow = _task_scope(request.workflow_id)
        if scope:
            hits = self.searcher.search(
                request.query, k=MAX_DOCUMENTS, document_ids=scope
            )
            if len(hits) < 2:
                # 이 업무 문서에 답이 없다. 범위를 풀어 전체에서 찾되,
                # 흐름은 그대로 이 업무의 작년 기록을 쓴다.
                hits = self.searcher.search(request.query, k=MAX_DOCUMENTS)
        else:
            hits = self.searcher.search(request.query, k=MAX_DOCUMENTS)

        request = request.model_copy(
            update={"workflow_id": _resolve_task_id(request.workflow_id)}
        )
        workflow_id, match = self.find_workflow(request)
        timeline = _to_contract_timeline(flow) if flow else _timeline(hits)
        data = QueryData(
            **_workflow_data(workflow_id, match.step_id if match else None),
            documents=_document_results(hits),
            timeline=timeline,
        )

        context = None
        if data.workflow:
            context = answer_module.WorkflowContext(
                name=data.workflow.name,
                current_stage=data.current_stage.name if data.current_stage else None,
                next_stage=data.next_stage.name if data.next_stage else None,
                focus_stage=match.step_name if match else None,
            )

        try:
            from . import frontend_service

            message = answer_module.write_message(
                self.llm, request.query, hits, context, timeline,
                today=frontend_service._today(),
            )
        except Exception as exc:
            # 문장을 못 만들어도 근거 문서는 돌려준다. 화면이 비지 않는다.
            print(f"[query] 답변 문장 생성 실패: {exc}")
            message = answer_module.FALLBACK_MESSAGE

        return QueryResponse(
            query_id=f"qry_{uuid.uuid4().hex[:8]}", message=message, data=data
        )


class SampleQueryEngine:
    """고정 응답. 계약 형태를 보여 주기 위한 것이다."""

    def answer(self, request: QueryRequest) -> QueryResponse:
        return QueryResponse(
            query_id=MOCK_QUERY_ID,
            message=(
                "학생 선발이 완료되었으므로 다음 단계는 참가 신청입니다. "
                "참가 신청서에는 학교장 결재가 필요하며, 대회 개최일 30일 전까지 "
                "제출해야 합니다."
            ),
            data=QueryData(
                workflow=WorkflowRef(
                    workflow_id="science_competition", name="과학대회 참가"
                ),
                current_stage=StageRef(step_id="2", name="학생 선발"),
                next_stage=StageRef(step_id="3", name="참가 신청"),
                next_actions=[
                    NextAction(
                        step_id="3",
                        title="참가 신청서 제출",
                        description="학생 명단을 첨부해 참가 신청서를 제출합니다.",
                    ),
                    NextAction(
                        step_id="4",
                        title="내부 결재 상신",
                        description="참가 신청 전 학교장 결재를 받습니다.",
                    ),
                    NextAction(
                        step_id=None,
                        title="보호자 동의서 수합",
                        description="개인정보 제공 동의서를 미리 받아 둡니다.",
                    ),
                ],
                timeline=[
                    TimelineEntry(
                        document_id="doc_school_2025_10129",
                        title="2025학년도 토요과학교실(3차) 운영 계획",
                        date=date(2025, 8, 14),
                        kind="계획",
                        direction="drafted",
                        audience="내부 진행",
                        doc_number="숭의여자고등학교-10129",
                    ),
                    TimelineEntry(
                        document_id="doc_2026_competition_guide",
                        title="2026 학생 교외대회 참가 지침",
                        date=date(2026, 1, 15),
                        kind="지침",
                        direction="received",
                        audience="교육청 수신",
                        doc_number="서울특별시교육청-2026-1043",
                    ),
                ],
                documents=[
                    DocumentResult(
                        document_id="doc_2026_competition_guide",
                        chunk_id="chunk_0142",
                        title="2026 학생 교외대회 참가 지침",
                        page=12,
                        snippet=(
                            "교외대회 참가 신청은 대회 개최일 30일 전까지 "
                            "학교장 결재를 거쳐 제출한다."
                        ),
                        relevance=0.87,
                    ),
                    DocumentResult(
                        document_id="doc_school_2025_10129",
                        chunk_id="chunk_0007",
                        title="2025학년도 토요과학교실(3차) 운영 계획",
                        page=2,
                        snippet="운영 계획 수립 후 지출품의서를 함께 상신한다.",
                        relevance=0.61,
                    ),
                ],
            ),
        )


# --- 엔진 고르기 -------------------------------------------------------------

_engine: QueryEngine | None = None


def vectors_ready() -> bool:
    return (settings.VECTOR_DIR / "chroma.sqlite3").exists()


def build_engine() -> QueryEngine:
    """쓸 수 있으면 실제 엔진, 아니면 고정 응답 엔진."""
    if not (settings.openai_api_key() and vectors_ready()):
        return SampleQueryEngine()
    try:
        return RagQueryEngine.open()
    except (Exception, SystemExit) as exc:
        print(f"[query] 검색 엔진을 열지 못해 예시 응답으로 답합니다: {exc}")
        return SampleQueryEngine()


def get_engine() -> QueryEngine:
    global _engine
    if _engine is None:
        _engine = build_engine()
    return _engine


def set_engine(engine: QueryEngine | None) -> None:
    """엔진을 바꿔 끼운다. 테스트와 계약 산출물 생성에서 쓴다."""
    global _engine
    _engine = engine


def answer_query(request: QueryRequest) -> QueryResponse:
    """질문 하나에 대한 업무 안내를 만든다."""
    return get_engine().answer(request)
