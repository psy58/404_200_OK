"""공문에서 근거 법령을 뽑아 law.go.kr 주소로 잇는다.

공문과 운영계획서는 근거를 이렇게 적는다.

    「초·중등교육법」 제23조에 따라 …
    관련: 개인정보보호법 제15조, 같은 법 시행령 제48조의2

여기서 법령명과 조문을 뽑아 국가법령정보센터의 한글주소로 연결한다.

    https://www.law.go.kr/법령/초ㆍ중등교육법/제23조
    https://www.law.go.kr/행정규칙/연구대회관리에관한훈령
    https://www.law.go.kr/자치법규/서울특별시교육청 …에 관한 조례

한글주소는 API 키가 필요 없고, 실존하지 않는 이름이면 제목이
"국가법령정보센터 | 오류페이지"인 안내가 온다. 그래서 뽑은 이름이 진짜
법령인지도 네트워크로 확인할 수 있다(빌드 스크립트의 --verify).

표기 문제 둘을 여기서 흡수한다.

    가운뎃점   초·중등교육법 = 초ㆍ중등교육법 = 초‧중등교육법 (문서마다 다르다)
               law.go.kr 는 ㆍ(U+318D)만 안다.
    띄어쓰기   개인정보보호법 ↔ 개인정보 보호법 — 검증 때 두 표기를 다 시도한다.
"""

import re
import urllib.parse
from dataclasses import dataclass, field

BASE = "https://www.law.go.kr"

STATUTE = "법령"  # 법률·시행령·시행규칙·부령 등
ADMIN_RULE = "행정규칙"  # 훈령·예규·고시·요령
ORDINANCE = "자치법규"  # 조례, 교육청 규칙
CATEGORIES = (STATUTE, ADMIN_RULE, ORDINANCE)

# 문서마다 다른 가운뎃점을 law.go.kr 가 아는 ㆍ(U+318D)로 통일한다.
_DOTS = str.maketrans({"·": "ㆍ", "‧": "ㆍ", "・": "ㆍ", "∙": "ㆍ"})
# HWP·PDF 변환 과정에서 낱말 사이에 폭 없는 문자가 끼어든다. 눈에는 안 보이는데
# 이름 비교를 다 망가뜨린다. (실제로 "환경교육의‌활성화…"가 나왔다)
_INVISIBLE = re.compile(r"[​‌‍﻿­]")

_NAME_SUFFIX = r"(?:법률|법|시행령|시행규칙|훈령|예규|고시|조례|규정|규칙|요령)"
_ARTICLE = r"제\s*\d+\s*조(?:\s*의\s*\d+)?"

# 「초·중등교육법」 제23조  — 괄호 인용. 가장 믿을 만하다.
_BRACKETED = re.compile(r"[「『]([^」』\n]{2,60})[」』]\s*(" + _ARTICLE + r")?")
# 개인정보보호법 제15조 — 괄호 없는 인용은 조문이 붙어 있을 때만 믿는다.
_BARE = re.compile(
    r"([가-힣A-Za-z0-9ㆍ]{1,25}(?:\s[가-힣A-Za-z0-9ㆍ]{1,25}){0,7}?"
    + _NAME_SUFFIX
    + r")\s*("
    + _ARTICLE
    + r")"
)

# 법령명이 아닌데 어미가 같은 말. "지도 방법 제2조" 같은 오검출을 막는다.
_NOT_A_LAW = re.compile(r"(방법|기법|문법|용법|어법|수법|편법|불법|위법|적법|합법|해법)$")
# 이름 앞에 붙어 들어오는 군더더기. "출처 국가인권위원회법"의 "출처" 같은 것.
_LEADING_JUNK = frozenset(
    "출처 관련 근거 및 등 같은 위 아래 해당 동 상기 붙임 참고 의거 따라 기준".split()
)


@dataclass(frozen=True)
class Citation:
    """법령 인용 한 건."""

    name: str  # 정규화한 법령명 (가운뎃점 ㆍ, 군더더기 제거)
    article: str | None = None  # "제15조", "제48조의2"
    category: str = STATUTE  # 법령 / 행정규칙 / 자치법규 (표기로 추정한 값)

    @property
    def url(self) -> str:
        """law.go.kr 한글주소. 조문은 법령에서만 지원을 확인했다."""
        path = f"/{self.category}/{self.name}"
        if self.article and self.category == STATUTE:
            path += f"/{self.article}"
        return BASE + urllib.parse.quote(path)

    @property
    def search_url(self) -> str:
        """한글주소가 없을 때를 위한 통합검색."""
        return f"{BASE}/LSW/unSc.do?query={urllib.parse.quote(self.name)}"

    @property
    def display(self) -> str:
        return f"{self.name} {self.article}" if self.article else self.name


