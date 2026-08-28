"""공문의 머리·꼬리에서 문서 정보를 뽑는다.

학교 공문은 형식이 정해져 있다.

    수신 수신자 참조
    제목 서울과학전람회 운영 방안 변경(안) 안내
    1. 관련: 기획운영부-66(2026. 1. 9.)          ← 이 문서가 딛고 있는 앞선 문서
    ...
    ★교육연구사 ... 기획운영부장 2026. 2. 2.      ← 결재가 끝난 날
    시행 기획운영부-193 (2026. 2. 2.)            ← 보낸 쪽 번호와 날짜
    접수 숭의여자고등학교-1000 (2026. 2. 2.)      ← 받은 쪽 번호와 날짜
    ... / 부분공개(5)

여기서 뽑은 번호로 문서끼리 잇는다. "관련"에 적힌 번호가 다른 문서의 시행
번호나 접수 번호와 같으면, 그 둘은 같은 일의 앞뒤다.

결재자·담당자 이름은 뽑지 않는다. 문서를 잇는 데 필요하지 않고, 이 정보는
본문보다 여러 곳으로 퍼진다.
"""

import re
from dataclasses import dataclass, field

# 문서번호: "기획운영부-193", "서울특별시교육청 창의미래교육과-14069"
NUMBER = r"([가-힣A-Za-z0-9()·]+(?:[ \t][가-힣A-Za-z0-9()·]+){0,4}-\d{1,6})"
DATE = r"(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})"

_SUBJECT = re.compile(r"^제목\s+(.+?)\s*$", re.M)
_RECIPIENT = re.compile(r"^수신\s+(.+?)\s*$", re.M)
# 표로 변환된 꼬리말에서는 칸 구분 기호가 끼어든다.
_ISSUED = re.compile(r"시행\s*\|?\s*" + NUMBER + r"\s*\|?\s*\(?\s*(?:" + DATE + r")?")
_RECEIVED = re.compile(r"접수\s*\|?\s*" + NUMBER + r"\s*\|?\s*\(?\s*(?:" + DATE + r")?")
_RELATED_BLOCK = re.compile(r"관련\s*[:：]?(.{0,400})", re.S)
_REFERENCE = re.compile(NUMBER + r"\s*\(\s*" + DATE)
# 관련 항목이 끝나는 자리: 다음 번호 항목, 붙임, 결재란, 꼬리말
_RELATED_END = re.compile(r"\n\s*\d+\.\s|붙임|협조자|시행\s|접수\s|끝\.|★")
_DISCLOSURE = re.compile(r"(부분공개\(\d+\)|비공개\(\d+\)|공개)\s*$", re.M)
_ANY_DATE = re.compile(DATE)


def _text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" |")


def _date(year, month, day) -> str | None:
    """ISO 날짜 문자열. 공문에 날짜가 비어 있는 경우가 흔해 None을 허용한다."""
    if not year:
        return None
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"


@dataclass
class Reference:
    """다른 문서를 가리키는 참조."""

    number: str
    date: str | None = None


@dataclass
class OfficialDocument:
    """공문 한 건에서 뽑아낸 것."""

    subject: str | None = None
    recipient: str | None = None
    issuing_number: str | None = None  # 보낸 쪽 문서번호(시행)
    issuing_date: str | None = None
    receipt_number: str | None = None  # 받은 쪽 문서번호(접수)
    receipt_date: str | None = None
    approval_date: str | None = None  # 결재가 끝난 날
    disclosure: str | None = None  # 공개 / 부분공개(5) 등
    related: list[Reference] = field(default_factory=list)

    @property
    def is_official(self) -> bool:
        """공문 서식을 갖췄는가. 첨부 서식·계획서에는 이런 꼬리말이 없다."""
        return bool(self.issuing_number or self.receipt_number)


def parse(body: str) -> OfficialDocument:
    document = OfficialDocument()

    if match := _SUBJECT.search(body):
        document.subject = _text(match.group(1))
    if match := _RECIPIENT.search(body):
        document.recipient = _text(match.group(1))

    if match := _ISSUED.search(body):
        document.issuing_number = _text(match.group(1))
        document.issuing_date = _date(*match.group(2, 3, 4))
    if match := _RECEIVED.search(body):
        document.receipt_number = _text(match.group(1))
        document.receipt_date = _date(*match.group(2, 3, 4))

    if match := _DISCLOSURE.search(body):
        document.disclosure = match.group(1)

    document.related = _parse_related(body)
    document.approval_date = _parse_approval_date(body, document)
    return document


def _parse_related(body: str) -> list[Reference]:
    """관련 항목에 적힌 앞선 문서들.

    "1. 관련: 가. ○○부-1(2025. 1. 1.) 나. △△과-2(2025. 2. 2.)"처럼
    여러 건이 붙는 경우가 있어 항목 전체에서 참조를 모은다.

    다만 항목이 어디서 끝나는지 봐야 한다. 끝을 안 자르면 꼬리말의 시행·접수
    번호까지 "관련 문서"로 딸려 들어와 엉뚱한 연결이 생긴다.
    """
    block = _RELATED_BLOCK.search(body)
    if not block:
        return []
    block = _RELATED_END.split(block.group(1), maxsplit=1)[0]

    seen: set[str] = set()
    references: list[Reference] = []
    for number, year, month, day in _REFERENCE.findall(block):
        cleaned = _text(number)
        if cleaned in seen:
            continue
        seen.add(cleaned)
        references.append(Reference(number=cleaned, date=_date(year, month, day)))
    return references


def _parse_approval_date(body: str, document: OfficialDocument) -> str | None:
    """결재란의 날짜.

    결재란은 시행 줄 바로 앞에 온다. 그 앞부분의 마지막 날짜를 결재일로 본다.
    시행 줄이 없으면 결재일도 잡지 않는다(첨부 문서일 가능성이 높다).
    """
    marker = body.find("시행")
    if marker < 0:
        return None

    dates = _ANY_DATE.findall(body[:marker])
    if not dates:
        return None
    return _date(*dates[-1])
