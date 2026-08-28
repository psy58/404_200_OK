#!/usr/bin/env python3 -m pytest
"""근거 법령 추출과 law.go.kr 연결.

네트워크를 쓰지 않는다. 실존 확인은 가짜 fetch 로 시험한다.
"""

import json

import pytest

from app.ingest import statutes
from app.ingest.statutes import Citation, extract, guess_category, resolve
from app.services import statute_service


# --- 추출 --------------------------------------------------------------------


def names(text: str) -> list[str]:
    return [c.display for c in extract(text)]


def test_bracketed_citation_with_article() -> None:
    found = extract("「초·중등교육법」 제23조에 따라 편성한다.")
    assert [(c.name, c.article) for c in found] == [("초ㆍ중등교육법", "제23조")]


def test_bare_citation_needs_an_article() -> None:
    """괄호 없는 인용은 조문이 붙어 있을 때만 믿는다."""
    assert names("개인정보보호법 제15조에 따라 수집한다.") == ["개인정보보호법 제15조"]
    assert names("교육 관련 법을 준수한다.") == []  # 조문 없는 맨 이름은 무시


def test_middle_dots_are_unified() -> None:
    """초·중등교육법 = 초ㆍ중등교육법 = 초‧중등교육법. law.go.kr 는 ㆍ만 안다."""
    dots = ["「초·중등교육법」", "「초ㆍ중등교육법」", "「초‧중등교육법」"]
    found = {c.name for text in dots for c in extract(text)}
    assert found == {"초ㆍ중등교육법"}


def test_invisible_characters_are_stripped() -> None:
    """HWP·PDF 변환이 낱말 사이에 폭 없는 문자를 끼워 넣는다."""
    text = "「환경교육의‌활성화‌및‌지원에‌관한‌법률」 제12조"
    assert extract(text)[0].name == "환경교육의활성화및지원에관한법률"


def test_article_glued_into_the_name_is_cut() -> None:
    """"화학물질관리법 제13조 및 동 시행규칙"의 이름은 화학물질관리법까지다."""
    found = extract("「화학물질관리법 제13조 및 동 시행규칙」")
    assert found[0].name == "화학물질관리법"


def test_leading_junk_words_are_trimmed() -> None:
    assert extract("출처 국가인권위원회법 제2조")[0].name == "국가인권위원회법"


def test_words_that_merely_end_like_a_law_are_rejected() -> None:
    assert names("실험 지도 방법 제2조를 참고한다.") == []


def test_same_citation_is_reported_once() -> None:
    text = "「개인정보 보호법」 제15조 … 개인정보 보호법 제15조에 따라"
    assert len(extract(text)) == 1


def test_article_free_duplicate_of_an_articled_citation_is_dropped() -> None:
    text = "「개인정보 보호법」에 따라 … 「개인정보 보호법」 제15조"
    assert names(text) == ["개인정보 보호법 제15조"]


# --- 링크 --------------------------------------------------------------------


def test_statute_url_includes_the_article() -> None:
    url = Citation(name="초ㆍ중등교육법", article="제23조").url
    assert url.startswith("https://www.law.go.kr/")
    assert "%EC%A0%9C23%EC%A1%B0" in url  # 제23조


def test_admin_rule_url_has_no_article_segment() -> None:
    """조문 경로는 법령에서만 동작을 확인했다."""
    citation = Citation(name="연구대회 관리에 관한 훈령", article="제4조", category="행정규칙")
    assert "%EC%A0%9C4%EC%A1%B0" not in citation.url


@pytest.mark.parametrize(
    "name, expected",
    [
        ("초ㆍ중등교육법", "법령"),
        ("전국과학전람회규칙", "법령"),  # 부령 — 규칙이라고 다 자치법규가 아니다
        ("연구대회 관리에 관한 훈령", "행정규칙"),
        ("학교생활기록부 기재요령", "행정규칙"),
        ("서울특별시교육청 안전한 과학실 환경 조성 지원에 관한 조례", "자치법규"),
    ],
)
def test_category_is_guessed_from_the_name(name: str, expected: str) -> None:
    assert guess_category(name) == expected


# --- 실존 확인 (가짜 fetch) ---------------------------------------------------


