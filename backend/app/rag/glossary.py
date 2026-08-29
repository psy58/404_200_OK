"""업무 용어집.

같은 사업인데 문서마다 이름이 다르다.

    2025년 AI정보교육 중심학교(AI교육활동 모델교)
    2025년 AI·정보교육 중심학교 2차 공모
    2026년 AI 중점학교

담당자는 "AI 중점학교"라고 묻는데 문서에는 "AI정보교육 중심학교"라고 적혀 있으면,
글자가 겹치지 않아 어휘 검색이 걸리지 않는다. 임베딩도 사업 이름이 바뀌면 흔들린다.

그래서 문서에서 사업 이름을 뽑아 같은 것끼리 묶어 두고, 질문에 그 이름이 나오면
다른 표기를 함께 넣어 검색한다.

    질문  "AI 중점학교 예산"
      ↓  용어집에서 같은 사업의 다른 이름을 붙인다
    검색  "AI 중점학교 예산 AI정보교육 중심학교 AI·정보교육 중심학교"

용어 후보는 제목에서 규칙으로 뽑고(비용 없음), 같은 사업끼리 묶고 뜻을 붙이는
일만 LLM에 맡긴다(한 번, 몇 센트).
"""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from .. import settings

MIN_COUNT = 3  # 이보다 적게 나오면 사업 이름으로 보기 어렵다
MAX_CANDIDATES = 90
MAX_NGRAM = 4

# 사업 이름이 아닌 말. 제목에는 자주 나오지만 문서를 가려내지 못한다.
_NOISE = re.compile(
    r"^\d+$|^\d+년$|^\d+차$|^\d+회$|^제\d+|^\d+학년도$|^「|^\(|^\d{4}학년도$"
)
_STOP = frozenset(
    """
    운영 계획 계획서 안내 안내용 송부용 발송용 신청 신청서 제출 관련 결과 보고 보고서
    요청 실시 개최 참가 운영계획 세부 추진 대한 위한 붙임 서식 양식 명단 공문 자료
    학교명 숭의여고 숭의여자고등학교 학교 교육청 서울특별시교육청 프로그램 대상자 및 등
    """.split()
)

SYSTEM_PROMPT = (
    "당신은 학교 행정 문서를 정리하는 사람입니다. "
    "공문 제목에서 뽑은 말들을 보고 업무 용어집을 만듭니다."
)

USER_PROMPT = """아래는 학교 공문 제목에서 자주 나온 말과 등장 횟수입니다.
이 가운데 사업·제도·연수의 이름을 골라 용어집을 만드세요.

규칙
- 같은 사업의 다른 표기는 하나로 묶습니다.
  예) "AI정보교육 중심학교", "AI·정보교육 중심학교", "AI 중점학교" → 한 항목
- 대표 이름(term)은 가장 널리 쓰이는 표기로 정합니다.
- aliases에는 문서에서 실제로 쓰인 다른 표기를 넣습니다. 대표 이름은 넣지 않습니다.
- definition은 한 문장으로, 담당자가 "무슨 사업인지" 알 수 있게 씁니다.
  목록에 없는 내용을 지어내지 말고, 이름에서 알 수 있는 만큼만 씁니다.
- 사업 이름이 아닌 말(연도, 학교 이름, 문서 종류)은 빼세요.

JSON 배열로만 답하세요. 다른 말은 쓰지 마세요.
[{{"term": "...", "aliases": ["..."], "definition": "..."}}]

말 목록
{candidates}"""


@dataclass
class Term:
    term: str
    aliases: list[str] = field(default_factory=list)
    definition: str = ""
    count: int = 0

    @property
    def names(self) -> list[str]:
        return [self.term, *self.aliases]


@dataclass
class Expansion:
    """질문을 용어집으로 넓힌 결과."""

    text: str  # 검색에 쓸 질문(다른 표기를 덧붙인 것)
    keywords: list[str] = field(default_factory=list)  # 어휘 매칭에 더할 말
    terms: list[Term] = field(default_factory=list)  # 질문에서 알아본 용어


# --- 후보 뽑기 ---------------------------------------------------------------


