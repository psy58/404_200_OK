"""공문 제목의 행위어로 업무 단계를 정한다.

공문 제목은 거의 언제나 "무엇을 + 어떻게 했다"로 끝난다.

    2025학년도 토요과학교실(1차) 운영 계획      → 계획수립
    2025 개방형 실험실 프로그램 학생 추천       → 신청추천
    「2026년 AI 중점학교」 선정 결과 안내        → 선정결과
    토요과학교실(3차) 프로그램 강사비 지출      → 지출정산

이 행위어가 곧 단계 이름이다. 문서를 (사업, 단계)로 배정만 하면 순서는
템플릿(stages.yaml)이 알려 주므로, 문서끼리 견주어 관계를 추론할 필요가 없다.

규칙의 순서가 중요하다. "요청"은 그 자체로는 아무 뜻이 없고 목적어에 달렸다.

    간식비 요청   → 지출정산 (돈 이야기)
    승인 요청     → 신청추천 (허락을 구함)

그래서 돈·결과처럼 뜻이 분명한 신호를 먼저 보고, "안내"처럼 어디에나 붙는
말을 맨 나중에 본다.
"""

import re
from dataclasses import dataclass

NOTICE = "공모안내"
PLANNING = "계획수립"
APPLICATION = "신청추천"
SELECTION = "선정결과"
OPERATION = "운영"
SETTLEMENT = "지출정산"
REPORTING = "결과보고"

ORDER = [NOTICE, PLANNING, APPLICATION, SELECTION, OPERATION, SETTLEMENT, REPORTING]

LABEL = {
    NOTICE: "공모·안내",
    PLANNING: "계획 수립",
    APPLICATION: "신청·추천",
    SELECTION: "선정·승인",
    OPERATION: "운영",
    SETTLEMENT: "지출·정산",
    REPORTING: "결과 보고",
}

# 위에서부터 먼저 걸린 것으로 정한다. 뜻이 분명한 신호가 위에 온다.
_RULES: tuple[tuple[str, re.Pattern], ...] = (
    # 돈 이야기. "요청"이 붙어도 지출이다.
    (SETTLEMENT, re.compile(
        r"지출|품의|정산|교부|집행|매입|구매|구입|대금|환불|납부|인쇄|구독"
        r"|[가-힣]+(비|료|금)\s*(신청|요청|지급|정산|집행|납부|반납)"
        r"|강사비|운영비|간식비|여비|수당|예산"
    )),
    # 일이 끝난 뒤. "결과 안내"는 선정 결과일 수도 있어 아래에서 다시 가른다.
    (REPORTING, re.compile(r"결과\s*(보고|제출)|운영\s*결과|실적|성과\s*(보고|제출|공유)|보고서\s*제출|만족도|평가\s*(결과|자료)")),
    (SELECTION, re.compile(r"선정\s*결과|지정\s*(알림|결과|서)|승인|선정\s*(알림|안내)?|위촉|확정")),
    (APPLICATION, re.compile(r"신청|추천|응모|참가\s*(신청|접수)|제출\s*(요청|안내|독려)|접수")),
    (PLANNING, re.compile(r"운영\s*계획|추진\s*계획|계획\s*(수립|제출|서)|계획서|기본\s*계획|계획\(안\)|계획\s*$")),
    # 공모·모집은 뜻이 분명하다. "○○ 운영 공모 안내"에서 행위는 운영이 아니라 공모다.
    (NOTICE, re.compile(r"공모|모집|응모\s*안내")),
    (OPERATION, re.compile(
        r"운영\s*(?!계획)|실시|개최|진행|워크숍|협의회|회의|연수\s*(운영|참석)"
        r"|점검|컨설팅|조사|실태|체험|캠프|발표회|나눔|공유"
    )),
    # 어디에나 붙는 말이라 맨 나중에 본다.
    (NOTICE, re.compile(r"공모|모집|안내|알림|통보|공지|홍보")),
)


@dataclass(frozen=True)
class StageMatch:
    stage: str
    label: str


def classify(title: str | None) -> str | None:
    """제목에서 단계를 정한다. 행위어가 없으면 None."""
    if not title or not title.strip():
        return None
    for stage, pattern in _RULES:
        if pattern.search(title):
            return stage
    return None


def label(stage: str | None) -> str:
    return LABEL.get(stage or "", "기타")


def position(stage: str | None) -> int:
    """표준 순서에서 몇 번째 단계인가. 모르는 단계는 맨 뒤."""
    return ORDER.index(stage) if stage in ORDER else len(ORDER)
