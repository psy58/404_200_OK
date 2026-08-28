#!/usr/bin/env python3 -m pytest
"""3단계: 요약, 임베딩, 두 단계 검색.

OpenAI를 부르지 않는다. 임베딩과 LLM 자리에 가짜를 끼워 넣고,
저장·건너뛰기·거르기·두 단계 연결만 확인한다.
"""

import json
from pathlib import Path

import pytest
from langchain_core.embeddings import DeterministicFakeEmbedding
from langchain_core.language_models import FakeListChatModel

from app.rag import embedder, store, summarizer
from app.rag.retriever import Searcher

FAKE_DIMENSIONS = 64

DOCUMENT_RECORDS = [
    {
        "document_id": "doc_a",
        "title": "과학대회 참가 지침",
        "doc_number": "숭의여자고등학교-1001",
        "kind": "본문",
        "direction": "drafted",
        "source_type": "hwp",
        "page_count": None,
        "chunks": [
            {
                "chunk_id": "chunk_0000",
                "page": None,
                "section": "참가 절차",
                "content": "참가 신청은 대회 30일 전까지 제출한다.",
            },
            {
                "chunk_id": "chunk_0001",
                "page": None,
                "section": None,
                "content": "보호자 동의서를 함께 받는다.",
            },
        ],
    },
    {
        "document_id": "doc_b",
        "title": "출장 여비 지급 안내",
        "doc_number": None,
        "kind": None,
        "direction": "received",
        "source_type": "pdf",
        "page_count": 3,
        "chunks": [
            {
                "chunk_id": "chunk_0000",
                "page": 2,
                "section": None,
                "content": "여비는 출장 종료 후 14일 안에 청구한다.",
            }
        ],
    },
]


@pytest.fixture
def embeddings() -> DeterministicFakeEmbedding:
    return DeterministicFakeEmbedding(size=FAKE_DIMENSIONS)


@pytest.fixture
def documents_path(tmp_path: Path) -> Path:
    path = tmp_path / "documents.json"
    path.write_text(
        json.dumps({"documents": DOCUMENT_RECORDS}, ensure_ascii=False), encoding="utf-8"
    )
    return path


@pytest.fixture
def summaries_path(tmp_path: Path) -> Path:
    path = tmp_path / "summaries.json"
    summarizer.save_summaries(
        {"doc_a": "과학대회 참가 신청 절차와 제출 서류를 안내하는 문서."},
        "gpt-4.1",
        path,
    )
    return path


# --- 조각·요약을 Document로 읽기 ---------------------------------------------


def test_chunk_uid_joins_document_and_chunk() -> None:
    assert store.chunk_uid("doc_a", "chunk_0001") == "doc_a:chunk_0001"


def test_metadata_drops_empty_values() -> None:
    """Chroma는 None을 받지 않는다."""
    cleaned = store.clean_metadata(
        {"document_id": "doc_a", "doc_number": None, "title": "", "page": 2}
    )
    assert cleaned == {"document_id": "doc_a", "page": 2}


def test_chunk_documents_carry_document_metadata(documents_path: Path) -> None:
    documents = store.load_chunk_documents(documents_path)
    assert len(documents) == 3

    first = documents[0]
    assert first.id == "doc_a:chunk_0000"
    assert first.metadata["title"] == "과학대회 참가 지침"
    assert first.metadata["direction"] == "drafted"
    assert "doc_number" not in documents[2].metadata  # None은 빠진다


def test_summary_documents_include_title_and_number(
    summaries_path: Path, documents_path: Path
) -> None:
    """제목이나 공문 번호로 찾는 질문이 많아 요약 앞에 붙여 임베딩한다."""
    documents = store.load_summary_documents(summaries_path, documents_path)
    assert len(documents) == 1

    document = documents[0]
    assert document.id == "doc_a"  # 문서 하나에 벡터 하나
    assert "과학대회 참가 지침" in document.page_content
    assert "숭의여자고등학교-1001" in document.page_content


