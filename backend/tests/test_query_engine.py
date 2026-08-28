#!/usr/bin/env python3 -m pytest
"""/query 안쪽: 검색 결과와 워크플로를 계약 형태로 옮기는 부분.

OpenAI를 부르지 않는다. 검색기와 LLM 자리에 가짜를 끼운다.
"""

import pytest
from langchain_core.language_models import FakeListChatModel

from app.models.query import QueryRequest
from app.rag import answer as answer_module
from app.rag.retriever import Hit
from app.services import query_service
from app.services.query_service import RagQueryEngine, SampleQueryEngine


class FakeSearcher:
    def __init__(self, hits: list[Hit]) -> None:
        self.hits = hits
        self.queries: list[str] = []

    def search(self, query: str, k: int = 5, **kwargs) -> list[Hit]:
        self.queries.append(query)
        return self.hits[:k]


class BrokenLLM:
    def invoke(self, *args, **kwargs):
        raise RuntimeError("LLM이 응답하지 않음")


def make_hit(**overrides) -> Hit:
    values = {
        "document_id": "doc_a",
        "chunk_id": "chunk_0001",
        "title": "과학대회 참가 지침",
        "content": "참가 신청은 " + "대회 30일 전까지 제출한다. " * 30,
        "relevance": 0.8123,
        "page": 12,
    }
    values.update(overrides)
    return Hit(**values)


def engine(hits: list[Hit], responses: list[str] | None = None) -> RagQueryEngine:
    return RagQueryEngine(
        FakeSearcher(hits), FakeListChatModel(responses=responses or ["안내 문장입니다."])
    )


def test_hits_become_documents_the_front_can_link_to() -> None:
    response = engine([make_hit()]).answer(QueryRequest(query="참가 신청 서류"))

    document = response.data.documents[0]
    assert document.document_id == "doc_a"
    assert document.chunk_id == "chunk_0001"  # 문서 조회 API 경로에 그대로 쓴다
    assert document.page == 12
    assert document.relevance == 0.812
    assert len(document.snippet) <= query_service.SNIPPET_CHARACTERS


def test_documents_keep_the_search_order() -> None:
    hits = [
        make_hit(chunk_id="chunk_0001", relevance=0.9),
        make_hit(chunk_id="chunk_0002", relevance=0.5),
    ]
    response = engine(hits).answer(QueryRequest(query="서류"))
    assert [d.relevance for d in response.data.documents] == [0.9, 0.5]


def test_workflow_from_the_request_fills_the_stages() -> None:
    response = engine([make_hit()]).answer(
        QueryRequest(query="다음 단계는?", workflow_id="science_competition")
    )

    data = response.data
    assert data.workflow.workflow_id == "science_competition"
    assert data.current_stage.name == "학생 선발"  # 마지막으로 끝낸 단계
    assert data.next_stage.name == "참가 신청"  # 지금 해야 할 단계
    assert [action.title for action in data.next_actions][:2] == ["참가 신청", "내부 결재"]
    assert all(action.step_id for action in data.next_actions)


def test_workflow_is_guessed_when_the_request_does_not_say() -> None:
    response = engine([make_hit()]).answer(
        QueryRequest(query="과학대회 참가 신청은 어떻게 하나요")
    )
    assert response.data.workflow.workflow_id == "science_competition"


def test_unrelated_question_gets_documents_without_a_workflow() -> None:
    """업무를 못 잡아도 근거 문서는 돌려준다."""
    response = engine([make_hit()]).answer(QueryRequest(query="복사기 토너 교체"))
    assert response.data.workflow is None
    assert response.data.next_actions == []
    assert response.data.documents


def test_unknown_workflow_id_does_not_break_the_answer() -> None:
    response = engine([make_hit()]).answer(
        QueryRequest(query="다음 단계", workflow_id="없는업무")
    )
    assert response.data.workflow is None
    assert response.data.documents