def fake_registry(*paths: str):
    """실존하는 한글주소 목록으로 fetch 를 흉내 낸다."""
    import urllib.parse

    def fetch(url: str) -> str:
        decoded = urllib.parse.unquote(url)
        for path in paths:
            if decoded.endswith(path):
                return path.split("/")[-1]  # 실존: 제목 = 법령명
        return "국가법령정보센터 | 오류페이지"

    return fetch


def test_resolve_confirms_the_guessed_category() -> None:
    resolution = resolve("초ㆍ중등교육법", fetch=fake_registry("법령/초ㆍ중등교육법"))
    assert resolution.category == "법령"
    assert resolution.resolved_name == "초ㆍ중등교육법"


def test_resolve_falls_back_to_other_categories() -> None:
    """"규칙"은 부령일 수도 교육청 규칙일 수도 있다. 열어 봐야 안다."""
    resolution = resolve(
        "전국과학전람회규칙", fetch=fake_registry("행정규칙/전국과학전람회규칙")
    )
    assert resolution.category == "행정규칙"


def test_resolve_drops_glued_leading_words() -> None:
    """표에서 뽑히면 앞말이 붙어 온다. 실존 확인이 자를 자리를 알려 준다."""
    resolution = resolve(
        "핸드폰번호 보유 및 이용기간 국세기본법", fetch=fake_registry("법령/국세기본법")
    )
    assert resolution.resolved_name == "국세기본법"


def test_resolve_reports_not_found() -> None:
    resolution = resolve("이런법은없다법", fetch=fake_registry())
    assert resolution.category is None
    assert resolution.tried  # 시도는 했다


# --- 서비스와 API ------------------------------------------------------------


@pytest.fixture
def statute_fixture(tmp_path):
    path = tmp_path / "statutes.json"
    path.write_text(
        json.dumps(
            {
                "laws": {
                    "개인정보 보호법": {
                        "category": "법령", "count": 3, "articles": ["제15조"],
                        "documents": ["doc_a", "doc_b"], "verified": True,
                        "resolved_name": "개인정보 보호법",
                    },
                    "없어진법": {
                        "category": None, "count": 1, "articles": [],
                        "documents": ["doc_a"], "verified": False,
                    },
                },
                "by_document": {
                    "doc_a": [
                        {"name": "개인정보 보호법", "article": "제15조",
                         "display": "개인정보 보호법 제15조", "category": "법령",
                         "url": "https://www.law.go.kr/x", "verified": True},
                    ],
                    "doc_b": [
                        {"name": "개인정보 보호법", "article": "제15조",
                         "display": "개인정보 보호법 제15조", "category": "법령",
                         "url": "https://www.law.go.kr/x", "verified": True},
                        {"name": "초ㆍ중등교육법", "article": None,
                         "display": "초ㆍ중등교육법", "category": "법령",
                         "url": "https://www.law.go.kr/y", "verified": True},
                    ],
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    statute_service.reset(path)
    yield
    statute_service.reset()


def test_citations_for_a_document(statute_fixture) -> None:
    assert statute_service.citations_for("doc_a")[0]["display"] == "개인정보 보호법 제15조"
    assert statute_service.citations_for("doc_없음") == []


def test_citations_across_documents_are_deduped_and_ranked(statute_fixture) -> None:
    """한 업무의 공문 여러 건이 같은 법을 인용하면 한 번만, 많이 인용된 순으로."""
    merged = statute_service.citations_for_documents(["doc_a", "doc_b"])
    assert [c["display"] for c in merged] == ["개인정보 보호법 제15조", "초ㆍ중등교육법"]


def test_statute_endpoints(statute_fixture, client) -> None:
    ledger = client.get("/api/v1/statutes").json()
    assert ledger["law_count"] == 2
    top = ledger["items"][0]
    assert top["name"] == "개인정보 보호법" and top["verified"] is True

    unresolved = next(i for i in ledger["items"] if i["name"] == "없어진법")
    assert "unSc.do" in unresolved["url"]  # 못 찾은 법은 검색으로 보낸다

    document = client.get("/api/v1/documents/doc_a/statutes").json()
    assert document["items"][0]["url"].startswith("https://www.law.go.kr/")
    # 인용 없는 문서는 404가 아니라 빈 목록이다
    assert client.get("/api/v1/documents/doc_없음/statutes").json()["items"] == []
