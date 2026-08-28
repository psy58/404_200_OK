"""공문에서 근거 법령을 뽑아 법령 대장을 만든다.

    python scripts/build_statutes.py             추출만 (네트워크 없음)
    python scripts/build_statutes.py --verify    law.go.kr 에 실존 확인까지

backend/data/markdown/**/*.md 를 훑어 backend/data/statutes.json 을 만들고,
사람이 보는 대장은 docs/STATUTES.md 로 쓴다.

--verify 는 법령마다 한글주소를 실제로 열어 본다. 없는 이름이면 오류페이지가
오므로, 오검출(뽑았지만 법령이 아닌 것)과 종류 오판(법령↔행정규칙↔자치법규)을
여기서 걸러 낸다. 문서 본문은 어디에도 보내지 않는다 — 법령 이름만 조회한다.
"""

import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from app import settings  # noqa: E402
from app.ingest import frontmatter, statutes  # noqa: E402

DOC_PAGE = ROOT_DIR / "docs" / "STATUTES.md"


def scan(markdown_dir: Path) -> tuple[dict, dict]:
    """문서마다 인용을 뽑는다. (문서별 인용, 법령별 집계)

    "개인정보보호법"과 "개인정보 보호법"은 같은 법이다. 집계는 공백을 뺀
    형태로 묶고, 표기는 더 자주 나온 쪽을 대표로 쓴다.
    """
    by_document: dict[str, list[dict]] = {}
    by_law: dict[str, dict] = defaultdict(
        lambda: {"count": 0, "articles": set(), "documents": set(), "category": None}
    )
    spellings: dict[str, defaultdict] = {}  # 공백 제거형 -> {표기: 횟수}

    for path in sorted(markdown_dir.rglob("*.md")):
        if path.name.startswith("_"):
            continue
        meta, body = frontmatter.parse(
            path.read_text(encoding="utf-8", errors="replace")
        )
        document_id = meta.get("document_id")
        if not document_id:
            continue

        citations = statutes.extract(body)
        if not citations:
            continue

        by_document[document_id] = [
            {
                "name": c.name,
                "article": c.article,
                "category": c.category,
                "url": c.url,
                "display": c.display,
            }
            for c in citations
        ]
        for c in citations:
            key = c.name.replace(" ", "")
            law = by_law[key]
            law["count"] += 1
            law["category"] = c.category
            law["documents"].add(document_id)
            if c.article:
                law["articles"].add(c.article)
            spellings.setdefault(key, defaultdict(int))[c.name] += 1

    # 대표 표기(가장 흔한 것)를 키로 되돌린다
    merged = {}
    for key, law in by_law.items():
        best = max(spellings[key].items(), key=lambda kv: kv[1])[0]
        merged[best] = law
    return by_document, merged


def verify(by_law: dict, delay: float = 0.3) -> dict[str, statutes.Resolution]:
    """법령마다 law.go.kr 실존을 확인한다. 이름만 보낸다."""
    resolutions: dict[str, statutes.Resolution] = {}
    names = sorted(by_law)
    for index, name in enumerate(names, start=1):
        resolutions[name] = statutes.resolve(name)
        found = resolutions[name].category or "못 찾음"
        print(f"  [{index}/{len(names)}] {found:6} {name[:44]}", flush=True)
        time.sleep(delay)  # 공공 사이트다. 몰아치지 않는다
    return resolutions


def apply_resolutions(by_document: dict, by_law: dict, resolutions: dict) -> int:
    """검증 결과를 반영한다. 못 찾은 이름은 검색 링크로 바꾼다."""
    dropped = 0
    for name, law in by_law.items():
        resolution = resolutions.get(name)
        if resolution is None:
            continue
        if resolution.category is None:
            law["verified"] = False
            dropped += 1
            continue
        law["verified"] = True
        law["category"] = resolution.category
        law["resolved_name"] = resolution.resolved_name

    for citations in by_document.values():
        for citation in citations:
            resolution = resolutions.get(citation["name"])
            if resolution is None:
                continue
            if resolution.category is None:
                # 실존을 확인 못 했다. 틀린 상세 링크 대신 검색으로 보낸다.
                citation["verified"] = False
                citation["url"] = statutes.Citation(name=citation["name"]).search_url
            else:
                citation["verified"] = True
                fixed = statutes.Citation(
                    name=resolution.resolved_name,
                    article=citation["article"],
                    category=resolution.category,
                )
                citation["url"] = fixed.url
                citation["category"] = resolution.category
    return dropped


def write_page(by_law: dict, path: Path, verified_run: bool) -> None:
    lines = [
        "# 근거 법령 대장",
        "",
        f"공문 본문에서 뽑은 법령 {len(by_law)}종. 링크는 국가법령정보센터(law.go.kr)의",
        "한글주소다." + (" ✓ 표시는 실존을 확인한 것." if verified_run else ""),
        "",
        "| 법령 | 종류 | 인용 | 조문 | 링크 |",
        "|---|---|---:|---|---|",
    ]
    ranked = sorted(by_law.items(), key=lambda kv: -kv[1]["count"])
    for name, law in ranked:
        mark = ""
        if verified_run:
            mark = " ✓" if law.get("verified") else " ?"
        articles = ", ".join(sorted(law["articles"])[:4]) or "-"
        display_name = law.get("resolved_name") or name
        citation = statutes.Citation(name=display_name, category=law["category"] or "법령")
        url = citation.url if law.get("verified", True) else citation.search_url
        lines.append(
            f"| {name}{mark} | {law['category'] or '?'} | {law['count']} "
            f"| {articles} | [law.go.kr]({url}) |"
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="근거 법령 추출")
    parser.add_argument("--markdown", type=Path, default=settings.MARKDOWN_DIR)
    parser.add_argument("--out", type=Path, default=settings.DATA_DIR / "statutes.json")
    parser.add_argument("--page", type=Path, default=DOC_PAGE)
    parser.add_argument(
        "--verify", action="store_true", help="law.go.kr 에 실존 확인 (법령 이름만 조회)"
    )
    args = parser.parse_args()

    by_document, by_law = scan(args.markdown)
    print(f"법령 인용 문서 {len(by_document)}건 / 법령 {len(by_law)}종")

    unresolved = 0
    if args.verify:
        print("\nlaw.go.kr 실존 확인 중…")
        resolutions = verify(by_law)
        unresolved = apply_resolutions(by_document, by_law, resolutions)
        confirmed = sum(1 for law in by_law.values() if law.get("verified"))
        print(f"\n확인됨 {confirmed}종 / 못 찾음 {unresolved}종 (검색 링크로 대체)")

    payload = {
        "verified_run": args.verify,
        "law_count": len(by_law),
        "laws": {
            name: {
                "category": law["category"],
                "count": law["count"],
                "articles": sorted(law["articles"]),
                "documents": sorted(law["documents"]),
                "verified": law.get("verified"),
                "resolved_name": law.get("resolved_name"),
            }
            for name, law in by_law.items()
        },
        "by_document": by_document,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8", errors="replace") as stream:
        stream.write(json.dumps(payload, ensure_ascii=False, indent=2))

    write_page(by_law, args.page, args.verify)
    print(f"\n{args.out}\n{args.page}")


if __name__ == "__main__":
    main()