def test_no_evidence_means_no_invented_answer() -> None:
    """근거 없이 그럴듯한 문장을 만들어 내는 것이 가장 나쁜 실패다."""
    response = engine([]).answer(QueryRequest(query="아무도 모르는 업무"))
    assert response.message == answer_module.NO_EVIDENCE_MESSAGE
    assert response.data.documents == []


def test_llm_failure_still_returns_the_evidence() -> None:
    broken = RagQueryEngine(FakeSearcher([make_hit()]), BrokenLLM())
    response = broken.answer(QueryRequest(query="참가 신청 서류"))

    assert response.message == answer_module.FALLBACK_MESSAGE
    assert response.data.documents  # 화면이 비지 않는다


def test_evidence_prompt_carries_the_workflow_stage() -> None:
    context = answer_module.WorkflowContext(
        name="과학대회 참가", current_stage="학생 선발", next_stage="참가 신청"
    )
    prompt = answer_module.build_prompt("서류가 뭔가요", [make_hit()], context)
    assert "과학대회 참가" in prompt
    assert "다음 단계: 참가 신청" in prompt
    assert "근거 1" in prompt


def test_query_ids_are_unique_per_answer() -> None:
    rag = engine([make_hit()], responses=["가", "나"])
    first = rag.answer(QueryRequest(query="질문 1")).query_id
    second = rag.answer(QueryRequest(query="질문 2")).query_id
    assert first != second


def test_sample_engine_is_used_without_a_key_or_index(monkeypatch) -> None:
    """키나 벡터 저장소가 없으면 예시 응답으로 뜬다. 서버가 죽지 않는다."""
    monkeypatch.setattr(query_service.settings, "openai_api_key", lambda: None)
    assert isinstance(query_service.build_engine(), SampleQueryEngine)

    monkeypatch.setattr(query_service.settings, "openai_api_key", lambda: "sk-test")
    monkeypatch.setattr(query_service, "vectors_ready", lambda: False)
    assert isinstance(query_service.build_engine(), SampleQueryEngine)


def test_broken_search_engine_falls_back_instead_of_failing(monkeypatch) -> None:
    monkeypatch.setattr(query_service.settings, "openai_api_key", lambda: "sk-test")
    monkeypatch.setattr(query_service, "vectors_ready", lambda: True)
    monkeypatch.setattr(
        RagQueryEngine,
        "open",
        classmethod(lambda cls: (_ for _ in ()).throw(RuntimeError("저장소 없음"))),
    )
    assert isinstance(query_service.build_engine(), SampleQueryEngine)


def test_api_uses_whatever_engine_is_installed(client) -> None:
    """conftest가 끼운 고정 응답 엔진이 그대로 나간다."""
    body = client.post("/api/v1/query", json={"query": "과학대회"}).json()
    assert body["query_id"] == query_service.MOCK_QUERY_ID

    query_service.set_engine(engine([make_hit(title="바뀐 문서")]))
    body = client.post("/api/v1/query", json={"query": "과학대회"}).json()
    assert body["data"]["documents"][0]["title"] == "바뀐 문서"


@pytest.mark.parametrize("query", ["", "x" * 1001])
def test_invalid_queries_never_reach_the_engine(client, query: str) -> None:
    assert client.post("/api/v1/query", json={"query": query}).status_code == 422


class FakeMatcher:
    def __init__(self, match) -> None:
        self.match_result = match

    def match(self, query: str):
        return self.match_result


def test_focused_step_comes_first_in_next_actions() -> None:
    """담당자가 물어본 단계를 할 일 목록 맨 앞에 놓는다."""
    from app.services.workflow_matcher import WorkflowMatch

    rag = RagQueryEngine(
        FakeSearcher([make_hit()]),
        FakeListChatModel(responses=["안내"]),
        FakeMatcher(
            WorkflowMatch(
                workflow_id="science_competition",
                name="과학대회 참가",
                score=0.6,
                step_id="5",
                step_name="결과 보고",
            )
        ),
    )
    response = rag.answer(QueryRequest(query="결과 보고서는 언제 내나요"))

    assert response.data.next_actions[0].title == "결과 보고"
    # 진행 상태는 그대로다. 물어봤다고 단계가 건너뛰어지지 않는다.
    assert response.data.next_stage.name == "참가 신청"


