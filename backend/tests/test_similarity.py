#!/usr/bin/env python3 -m pytest
"""내용·날짜로 추정하는 문서 연결.

벡터를 손으로 만들어 넣는다. Chroma도 OpenAI도 부르지 않는다.
"""

import numpy as np

from app.ingest import similarity

# 축 하나가 하나의 사업이라고 보면 된다.
과학교실 = [1.0, 0.0, 0.0]
과학교실_비슷 = [0.97, 0.24, 0.0]  # 유사도 약 0.97
다른사업 = [0.0, 1.0, 0.0]
어중간 = [0.75, 0.66, 0.0]  # 유사도 약 0.75 — 같은 분야일 뿐


def node(title, direction="drafted", kind="본문", date=None, **extra):
    return {
        "title": title,
        "direction": direction,
        "kind": kind,
        "approval_date": date,
        "issuing_date": None,
        "receipt_date": None,
        **extra,
    }


def run(nodes: dict, vectors: dict, **options):
    ids = list(nodes)
    matrix = np.array([vectors[key] for key in ids], dtype="float32")
    matrix /= np.linalg.norm(matrix, axis=1, keepdims=True)
    return similarity.suggest(nodes, ids, matrix, **options)


def test_documents_about_the_same_business_are_linked() -> None:
    suggestions = run(
        {
            "a": node("토요과학교실 1차 운영 계획"),
            "b": node("토요과학교실 2차 운영 계획"),
        },
        {"a": 과학교실, "b": 과학교실_비슷},
    )
    assert {s.type for s in suggestions} == {similarity.SAME_TOPIC}
    assert {(s.source, s.target) for s in suggestions} == {("a", "b"), ("b", "a")}
    assert all(s.score >= similarity.TOPIC_THRESHOLD for s in suggestions)


def test_merely_similar_documents_are_not_linked() -> None:
    """같은 분야라는 이유로 묶으면 엉뚱한 문서가 업무 흐름에 끼어든다."""
    suggestions = run(
        {"a": node("토요과학교실 운영 계획"), "b": node("반일제 체험 협의회비 신청")},
        {"a": 과학교실, "b": 어중간},
    )
    assert suggestions == []


def test_attachments_are_left_out() -> None:
    """첨부는 본문에 이미 붙어 있다. 또 이으면 그래프만 복잡해진다."""
    suggestions = run(
        {
            "body": node("운영 계획"),
            "form": node("운영 계획 서식", kind="첨부"),
        },
        {"body": 과학교실, "form": 과학교실_비슷},
    )
    assert suggestions == []


def test_received_notice_links_to_the_draft_that_followed() -> None:
    """받은 공문 뒤에 우리가 기안한 문서를 후속으로 본다."""
    suggestions = run(
        {
            "notice": node("AI 중점학교 공모 안내", direction="received", date="2025-08-18"),
            "draft": node("AI 중점학교 공모 신청", direction="drafted", date="2025-09-01"),
        },
        {"notice": 과학교실, "draft": 과학교실_비슷},
    )
    follow_ups = [s for s in suggestions if s.type == similarity.LIKELY_FOLLOW_UP]
    assert [(s.source, s.target) for s in follow_ups] == [("notice", "draft")]
    assert "14일 뒤" in follow_ups[0].label


def test_a_draft_before_the_notice_is_not_a_follow_up() -> None:
    """날짜가 거꾸로면 후속이 아니다."""
    suggestions = run(
        {
            "notice": node("공모 안내", direction="received", date="2025-09-01"),
            "draft": node("공모 신청", direction="drafted", date="2025-08-18"),
        },
        {"notice": 과학교실, "draft": 과학교실_비슷},
    )
    assert not [s for s in suggestions if s.type == similarity.LIKELY_FOLLOW_UP]


def test_a_draft_long_after_the_notice_is_not_a_follow_up() -> None:
    suggestions = run(
        {
            "notice": node("공모 안내", direction="received", date="2025-01-01"),
            "draft": node("공모 신청", direction="drafted", date="2025-06-01"),
        },
        {"notice": 과학교실, "draft": 과학교실_비슷},
    )
    assert not [s for s in suggestions if s.type == similarity.LIKELY_FOLLOW_UP]


def test_documents_without_dates_get_no_follow_up() -> None:
    suggestions = run(
        {
            "notice": node("공모 안내", direction="received", date=None),
            "draft": node("공모 신청", direction="drafted", date="2025-09-01"),
        },
        {"notice": 과학교실, "draft": 과학교실_비슷},
    )
    assert not [s for s in suggestions if s.type == similarity.LIKELY_FOLLOW_UP]


def test_receipt_date_is_used_when_there_is_no_approval_date() -> None:
    nodes = {
        "notice": node("공모 안내", direction="received"),
        "draft": node("공모 신청", direction="drafted", date="2025-09-01"),
    }
    nodes["notice"]["receipt_date"] = "2025-08-25"
    suggestions = run(nodes, {"notice": 과학교실, "draft": 과학교실_비슷})
    assert [s.type for s in suggestions if s.type == similarity.LIKELY_FOLLOW_UP]


def test_no_vectors_means_no_suggestions() -> None:
    assert similarity.suggest({}, [], np.zeros((0, 0), dtype="float32")) == []