def _tokens(title: str) -> list[str]:
    text = re.sub(r"[()\[\]<>_/,~]", " ", title)
    return [
        token
        for token in text.split()
        if len(token) >= 2 and not _NOISE.match(token) and token not in _STOP
    ]


def candidates(
    titles: list[str], min_count: int = MIN_COUNT, limit: int = MAX_CANDIDATES
) -> list[tuple[str, int]]:
    """제목에서 자주 나오는 말을 뽑는다.

    한 낱말짜리는 너무 흔해 사업을 가리키지 못하는 경우가 많으므로,
    두 낱말 이상을 먼저 세고 한 낱말은 길이가 긴 것만 남긴다.
    """
    counts: dict[str, int] = {}
    for title in titles:
        tokens = _tokens(title)
        for size in range(1, MAX_NGRAM + 1):
            for start in range(len(tokens) - size + 1):
                phrase = " ".join(tokens[start : start + size])
                if size == 1 and len(phrase) < 4:
                    continue
                counts[phrase] = counts.get(phrase, 0) + 1

    picked = [
        (phrase, count)
        for phrase, count in counts.items()
        if count >= min_count and len(phrase) >= 3
    ]
    picked.sort(key=lambda item: (-item[1], -len(item[0])))
    return picked[:limit]


# --- 용어집 만들기 -----------------------------------------------------------


def build_prompt(pairs: list[tuple[str, int]]) -> str:
    listing = "\n".join(f"- {term} ({count}회)" for term, count in pairs)
    return USER_PROMPT.format(candidates=listing)


def parse_response(text: str) -> list[Term]:
    """LLM이 돌려준 JSON에서 용어를 읽는다.

    앞뒤에 설명을 붙이는 경우가 있어 배열 부분만 잘라 읽는다.
    """
    start, end = text.find("["), text.rfind("]")
    if start < 0 or end < 0:
        return []
    try:
        payload = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return []

    terms = []
    for item in payload:
        name = (item.get("term") or "").strip()
        if not name:
            continue
        aliases = [
            alias.strip()
            for alias in item.get("aliases", [])
            if alias and alias.strip() and alias.strip() != name
        ]
        terms.append(
            Term(
                term=name,
                aliases=sorted(set(aliases)),
                definition=(item.get("definition") or "").strip(),
            )
        )
    return terms


def drop_truncated_aliases(terms: list[Term]) -> list[Term]:
    """대표 이름의 일부일 뿐인 별칭을 버린다.

    "과학중점학교"의 별칭으로 "중점학교"가 들어오면, 전혀 다른 사업인
    "AI 중점학교"까지 이 용어로 끌려온다. 잘린 이름은 넓게 걸리기만 하고
    대표 이름으로 이미 찾을 수 있어 얻는 것이 없다.
    """
    for term in terms:
        base = _normalize(term.term)
        term.aliases = [
            alias for alias in term.aliases if _normalize(alias) not in base
        ]
    return terms


def attach_counts(terms: list[Term], pairs: list[tuple[str, int]]) -> list[Term]:
    counts = dict(pairs)
    for term in terms:
        term.count = max((counts.get(name, 0) for name in term.names), default=0)
    return terms


# --- LLM이 묶은 것을 데이터로 검증하기 ---------------------------------------

ALIAS_THRESHOLD = 0.90

# 실제로 재 본 값이다.
#   0.93 ~ 1.00  같은 사업의 다른 표기 (과학중점학교 ↔ 서울형 과학중점학교)
#   0.79 이하    이름만 닮은 다른 사업 (과학중점학교 ↔ AI 중점학교)
# 이름이 비슷하면 LLM이 곧잘 묶어 버리는데, 잘못 묶으면 검색이 오히려 나빠진다.