def test_missing_input_files_are_reported(tmp_path: Path) -> None:
    with pytest.raises(SystemExit):
        store.load_chunk_documents(tmp_path / "없는파일.json")
    with pytest.raises(SystemExit):
        store.load_summary_documents(tmp_path / "없는요약.json", tmp_path / "x.json")


# --- 요약 만들기 -------------------------------------------------------------


def test_summary_prompt_carries_the_business_context() -> None:
    prompt = summarizer.build_prompt(DOCUMENT_RECORDS[0])
    assert "과학대회 참가 지침" in prompt
    assert "숭의여자고등학교-1001" in prompt
    assert "참가 신청은 대회 30일 전까지" in prompt
    assert "기한" in prompt  # 무엇을 담아야 하는지 지시한다


def test_summary_prompt_forbids_personal_details() -> None:
    """요약은 본문보다 여러 곳을 돌아다닌다. 이름·연락처를 넣지 않게 한다."""
    prompt = summarizer.build_prompt(DOCUMENT_RECORDS[0])
    assert "전화번호" in prompt and "넣지 말 것" in prompt


def test_long_documents_are_truncated_before_sending() -> None:
    record = {"chunks": [{"content": "가" * 20000}]}
    assert len(summarizer.document_body(record)) == summarizer.MAX_INPUT_CHARACTERS


def test_summaries_resume_from_what_is_already_done(tmp_path: Path) -> None:
    path = tmp_path / "summaries.json"
    summarizer.save_summaries({"doc_a": "이미 만든 요약"}, "gpt-4.1", path)

    done = summarizer.load_summaries(path)
    plan = summarizer.plan(DOCUMENT_RECORDS, done, "gpt-4.1")
    assert plan.already_done == 1
    assert [record["document_id"] for record in plan.pending] == ["doc_b"]
    assert plan.token_count > 0


def test_summary_run_saves_every_result(tmp_path: Path) -> None:
    path = tmp_path / "summaries.json"
    llm = FakeListChatModel(responses=["첫 요약", "둘째 요약"])

    summaries = summarizer.run(
        llm,
        DOCUMENT_RECORDS,
        {},
        save=lambda current: summarizer.save_summaries(current, "fake", path),
        workers=1,
        on_progress=None,
    )
    assert set(summaries) == {"doc_a", "doc_b"}
    assert summarizer.load_summaries(path) == summaries


def test_one_failed_summary_does_not_stop_the_rest(tmp_path: Path) -> None:
    class BrokenForFirst(FakeListChatModel):
        def invoke(self, *args, **kwargs):
            if "과학대회" in str(args[0]):
                raise RuntimeError("일부러 낸 오류")
            return super().invoke(*args, **kwargs)

    llm = BrokenForFirst(responses=["둘째 요약"])
    summaries = summarizer.run(
        llm, DOCUMENT_RECORDS, {}, save=lambda current: None, workers=1
    )
    assert "doc_a" not in summaries
    assert summaries["doc_b"] == "둘째 요약"


# --- 임베딩 ------------------------------------------------------------------


def test_plan_counts_tokens_and_cost(documents_path: Path, tmp_path, embeddings) -> None:
    documents = store.load_chunk_documents(documents_path)
    vector_store = store.open_chunk_store(embeddings, tmp_path / "vectors")

    plan = embedder.plan(documents, vector_store, "text-embedding-3-small")
    assert plan.total_chunks == 3
    assert plan.already_embedded == 0
    assert plan.token_count > 0
    assert plan.cost > 0


def test_already_embedded_items_are_skipped(
    documents_path: Path, tmp_path, embeddings
) -> None:
    """중간에 끊겨도 다시 돌리면 남은 것부터 이어서 해야 한다."""
    documents = store.load_chunk_documents(documents_path)
    vector_store = store.open_chunk_store(embeddings, tmp_path / "vectors")

    first = embedder.plan(documents, vector_store, "text-embedding-3-small", limit=1)
    embedder.run(vector_store, first.pending, batch_size=10)

    second = embedder.plan(documents, vector_store, "text-embedding-3-small")
    assert second.already_embedded == 1
    assert len(second.pending) == 2


