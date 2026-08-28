"""공문 제목에서 사업 키를 뽑는다.

    「2025학년도 서울형 과학중점학교 운영 계획 제출」
        │
        ▼
    (2025, "과학중점학교", 차수 없음)

같은 키를 가진 문서는 같은 일이다. 문서끼리 견주어 관계를 추론하는 대신,
문서마다 키를 붙이기만 하면 묶음이 저절로 생긴다. 임베딩 유사도에 기대던
방식과 달리 임계값을 손으로 맞출 일이 없고, 왜 묶였는지 설명할 수 있다.

사업명은 두 갈래로 정한다.

    용어집에 있으면   대표 이름으로 바꾼다 (과학중점학교, 개방형실험실 …)
    없으면            제목에서 연도·차수·행위어·기관명을 걷어 낸 나머지

연도는 제목에 없으면 문서의 결재일에서 가져온다. 공문 제목에 연도가 빠지는
일이 잦은데(전체의 절반쯤), 날짜는 꼬리말에 거의 늘 있다.
"""

import re
from dataclasses import dataclass

from ..rag import glossary

_YEAR = re.compile(r"(20\d{2})\s*(?:학년도|년도|년)")
_ROUND = re.compile(r"(\d+)\s*차(?!\s*년)")
_BRACKET = re.compile(r"[(（\[【][^)）\]】]*[)）\]】]")
_ORDINAL = re.compile(r"제\s*\d+\s*[기회차]")

# 제목에서 걷어 낼 말. 사업이 아니라 그 사업에 대해 무엇을 했는지를 가리킨다.
_ACTION_WORDS = frozenset(
    """
    계획 계획서 수립 운영 실시 개최 진행 안내 알림 공모 모집 추천 신청 신청서 접수
    제출 요청 협조 승인 지정 선정 결과 보고 보고서 실적 성과 평가 정산 지출 품의
    교부 집행 예산 배정 변경 연장 마감 독려 재안내 참가 참여 명단 현황 조사 점검
    협의회 회의 워크숍 연수 자료 서식 양식 붙임 발송 통보 공지 확인 제안 검토
    """.split()
)

# 문서 어디에나 나오는 말. 사업을 가리키지 못한다.
_NOISE_WORDS = frozenset(
    """
    학년도 학교 학교명 우리 관련 대한 위한 및 등 이 그 저 년 차 회 기 안내용 송부용
    발송용 학교용 신규 추가 최종 수정 재 및및 서울특별시교육청 서울특별시 교육청
    교육지원청 동작관악 숭의여고 숭의여자고등학교 초중고 고등학교 중학교 초등학교
    """.split()
)

MAX_NAME_TOKENS = 3

# 용어집 데이터 파일이 아직 준비되지 않은 API/테스트 환경에서도 반드시 같은
# 대표 이름으로 묶여야 하는 핵심 사업명이다. 긴 이름부터 확인한다.
_CANONICAL_NAMES = (
    "과학중점학교",
    "토요과학교실",
    "AI 중점학교",
    "개방형 실험실",
)


@dataclass(frozen=True)
class BusinessKey:
    """한 사업을 가리키는 열쇠."""

    year: int | None
    name: str
    round: int | None = None

    def __str__(self) -> str:
        year = f"{self.year}년 " if self.year else ""
        round_ = f" {self.round}차" if self.round else ""
        return f"{year}{self.name}{round_}"

    @property
    def series(self) -> tuple[int | None, str]:
        """차수를 뺀 열쇠. 1차·2차·3차를 한 사업으로 묶을 때 쓴다."""
        return (self.year, self.name)


def _year_from(title: str, fallback_date: str | None) -> int | None:
    match = _YEAR.search(title)
    if match:
        return int(match.group(1))  # 제목의 연도는 그 사업이 향하는 해다
    # 제목에 없으면 문서 날짜의 "학년도"를 쓴다. 학년도는 3월에 시작하므로
    # 2026년 1월 공문은 2025학년도 일이다.
    if fallback_date and len(fallback_date) >= 7 and fallback_date[:4].isdigit():
        year, month = int(fallback_date[:4]), int(fallback_date[5:7] or 1)
        return year if month >= 3 else year - 1
    return None


def _round_from(title: str) -> int | None:
    match = _ROUND.search(title)
    return int(match.group(1)) if match else None


def _normalized_name(title: str) -> str:
    """제목에서 사업 이름만 남긴다."""
    text = _BRACKET.sub(" ", title)
    text = _YEAR.sub(" ", text)
    text = _ORDINAL.sub(" ", text)
    text = _ROUND.sub(" ", text)
    text = re.sub(r"[「」『』<>\[\]{}·・_,~/\\]", " ", text)

    tokens = []
    for token in text.split():
        token = token.strip(".·()[]{}")
        if not token or token.isdigit() or len(token) < 2:
            continue
        if token in _ACTION_WORDS or token in _NOISE_WORDS:
            continue
        # "운영계획"처럼 붙어 있는 경우도 걷어 낸다
        if any(token.endswith(word) and len(token) > len(word) for word in ("계획", "계획서", "보고서")):
            token = re.sub(r"(계획서|계획|보고서)$", "", token)
            if len(token) < 2:
                continue
        tokens.append(token)
        if len(tokens) >= MAX_NAME_TOKENS:
            break
    return " ".join(tokens)


def business_key(
    title: str,
    date: str | None = None,
    terms: list[glossary.Term] | None = None,
) -> BusinessKey | None:
    """제목 하나에서 사업 키를 만든다. 이름을 못 찾으면 None."""
    if not title or not title.strip():
        return None

    canonical = next((name for name in _CANONICAL_NAMES if name.replace(" ", "") in title.replace(" ", "")), None)
    found = glossary.find_terms(title, terms if terms is not None else glossary.cached())
    if canonical:
        name = canonical
    elif found:
        # 여러 개가 걸리면 가장 긴(구체적인) 이름을 쓴다
        name = max((term.term for term in found), key=len)
    else:
        name = _normalized_name(title)

    if not name:
        return None
    return BusinessKey(
        year=_year_from(title, date), name=name, round=_round_from(title)
    )