def verify_aliases(
    terms: list[Term],
    titles: dict[str, str],
    ids: list[str],
    vectors,
    threshold: float = ALIAS_THRESHOLD,
) -> tuple[list[Term], list[tuple[str, str, float]]]:
    """별칭이 정말 같은 사업을 가리키는지 문서로 확인한다.

    어떤 이름이 제목에 든 문서들의 요약 벡터 평균을 내어, 대표 이름의 것과
    얼마나 가까운지 본다. 멀면 이름만 닮았을 뿐 다른 사업이다.

    돌려주는 것: (걸러 낸 용어집, 버린 별칭 목록)
    """
    import numpy as np

    position = {document_id: index for index, document_id in enumerate(ids)}

    def centroid(name: str):
        rows = [
            position[document_id]
            for document_id, title in titles.items()
            if document_id in position and _normalize(name) in _normalize(title)
        ]
        if not rows:
            return None
        average = vectors[rows].mean(axis=0)
        norm = float(np.linalg.norm(average)) or 1.0
        return average / norm

    dropped: list[tuple[str, str, float]] = []
    for term in terms:
        base = centroid(term.term)
        if base is None:
            continue

        kept = []
        for alias in term.aliases:
            other = centroid(alias)
            if other is None:
                dropped.append((term.term, alias, 0.0))  # 그 이름을 쓴 문서가 없다
                continue
            score = float(base @ other)
            if score < threshold:
                dropped.append((term.term, alias, score))
                continue
            kept.append(alias)
        term.aliases = kept

    return terms, dropped


# --- 저장하고 쓰기 -----------------------------------------------------------


def save(terms: list[Term], path: Path | None = None) -> Path:
    path = path or settings.DATA_DIR / "glossary.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "count": len(terms),
        "terms": [
            {
                "term": term.term,
                "aliases": term.aliases,
                "definition": term.definition,
                "count": term.count,
            }
            for term in terms
        ],
    }
    with open(path, "w", encoding="utf-8", errors="replace") as stream:
        stream.write(json.dumps(payload, ensure_ascii=False, indent=2))
    return path


def load(path: Path | None = None) -> list[Term]:
    requested_path = path
    path = path or settings.DATA_DIR / "glossary.json"
    # 생성 산출물이 없는 새 설치에서도 문서화된 기본 용어는 사용할 수 있게 한다.
    # 호출자가 경로를 명시한 경우에는 테스트/도구의 뜻을 존중해 대체하지 않는다.
    if requested_path is None and not path.exists():
        path = Path(__file__).with_name("glossary.seed.json")
    if not path.exists():
        return []
    try:
        with open(path, encoding="utf-8") as stream:
            payload = json.load(stream)
    except (json.JSONDecodeError, OSError):
        return []
    return [
        Term(
            term=item["term"],
            aliases=item.get("aliases", []),
            definition=item.get("definition", ""),
            count=item.get("count", 0),
        )
        for item in payload.get("terms", [])
    ]


_cached: list[Term] | None = None


def cached(path: Path | None = None) -> list[Term]:
    global _cached
    if _cached is None:
        _cached = load(path)
    return _cached


def reset_cache() -> None:
    global _cached
    _cached = None


def _normalize(text: str) -> str:
    """표기 차이를 지운다. 가운뎃점·공백·괄호가 문서마다 다르다."""
    return re.sub(r"[\s·・\-_()]", "", text).lower()


def find_terms(query: str, terms: list[Term] | None = None) -> list[Term]:
    """질문에 나온 용어를 찾는다. 표기가 달라도 알아본다."""
    terms = terms if terms is not None else cached()
    haystack = _normalize(query)
    return [
        term
        for term in terms
        if any(_normalize(name) in haystack for name in term.names if len(name) >= 2)
    ]


def expand(query: str, terms: list[Term] | None = None) -> Expansion:
    """질문에 같은 사업의 다른 표기를 덧붙인다."""
    found = find_terms(query, terms)
    if not found:
        return Expansion(text=query)

    extra: list[str] = []
    for term in found:
        for name in term.names:
            if _normalize(name) not in _normalize(query):
                extra.append(name)

    # 같은 말이 여러 번 붙지 않게 한다
    seen: set[str] = set()
    unique = [name for name in extra if not (_normalize(name) in seen or seen.add(_normalize(name)))]

    return Expansion(
        text=" ".join([query, *unique]) if unique else query,
        keywords=unique,
        terms=found,
    )