def _normalize_name(raw: str) -> str | None:
    name = _INVISIBLE.sub("", raw).translate(_DOTS)
    name = re.sub(r"\s+", " ", name).strip(" .,;:()[]")

    # "화학물질관리법 제13조 및 동 시행규칙"처럼 조문이 이름에 섞여 들어오면
    # 조문 앞까지만 이름이다.
    head = re.split(r"\s*제\s*\d+\s*조", name)[0].strip()
    if head and re.search(_NAME_SUFFIX + r"$", head):
        name = head

    # 앞머리 군더더기를 걷어 낸다
    tokens = name.split(" ")
    while tokens and tokens[0] in _LEADING_JUNK:
        tokens = tokens[1:]
    name = " ".join(tokens)

    if len(name) < 3 or _NOT_A_LAW.search(name):
        return None
    if not re.search(_NAME_SUFFIX + r"$", name):
        return None
    return name


def guess_category(name: str) -> str:
    """이름 표기로 종류를 추정한다.

    확정은 못 한다 — "규칙"은 부령(법령)일 수도 교육청 규칙(자치법규)일 수도
    있다. 최종 확정은 한글주소를 실제로 열어 보는 검증 단계가 한다.
    """
    if re.search(r"(훈령|예규|고시|요령)$", name):
        return ADMIN_RULE
    if re.search(r"(조례)$", name):
        return ORDINANCE
    if re.search(r"(규칙|규정)$", name) and re.search(
        r"(교육청|특별시|광역시|도교육|시교육)", name
    ):
        return ORDINANCE
    return STATUTE


def _normalize_article(raw: str | None) -> str | None:
    if not raw:
        return None
    return re.sub(r"\s+", "", raw)


def extract(text: str) -> list[Citation]:
    """본문에서 법령 인용을 뽑는다. 같은 (이름, 조문)은 한 번만."""
    found: dict[tuple[str, str | None], Citation] = {}

    def add(raw_name: str, raw_article: str | None) -> None:
        name = _normalize_name(raw_name)
        if name is None:
            return
        article = _normalize_article(raw_article)
        key = (name, article)
        if key not in found:
            found[key] = Citation(
                name=name, article=article, category=guess_category(name)
            )

    for match in _BRACKETED.finditer(text):
        add(match.group(1), match.group(2))
    for match in _BARE.finditer(text):
        add(match.group(1), match.group(2))

    # 조문 없는 인용은, 같은 법의 조문 있는 인용이 이미 있으면 군더더기다.
    with_article = {name for (name, article) in found if article}
    return [
        citation
        for (name, article), citation in found.items()
        if article or name not in with_article
    ]


# --- 실존 확인 (네트워크) -----------------------------------------------------

_ERROR_TITLE = "오류페이지"


@dataclass
class Resolution:
    """한글주소를 실제로 열어 확인한 결과."""

    name: str
    category: str | None = None  # 확인된 종류. None 이면 어디에서도 못 찾음
    resolved_name: str | None = None  # law.go.kr 가 아는 표기 (띄어쓰기 등)
    tried: list[str] = field(default_factory=list)


def _page_exists(category: str, name: str, fetch) -> bool:
    url = BASE + urllib.parse.quote(f"/{category}/{name}")
    title = fetch(url)
    return title is not None and _ERROR_TITLE not in title


def default_fetch(url: str) -> str | None:
    """한글주소를 열어 <title> 을 돌려준다. 못 열면 None."""
    import urllib.request

    request = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            head = response.read(4096).decode("utf-8", errors="replace")
    except Exception:
        return None
    match = re.search(r"<title>([^<]*)</title>", head)
    return match.group(1) if match else ""


def resolve(name: str, fetch=default_fetch) -> Resolution:
    """이름이 실제로 어느 대장(법령/행정규칙/자치법규)에 있는지 확인한다.

    추정한 종류를 먼저, 나머지를 다음에 시도한다. 띄어쓰기가 달라 못 찾으면
    공백을 뺀 표기로 한 번 더 본다(개인정보보호법 → 개인정보 보호법 문제의 역).
    """
    resolution = Resolution(name=name)
    guessed = guess_category(name)
    order = [guessed, *[c for c in CATEGORIES if c != guessed]]

    # 표에서 뽑히면 "핸드폰번호 보유 및 이용기간 국세기본법"처럼 앞말이 붙어
    # 온다. 통째로 못 찾으면 앞 낱말을 하나씩 떼어 가며 다시 본다 — 실존
    # 확인이 곧 잘라 낼 자리를 알려 주는 셈이다.
    tokens = name.split(" ")
    heads = [" ".join(tokens[i:]) for i in range(len(tokens))]

    for head in heads:
        if not re.search(_NAME_SUFFIX + r"$", head) or len(head) < 3:
            continue
        for candidate in (head, head.replace(" ", "")):
            for category in order:
                resolution.tried.append(f"{category}/{candidate}")
                if _page_exists(category, candidate, fetch):
                    resolution.category = category
                    resolution.resolved_name = candidate
                    return resolution
    return resolution
