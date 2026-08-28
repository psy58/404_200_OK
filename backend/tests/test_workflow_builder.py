#!/usr/bin/env python3 -m pytest
"""문서에서 업무 흐름을 만들어 내기.

문서끼리 견주지 않는다. 문서마다 (사업 키, 단계)를 붙이고 순서는 템플릿이
정한다. 그래서 여기 시험도 "이 제목이 어느 사업 어느 단계인가"만 본다.
"""

import pytest

from app.workflow import builder, stages
from app.workflow.keys import business_key


# --- 사업 키 -----------------------------------------------------------------


@pytest.mark.parametrize(
    "title, expected",
    [
        ("2025학년도 토요과학교실(1차) 운영 계획", (2025, "토요과학교실", 1)),
        ("2025학년도 서울형 과학중점학교 운영 계획 제출", (2025, "과학중점학교", None)),
        ("2026년 AI 중점학교 운영 공모 안내", (2026, "AI 중점학교", None)),
    ],
)
def test_title_gives_year_name_and_round(title, expected) -> None:
    key = business_key(title)
    assert (key.year, key.name, key.round) == expected


def test_year_comes_from_the_document_when_the_title_has_none() -> None:
    """공문 제목에 연도가 빠지는 일이 잦다. 꼬리말 날짜로 메운다."""
    key = business_key("과학중점학교 운영위원회 구성", date="2025-03-10")
    assert key.year == 2025
    assert key.name == "과학중점학교"


def test_rounds_share_one_series() -> None:
    """1차·2차·3차는 한 사업이다."""
    first = business_key("2025학년도 토요과학교실(1차) 운영 계획")
    third = business_key("2025학년도 토요과학교실(3차) 프로그램 강사비 지출")
    assert first.series == third.series
    assert first.round != third.round


def test_action_words_are_not_part_of_the_name() -> None:
    key = business_key("2025 숭의여자고등학교 개방형 실험실 프로그램 참가 학생 모집")
    assert "모집" not in key.name
    assert "개방형" in key.name or "실험실" in key.name


# --- 단계 -------------------------------------------------------------------


@pytest.mark.parametrize(
    "title, expected",
    [
        ("2025학년도 토요과학교실(1차) 운영 계획", stages.PLANNING),
        ("2025 개방형 실험실 프로그램 학생 추천", stages.APPLICATION),
        ("「2026년 AI 중점학교」 선정 결과 안내", stages.SELECTION),
        ("토요과학교실(3차) 프로그램 강사비 지출", stages.SETTLEMENT),
        ("2025 서울형 과학중점학교 운영 결과 보고서 제출", stages.REPORTING),
        ("2026년 AI 중점학교 운영 공모 안내", stages.NOTICE),
        ("과학중점학교 및 융합수업관련 협의회 진행", stages.OPERATION),
    ],
)
def test_titles_are_sorted_into_stages(title, expected) -> None:
    assert stages.classify(title) == expected


def test_money_wins_over_the_word_request() -> None:
    """"요청"은 그 자체로 뜻이 없다. 목적어가 정한다."""
    assert stages.classify("과학중점학교 마무리를 위한 간식비 요청") == stages.SETTLEMENT
    assert stages.classify("제3기 과학중점학교 학급 승인 요청") == stages.SELECTION


def test_untitled_or_unknown_gives_no_stage() -> None:
    assert stages.classify("") is None
    assert stages.classify(None) is None


# --- 워크플로 만들기 ---------------------------------------------------------


def node(title, date=None, direction="drafted", kind="본문"):
    return {"title": title, "approval_date": date, "direction": direction, "kind": kind}


NODES = {
    "d1": node("2025 과학중점학교 운영 공모 안내", "2025-03-02", "received"),
    "d2": node("2025 과학중점학교 참가 신청", "2025-03-20"),
    "d3": node("2025 과학중점학교 선정 결과 알림", "2025-04-05", "received"),
    "d4": node("2025 과학중점학교 프로그램 운영비 지출", "2025-06-10"),
    "d5": node("2025 과학중점학교 신청 서식", None, "drafted", "첨부"),
}


def build_one():
    workflows = builder.build_all(NODES)
    assert len(workflows) == 1
    return workflows[0]


def test_documents_of_one_business_become_one_workflow() -> None:
    workflow = build_one()
    assert workflow.business_name == "과학중점학교"
    assert workflow.year == 2025
    assert workflow.document_count == 4  # 첨부는 세지 않는다


def test_steps_follow_the_template_order() -> None:
    workflow = build_one()
    assert [step.stage for step in workflow.steps][:3] == [
        stages.NOTICE,
        stages.APPLICATION,
        stages.SELECTION,
    ]


def test_a_step_with_documents_is_completed() -> None:
    workflow = build_one()
    by_stage = {step.stage: step for step in workflow.steps}
    assert by_stage[stages.NOTICE].status == "completed"
    assert by_stage[stages.NOTICE].completed_at.isoformat() == "2025-03-02"
    assert by_stage[stages.NOTICE].document_ids == ["d1"]


def test_a_skipped_step_does_not_become_the_current_one() -> None:
    """계획서 없이 바로 운영한 사업이 실제로 있다.

    첫 번째 빈 단계를 지금 할 차례로 삼으면, 이미 끝난 업무인데 중간의
    건너뛴 단계가 "지금 할 일"로 뜬다.
    """
    workflow = build_one()
    by_stage = {step.stage: step for step in workflow.steps}
    assert by_stage[stages.PLANNING].status == "pending"  # 건너뛴 단계
    assert by_stage[stages.SETTLEMENT].status == "completed"

    current = [step.stage for step in workflow.steps if step.status == "current"]
    assert current == [stages.REPORTING]  # 마지막으로 끝낸 단계 다음


def test_a_single_document_is_not_a_workflow() -> None:
    workflows = builder.build_all({"only": node("2025 무언가 안내", "2025-01-01")})
    assert workflows == []


def test_workflow_id_is_ascii_for_urls() -> None:
    workflow = build_one()
    assert workflow.workflow_id.startswith("wf_")
    assert workflow.workflow_id.isascii()


def test_template_is_chosen_by_the_stages_seen() -> None:
    templates = builder.load_templates()
    public = builder.choose_template({stages.NOTICE, stages.APPLICATION, stages.SELECTION}, templates)
    internal = builder.choose_template({stages.PLANNING, stages.OPERATION}, templates)
    assert public.id == "public_call"
    assert internal.id == "internal_program"
