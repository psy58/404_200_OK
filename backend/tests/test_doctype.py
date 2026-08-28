#!/usr/bin/env python3 -m pytest
"""문서 종류 나누기와 검색 순위 조정."""

import pytest

from app.rag import doctype
from app.rag.retriever import (
    MAX_CHUNKS_PER_DOCUMENT,
    Hit,
    _keyword_score,
    _keywords,
    _select,
)


@pytest.mark.parametrize(
    "title, expected",
    [
        ("2025학년도 토요과학교실(3차) 운영 계획", doctype.PLAN),
        ("2025년 AI정보교육 중심학교 운영 계획서(숭의여고)", doctype.PLAN),
        ("제68회 서울과학전람회 예선대회 개최 요강", doctype.GUIDE),
        ("2025학년도 과학실 안전관리 및 안전매뉴얼", doctype.GUIDE),
        ("2026년 AI 중점학교 운영 공모 안내", doctype.NOTICE),
        ("2025년 AI정보교육 중심학교 운영 결과보고서", doctype.REPORT),
        ("토요과학교실(3차) 프로그램 강사비 지출", doctype.SPENDING),
        ("물품통합선정위원회 회의록", doctype.MEETING),
        ("(서식2)2025 스마트웨더 프로젝트 직무연수 신청서", doctype.FORM),
        ("2025 고등 디지털 기반 직무연수 대상자 명단", doctype.ROSTER),
        ("겸직허가 요청", doctype.OTHER),
    ],
)
def test_titles_are_sorted_into_kinds(title: str, expected: str) -> None:
    assert doctype.classify(title) == expected


def test_plans_outrank_rosters_and_forms() -> None:
    """업무를 알려면 계획서가 필요하지 빈 서식이나 명단이 필요하지 않다."""
    assert doctype.boost(doctype.PLAN) > doctype.boost(doctype.REPORT)
    assert doctype.boost(doctype.REPORT) > doctype.boost(doctype.ROSTER)
    assert doctype.boost(doctype.ROSTER) == doctype.boost(doctype.FORM)


def test_weighting_stays_gentle() -> None:
    """가중치가 주제를 이기면 안 된다.

    1.2까지 올렸더니 '토요과학교실'을 물었는데 과학중점학교 계획서가 올라왔다.
    """
    spread = doctype.boost(doctype.PLAN) / doctype.boost(doctype.FORM)
    assert spread < 1.3


def test_empty_title_is_not_a_crash() -> None:
    assert doctype.classify(None) == doctype.OTHER
    assert doctype.classify("") == doctype.OTHER


# --- 질문에서 낱말 뽑기 -------------------------------------------------------


def test_common_words_are_dropped() -> None:
    """'운영 계획'은 어느 문서에나 있어 문서를 가려내지 못한다."""
    assert _keywords("토요과학교실 운영 계획 어떻게 하나요") == ["토요과학교실"]


def test_keyword_score_counts_how_many_appear() -> None:
    assert _keyword_score("토요과학교실 3차 운영 계획", ["토요과학교실"]) == 1.0
    assert _keyword_score("과학중점학교 운영 계획", ["토요과학교실"]) == 0.0
    assert _keyword_score("AI 중점학교 계획", ["AI", "중점학교"]) == 1.0


def test_no_keywords_means_no_bonus() -> None:
    assert _keyword_score("아무 글", []) == 0.0


# --- 근거 고르기 -------------------------------------------------------------


def hit(document_id: str, title: str, content: str, relevance: float) -> Hit:
    return Hit(
        document_id=document_id,
        chunk_id="chunk_0000",
        title=title,
        content=content,
        relevance=relevance,
    )


def test_same_text_is_not_shown_twice() -> None:
    """공문 본문과 첨부에 같은 문장이 그대로 실린다."""
    hits = [
        hit("doc_a", "계획", "참가 신청은 30일 전까지 제출한다.", 0.7),
        hit("doc_b", "계획 첨부", "참가 신청은 30일 전까지 제출한다.", 0.6),
        hit("doc_c", "지침", "보호자 동의서를 받는다.", 0.5),
    ]
    chosen = _select(hits, k=5)
    assert [h.document_id for h in chosen] == ["doc_a", "doc_c"]


def test_one_document_cannot_take_every_slot() -> None:
    hits = [hit("doc_a", "계획", f"내용 {i}", 0.9 - i / 100) for i in range(5)]
    hits += [hit("doc_b", "지침", "다른 문서 내용", 0.4)]
    chosen = _select(hits, k=5)
    assert sum(1 for h in chosen if h.document_id == "doc_a") == MAX_CHUNKS_PER_DOCUMENT
    assert "doc_b" in {h.document_id for h in chosen}


def test_same_title_from_different_documents_is_capped() -> None:
    """같은 공문을 두 번 접수하는 일이 있다. 문서 번호만 다르고 내용은 같다."""
    hits = [
        hit(f"doc_{i}", "2025 운영 계획(안내용)", f"내용 {i}", 0.9 - i / 100)
        for i in range(4)
    ]
    hits.append(hit("doc_x", "다른 계획", "다른 내용", 0.5))
    chosen = _select(hits, k=5)
    assert sum(1 for h in chosen if h.title == "2025 운영 계획(안내용)") == 2
    assert chosen[-1].document_id == "doc_x"