def test_reembedding_the_same_chunk_does_not_duplicate(
    documents_path: Path, tmp_path, embeddings
) -> None:
    documents = store.load_chunk_documents(documents_path)
    vector_store = store.open_chunk_store(embeddings, tmp_path / "vectors")

    embedder.run(vector_store, documents, batch_size=10)
    embedder.run(vector_store, documents, batch_size=10)
    assert store.count(vector_store) == 3


def test_two_indexes_live_side_by_side(
    documents_path: Path, summaries_path: Path, tmp_path, embeddings
) -> None:
    """요약과 조각은 컬렉션이 달라 서로 섞이지 않는다."""
    vectors = tmp_path / "vectors"
    chunk_store = store.open_chunk_store(embeddings, vectors)
    summary_store = store.open_summary_store(embeddings, vectors)

    embedder.run(chunk_store, store.load_chunk_documents(documents_path), batch_size=10)
    embedder.run(
        summary_store,
        store.load_summary_documents(summaries_path, documents_path),
        batch_size=10,
    )
    assert store.count(chunk_store) == 3
    assert store.count(summary_store) == 1


def test_cost_estimate_uses_the_model_price() -> None:
    small = embedder.estimate_cost(1_000_000, "text-embedding-3-small")
    large = embedder.estimate_cost(1_000_000, "text-embedding-3-large")
    assert small == pytest.approx(0.02)
    assert large == pytest.approx(0.13)


# --- 두 단계 검색 -------------------------------------------------------------


@pytest.fixture
def searcher(documents_path, summaries_path, tmp_path, embeddings) -> Searcher:
    vectors = tmp_path / "vectors"
    chunk_store = store.open_chunk_store(embeddings, vectors)
    summary_store = store.open_summary_store(embeddings, vectors)
    embedder.run(chunk_store, store.load_chunk_documents(documents_path), batch_size=10)
    embedder.run(
        summary_store,
        store.load_summary_documents(summaries_path, documents_path),
        batch_size=10,
    )
    return Searcher(summary_store, chunk_store)


def test_search_returns_hits_the_api_can_use(searcher: Searcher) -> None:
    hits = searcher.search("참가 신청", k=3)
    assert hits
    for hit in hits:
        assert hit.document_id and hit.chunk_id  # 문서 조회 API 경로에 그대로 쓴다
        assert 0.0 <= hit.relevance <= 1.0
        assert hit.content


def test_chunks_come_only_from_documents_the_summary_stage_picked(
    searcher: Searcher,
) -> None:
    """요약이 있는 문서는 doc_a뿐이므로 doc_b의 조각은 올라오지 않는다."""
    hits = searcher.search("여비 청구", k=5)
    assert hits
    assert {hit.document_id for hit in hits} == {"doc_a"}
    assert all(hit.document_relevance is not None for hit in hits)


def test_search_falls_back_to_chunks_without_summaries(
    documents_path, tmp_path, embeddings
) -> None:
    """요약을 아직 안 만들었어도 검색은 되어야 한다."""
    vectors = tmp_path / "vectors"
    chunk_store = store.open_chunk_store(embeddings, vectors)
    summary_store = store.open_summary_store(embeddings, vectors)
    embedder.run(chunk_store, store.load_chunk_documents(documents_path), batch_size=10)

    hits = Searcher(summary_store, chunk_store).search("여비 청구", k=5)
    assert {hit.document_id for hit in hits} == {"doc_a", "doc_b"}
    assert all(hit.document_relevance is None for hit in hits)


def test_search_can_be_limited_to_drafted_or_received(searcher: Searcher) -> None:
    """기안한 문서만, 또는 특정 공문 안에서만 찾을 수 있어야 한다."""
    assert searcher.search("신청", k=5, direction="drafted")
    assert searcher.find_documents("신청", direction="received") == []