def test_matcher_failure_falls_back_to_no_workflow() -> None:
    class BrokenMatcher:
        def match(self, query: str):
            raise RuntimeError("임베딩 서버 오류")

    rag = RagQueryEngine(
        FakeSearcher([make_hit()]), FakeListChatModel(responses=["안내"]), BrokenMatcher()
    )
    response = rag.answer(QueryRequest(query="과학대회 참가"))

    assert response.data.workflow is None
    assert response.data.documents  # 근거는 그대로 나간다


def test_request_workflow_id_wins_over_the_matcher() -> None:
    from app.services.workflow_matcher import WorkflowMatch

    rag = RagQueryEngine(
        FakeSearcher([make_hit()]),
        FakeListChatModel(responses=["안내"]),
        FakeMatcher(
            WorkflowMatch(workflow_id="saturday_science_class", name="토요과학교실 운영", score=0.9)
        ),
    )
    response = rag.answer(
        QueryRequest(query="다음 단계", workflow_id="science_competition")
    )
    assert response.data.workflow.workflow_id == "science_competition"


# --- 시기를 묻는 질문 ---------------------------------------------------------


def test_timeline_is_grouped_by_month_in_the_prompt() -> None:
    """월별 흐름을 물으면 재료도 월별로 보여 주어야 한다.

    날짜만 죽 늘어놓으면 문서 목록을 그대로 옮겨 적는 답이 나온다.
    """
    from app.rag.timeline import TimelineEntry

    entries = [
        TimelineEntry("d1", "예산 교부 계획 안내", "2025-03-07", "계획", "received", "교육청 수신"),
        TimelineEntry("d2", "운영위원회 구성", "2025-03-10", "회의", "drafted", "내부 진행"),
        TimelineEntry("d3", "운영 계획 제출", "2025-04-21", "계획", "drafted", "교육청 제출"),
    ]
    text = answer_module.format_timeline(entries)

    assert text.count("[2025-03]") == 1  # 같은 달은 한 번만 묶는다
    assert "[2025-04]" in text
    assert "(교육청 수신) 예산 교부 계획 안내" in text
    assert "(교육청 제출) 운영 계획 제출" in text


def test_prompt_asks_for_a_monthly_summary() -> None:
    prompt = answer_module.build_prompt("월별로 정리해줘", [make_hit()], None, [])
    assert "월별로" in prompt
    assert "교육청 제출" in prompt and "내부 진행" in prompt


def test_timeline_reaches_the_model() -> None:
    from app.rag.timeline import TimelineEntry

    entry = TimelineEntry("d1", "운영위원회 구성", "2025-03-10", "회의", "drafted", "내부 진행")
    prompt = answer_module.build_prompt("어떻게 진행됐나요", [make_hit()], None, [entry])
    assert "운영위원회 구성" in prompt


def test_entries_without_dates_are_still_shown() -> None:
    from app.rag.timeline import TimelineEntry

    text = answer_module.format_timeline(
        [TimelineEntry("d1", "제목", None, "계획", "drafted", "내부 진행")]
    )
    assert "날짜 미상" in text


# --- 업무 범위 질의 -----------------------------------------------------------
#
# 특정 업무를 보며 물으면 그 사업의 문서 안에서만 찾아야 한다. 전체를 뒤지면
# 이름만 비슷한 다른 사업 문서가 근거로 끼어든다(실제로 그랬다).


class ScopeRecordingSearcher:
    def __init__(self, hits_by_mode: dict) -> None:
        self.hits_by_mode = hits_by_mode
        self.calls: list[dict] = []

    def search(self, query: str, k: int = 5, **kwargs):
        self.calls.append(kwargs)
        mode = "scoped" if kwargs.get("document_ids") else "global"
        return self.hits_by_mode.get(mode, [])


