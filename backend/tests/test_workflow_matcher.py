#!/usr/bin/env python3 -m pytest
"""질문 → 업무·단계 고르기.

OpenAI를 부르지 않는다. 낱말 유무로 벡터를 만드는 가짜 임베딩을 쓴다.
코사인 유사도 계산과 기준값 판단은 실제와 같은 코드가 돈다.
"""

from app.services import workflow_matcher
from app.services.workflow_matcher import WorkflowMatcher

VOCABULARY = [
    "과학대회",
    "참가",
    "신청",
    "학생",
    "모집",
    "선발",
    "내부",
    "결재",
    "결과",
    "보고",
    "토요과학교실",
    "운영",
    "계획",
    "수립",
    "가정통신문",
    "발송",
    "강사비",
    "지출",
    "품의",
    "복사기",
    "토너",
    "교체",
]


class CountingEmbeddings:
    """낱말이 들어 있으면 1, 아니면 0인 벡터. 부른 횟수를 센다."""

    def __init__(self) -> None:
        self.calls = 0

    def __call__(self, texts) -> list[list[float]]:
        self.calls += 1
        return [[1.0 if word in text else 0.0 for word in VOCABULARY] for text in texts]


def make_matcher() -> tuple[WorkflowMatcher, CountingEmbeddings]:
    embed = CountingEmbeddings()
    return WorkflowMatcher(embed), embed


def test_question_naming_the_workflow_is_matched() -> None:
    matcher, _ = make_matcher()
    match = matcher.match("과학대회 참가 신청은 어떻게 하나요")

    assert match is not None
    assert match.workflow_id == "science_competition"
    assert match.step_name == "참가 신청"


def test_question_naming_only_a_step_finds_the_right_workflow() -> None:
    """업무 이름이 안 나오고 단계 이름만 나오는 질문이 흔하다.

    업무 설명만 보면 이런 질문은 엉뚱한 업무로 간다.
    """
    matcher, _ = make_matcher()
    match = matcher.match("강사비 지출 품의 어떻게 하나요")

    assert match is not None
    assert match.workflow_id == "saturday_science_class"  # 이름이 안 나왔는데도
    assert match.step_name == "강사비 지출 품의"


def test_unrelated_question_gets_no_workflow() -> None:
    """엉뚱한 업무를 붙이는 것이 못 찾는 것보다 나쁘다."""
    matcher, _ = make_matcher()
    assert matcher.match("복사기 토너 교체") is None


def test_workflow_without_a_clear_step_still_matches() -> None:
    matcher, _ = make_matcher()
    match = matcher.match("토요과학교실 운영 계획 수립")

    assert match is not None
    assert match.workflow_id == "saturday_science_class"
    assert match.score >= workflow_matcher.WORKFLOW_THRESHOLD


def test_workflows_are_embedded_once_not_per_question() -> None:
    """업무 목록은 자주 바뀌지 않는다. 질문마다 다시 임베딩하지 않는다."""
    matcher, embed = make_matcher()
    matcher.match("과학대회 참가 신청")
    after_first = embed.calls

    matcher.match("가정통신문 발송")
    matcher.match("강사비 지출")

    assert after_first == 2  # 업무·단계 한 번 + 질문 한 번
    assert embed.calls == after_first + 2  # 질문마다 한 번씩만 더


def test_refresh_picks_up_changed_workflows() -> None:
    matcher, embed = make_matcher()
    matcher.match("과학대회 참가")
    matcher.refresh()
    assert matcher.match("과학대회 참가") is not None


def test_keyword_fallback_works_without_embeddings() -> None:
    """임베딩을 못 쓰는 환경에서도 최소한은 고른다."""
    match = workflow_matcher.keyword_match("과학대회 참가 신청 방법")
    assert match is not None
    assert match.workflow_id == "science_competition"
    assert match.step_name == "참가 신청"

    assert workflow_matcher.keyword_match("복사기 토너 교체") is None


def test_build_matcher_returns_none_without_a_key(monkeypatch) -> None:
    """키가 없으면 매처를 만들지 못한다. 부르는 쪽이 대비책으로 넘어간다."""
    from app import settings

    monkeypatch.setattr(settings, "openai_api_key", lambda: None)
    assert workflow_matcher.build_matcher() is None
