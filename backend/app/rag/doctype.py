"""문서가 어떤 종류인지 가려낸다.

같은 사업이라도 문서마다 쓸모가 다르다. "이 업무가 뭔가요"라고 물었을 때
필요한 것은 운영 계획서와 지침이지, 참가자 명단이나 빈 신청 서식이 아니다.
그런데 이름이 비슷해서 임베딩만으로는 구분되지 않는다.

    2025년 AI정보교육 중심학교 운영 계획서   ← 업무를 알려면 이것
    2025년 AI정보교육 중심학교 신청서(서식)   ← 채워 넣을 빈 양식
    2025년 AI정보교육 중심학교 대상자 명단    ← 이름만 늘어선 표

제목만 봐도 대개 구분되므로 규칙으로 나눈다. 나눈 종류에 가중치를 두어
검색 순위를 조정한다. 임베딩을 다시 만들 필요가 없다.
"""

import re

PLAN = "계획"  # 운영 계획, 추진 계획, 계획(안)
GUIDE = "지침"  # 지침, 요강, 매뉴얼
NOTICE = "안내"  # 안내, 공모, 모집, 알림
REPORT = "결과보고"  # 결과보고서, 실적, 성과
SPENDING = "지출"  # 지출 품의, 정산, 교부, 예산
MEETING = "회의"  # 회의록, 협의회
FORM = "서식"  # 서식, 양식, 신청서, 동의서
ROSTER = "명단"  # 명단, 목록, 현황
OTHER = "기타"

# 순서가 곧 우선순위다. 위에서부터 먼저 걸린 것으로 정한다.
# "운영 계획서 서식"은 서식이 아니라 계획으로 보는 편이 낫다고 보고 계획을 위에 둔다.
_RULES: tuple[tuple[str, re.Pattern], ...] = (
    (GUIDE, re.compile(r"지침|요강|매뉴얼|가이드|운영\s*규정")),
    (PLAN, re.compile(r"계획서|운영\s*계획|추진\s*계획|기본\s*계획|계획\s*\(안\)|계획$|계획\s")),
    (REPORT, re.compile(r"결과\s*보고|운영\s*결과|실적\s*보고|성과\s*보고|보고서")),
    (MEETING, re.compile(r"회의록|협의회|위원회")),
    (SPENDING, re.compile(r"지출|품의|정산|교부|집행|예산|강사비|운영비|여비")),
    (NOTICE, re.compile(r"안내|공모|모집|알림|협조\s*요청|신청\s*안내|연수\s*안내")),
    (ROSTER, re.compile(r"명단|목록|현황|집계|참가자|대상자")),
    (FORM, re.compile(r"서식|양식|신청서|동의서|확인서|서약서|제출서|붙임\s*\d")),
)

# 검색 순위를 조정하는 가중치.
#
# 업무가 무엇인지 알려면 계획과 지침이 가장 쓸모 있다. 명단과 빈 서식은
# 글자가 많아 검색에는 잘 걸리지만 답에는 보탬이 되지 않아 낮춘다.
#
# 폭을 좁게 잡는다. 1.2까지 올렸더니 "토요과학교실"을 물었는데 과학중점학교
# 계획서가 올라왔다. 유사도 차이가 0.05 남짓이라 가중치가 조금만 세도 주제를
# 이겨 버린다. 가중치는 비슷한 것들 사이의 순서를 바꾸는 정도여야 한다.
BOOST: dict[str, float] = {
    PLAN: 1.08,
    GUIDE: 1.08,
    NOTICE: 1.02,
    REPORT: 1.00,
    MEETING: 0.98,
    SPENDING: 0.98,
    OTHER: 0.96,
    ROSTER: 0.88,
    FORM: 0.88,
}

# 답변에 넣을 때 사람이 읽는 이름
LABEL = {
    PLAN: "계획",
    GUIDE: "지침",
    NOTICE: "안내·공모",
    REPORT: "결과보고",
    SPENDING: "지출·정산",
    MEETING: "회의",
    FORM: "서식",
    ROSTER: "명단",
    OTHER: "기타",
}


def classify(title: str | None, subject: str | None = None) -> str:
    """제목으로 문서 종류를 정한다. 제목이 없으면 공문 제목을 본다."""
    text = " ".join(part for part in (title, subject) if part)
    if not text.strip():
        return OTHER
    for kind, pattern in _RULES:
        if pattern.search(text):
            return kind
    return OTHER


def boost(kind: str) -> float:
    return BOOST.get(kind, BOOST[OTHER])


def weigh(score: float, title: str | None, subject: str | None = None) -> tuple[float, str]:
    """관련도에 문서 종류 가중치를 곱한다. 종류도 함께 돌려준다."""
    kind = classify(title, subject)
    return score * boost(kind), kind
