#!/usr/bin/env python3 -m pytest
"""검색 결과를 시간순 흐름으로 만들기."""

from app.rag import doctype, timeline

GRAPH = {
    "nodes": {
        "doc_notice": {
            "title": "2026년 AI 중점학교 운영 공모 안내",
            "direction": "received",
            "receipt_date": "2025-12-29",
            "kind": "본문",
            "doc_number": "숭의여자고등학교-1000",
        },
        "doc_apply": {
            "title": "2026학년도 AI 중점학교 운영 공모 신청",
            "direction": "drafted",
            "approval_date": "2026-01-12",
            "kind": "본문",
        },
        "doc_apply_form": {
            "title": "AI 중점학교 신청서(서식)",
            "direction": "drafted",
            "kind": "첨부",
        },
        "doc_result": {
            "title": "2026년 AI 중점학교 선정 결과 안내",
            "direction": "received",
            "receipt_date": "2026-01-30",
            "kind": "본문",
        },
        "doc_roster": {
            "title": "AI 중점학교 참가자 명단",
            "direction": "received",
            "receipt_date": "2026-02-01",
            "kind": "본문",
        },
        "doc_undated": {
            "title": "AI 중점학교 운영 계획서",
            "direction": "drafted",
            "kind": "본문",
        },
    },
    "edges": [
        {"source": "doc_apply", "target": "doc_apply_form", "type": "attachment"},
        {"source": "doc_notice", "target": "doc_apply", "type": "follow_up"},
        {"source": "doc_apply", "target": "doc_result", "type": "same_topic"},
        {"source": "doc_apply", "target": "doc_roster", "type": "same_topic"},
        {"source": "doc_apply", "target": "doc_undated", "type": "same_topic"},
    ],
}


def build(seeds, **kwargs):
    return timeline.build(seeds, graph=GRAPH, **kwargs)


def test_entries_come_back_in_date_order() -> None:
    entries = build(["doc_apply"])
    dates = [entry.date for entry in entries if entry.date]
    assert dates == sorted(dates)
    assert dates[0] == "2025-12-29"


def test_related_documents_are_pulled_in() -> None:
    """검색은 신청 문서 하나를 찾았을 뿐인데 앞뒤가 함께 보여야 한다."""
    titles = [entry.title for entry in build(["doc_apply"])]
    assert "2026년 AI 중점학교 운영 공모 안내" in titles
    assert "2026년 AI 중점학교 선정 결과 안내" in titles


def test_an_attachment_is_replaced_by_its_body() -> None:
    """날짜와 문서번호는 본문 꼬리말에만 있다."""
    entries = build(["doc_apply_form"])
    apply_entry = next(e for e in entries if e.document_id == "doc_apply")
    assert apply_entry.date == "2026-01-12"
    assert "doc_apply_form" not in {e.document_id for e in entries}


def test_rosters_and_forms_are_left_out() -> None:
    """명단은 사업이 어떻게 진행됐는지 말해 주지 않는다."""
    titles = [entry.title for entry in build(["doc_apply"])]
    assert "AI 중점학교 참가자 명단" not in titles


def test_documents_without_a_date_go_last() -> None:
    entries = build(["doc_apply"])
    assert entries[-1].title == "AI 중점학교 운영 계획서"
    assert entries[-1].date is None


def test_kind_is_attached_to_each_entry() -> None:
    entries = build(["doc_apply"])
    kinds = {entry.title: entry.kind for entry in entries}
    assert kinds["AI 중점학교 운영 계획서"] == doctype.PLAN
    assert kinds["2026년 AI 중점학교 운영 공모 안내"] == doctype.NOTICE


def test_limit_is_respected() -> None:
    assert len(build(["doc_apply"], limit=2)) == 2


def test_empty_graph_gives_an_empty_timeline() -> None:
    assert timeline.build(["doc_apply"], graph={"nodes": {}, "edges": []}) == []


def test_unknown_document_is_not_a_crash() -> None:
    assert build(["doc_nowhere"]) == []


# --- 교육청에 낸 것과 학교 안에서 한 것 ---------------------------------------


def test_received_documents_come_from_the_office() -> None:
    assert timeline.audience_of({"direction": "received"}) == timeline.INCOMING


def test_internal_approval_stays_inside_the_school() -> None:
    """기안 문서의 수신이 '내부결재'면 학교 안에서 끝난 일이다."""
    node = {"direction": "drafted", "recipient": "내부결재"}
    assert timeline.audience_of(node) == timeline.INTERNAL


def test_a_draft_sent_outside_is_a_submission() -> None:
    """담당자가 알고 싶은 것은 '이걸 교육청에 내야 하나'다."""
    node = {"direction": "drafted", "recipient": "서울특별시교육감(창의미래교육과장)"}
    assert timeline.audience_of(node) == timeline.EXTERNAL


def test_a_draft_without_a_recipient_is_treated_as_internal() -> None:
    assert timeline.audience_of({"direction": "drafted"}) == timeline.INTERNAL


def test_entries_carry_the_audience() -> None:
    entries = build(["doc_apply"])
    assert {entry.audience for entry in entries} <= {
        timeline.INCOMING,
        timeline.INTERNAL,
        timeline.EXTERNAL,
    }