@pytest.fixture
def scoped_setup(monkeypatch):
    from app.rag.timeline import TimelineEntry
    from app.services import frontend_service

    monkeypatch.setattr(
        frontend_service, "task_document_ids", lambda task_id: ["doc_a", "doc_att"]
    )
    monkeypatch.setattr(
        frontend_service,
        "task_flow",
        lambda task_id: [
            TimelineEntry("doc_a", "[공모·안내] 공모 접수", "2025-08-05", "공모안내", "received", "교육청 수신"),
            TimelineEntry("doc_a", "[계획 수립] 운영 계획서", "2025-09-19", "계획수립", "drafted", "내부 진행"),
        ],
    )


def test_asking_about_a_task_searches_only_its_documents(scoped_setup) -> None:
    searcher = ScopeRecordingSearcher({"scoped": [make_hit(), make_hit(chunk_id="c2")]})
    engine = RagQueryEngine(searcher, FakeListChatModel(responses=["안내"]))

    engine.answer(QueryRequest(query="작년에 어떤 순서로?", workflow_id="wf_abc"))

    assert searcher.calls[0]["document_ids"] == ["doc_a", "doc_att"]
    assert len(searcher.calls) == 1  # 범위 안에서 충분하면 전체 검색은 없다


def test_scoped_timeline_comes_from_the_workflow_record(scoped_setup) -> None:
    searcher = ScopeRecordingSearcher({"scoped": [make_hit(), make_hit(chunk_id="c2")]})
    engine = RagQueryEngine(searcher, FakeListChatModel(responses=["안내"]))

    response = engine.answer(QueryRequest(query="순서", workflow_id="wf_abc"))

    titles = [e.title for e in response.data.timeline]
    assert titles == ["[공모·안내] 공모 접수", "[계획 수립] 운영 계획서"]


def test_scope_falls_back_to_global_when_the_answer_is_elsewhere(scoped_setup) -> None:
    """이 업무 문서에 답이 없으면 범위를 풀되, 흐름은 이 업무 것을 유지한다."""
    searcher = ScopeRecordingSearcher(
        {"scoped": [], "global": [make_hit(), make_hit(chunk_id="c2")]}
    )
    engine = RagQueryEngine(searcher, FakeListChatModel(responses=["안내"]))

    response = engine.answer(QueryRequest(query="다른 질문", workflow_id="wf_abc"))

    assert len(searcher.calls) == 2
    assert searcher.calls[1].get("document_ids") is None
    assert response.data.timeline  # 흐름은 여전히 업무 기록에서


def test_projected_task_id_resolves_to_its_base_workflow(monkeypatch) -> None:
    from app.services import frontend_service, query_service

    captured = {}
    monkeypatch.setattr(
        frontend_service, "task_document_ids",
        lambda task_id: captured.setdefault("scope_id", task_id) and [],
    )
    engine = RagQueryEngine(FakeSearcher([make_hit()]), FakeListChatModel(responses=["안내"]))
    engine.answer(QueryRequest(query="질문", workflow_id="wf26_abc123"))

    assert captured["scope_id"] == "wf26_abc123"  # 범위는 화면 id 그대로 푼다
    assert query_service._resolve_task_id("wf26_abc123") == "wf_abc123"


def test_prompt_anchors_what_last_year_means() -> None:
    """기준을 안 주면 모델이 문서의 연도를 올해로 착각한다. 실제로 그랬다."""
    from datetime import date

    prompt = answer_module.build_prompt(
        "작년에 어떤 순서로?", [make_hit()], None, [], today=date(2026, 8, 29)
    )
    assert "2026학년도" in prompt
    assert "'작년'은 2025학년도" in prompt

    january = answer_module.build_prompt(
        "질문", [make_hit()], None, [], today=date(2026, 1, 15)
    )
    assert "2025학년도" in january  # 1월은 아직 2025학년도다
