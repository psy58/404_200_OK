"""업무 용어집을 만든다.

    python scripts/build_glossary.py --dry-run   뽑힌 후보만 보여 준다
    python scripts/build_glossary.py             용어집을 만든다

문서 제목에서 자주 나오는 말을 뽑아(비용 없음), 같은 사업끼리 묶고 뜻을 붙이는
일만 LLM에 맡긴다. 결과는 backend/data/glossary.json 과 docs/GLOSSARY.md 다.
"""

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from app import settings  # noqa: E402
from app.ingest import similarity  # noqa: E402
from app.rag import glossary, store, summarizer  # noqa: E402

DOC_PAGE = ROOT_DIR / "docs" / "GLOSSARY.md"


def write_markdown(terms: list[glossary.Term], path: Path) -> Path:
    lines = [
        "# 업무 용어집",
        "",
        f"공문 제목에서 뽑은 사업·제도 이름 {len(terms)}개. 문서마다 표기가 달라",
        "질문과 문서가 어긋나는 것을 막기 위해 같은 것끼리 묶어 두었다.",
        "",
        "검색할 때 질문에 이 이름이 나오면 다른 표기를 함께 넣어 찾는다.",
        "",
        "| 용어 | 다른 표기 | 설명 |",
        "|---|---|---|",
    ]
    for term in sorted(terms, key=lambda t: -t.count):
        aliases = ", ".join(term.aliases) if term.aliases else "-"
        lines.append(f"| **{term.term}** | {aliases} | {term.definition} |")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description="업무 용어집 만들기")
    parser.add_argument("--documents", type=Path, default=settings.DOCUMENTS_PATH)
    parser.add_argument("--out", type=Path, default=settings.DATA_DIR / "glossary.json")
    parser.add_argument("--page", type=Path, default=DOC_PAGE)
    parser.add_argument("--model", default=settings.SUMMARY_MODEL)
    parser.add_argument("--min-count", type=int, default=glossary.MIN_COUNT)
    parser.add_argument("--limit", type=int, default=glossary.MAX_CANDIDATES)
    parser.add_argument("--dry-run", action="store_true", help="후보만 보고 끝낸다")
    args = parser.parse_args()

    records = store.read_documents_file(args.documents)
    titles = [record["title"] for record in records if record.get("title")]
    pairs = glossary.candidates(titles, min_count=args.min_count, limit=args.limit)

    print(f"문서 {len(titles):,}건에서 후보 {len(pairs)}개")
    if args.dry_run:
        for term, count in pairs:
            print(f"  {count:3}회  {term}")
        tokens = summarizer.count_tokens([glossary.build_prompt(pairs)], args.model)
        print(f"\n입력 토큰 약 {tokens:,}개 / 모델 {args.model}")
        return

    llm = summarizer.build_llm(args.model)
    response = llm.invoke(
        [("system", glossary.SYSTEM_PROMPT), ("human", glossary.build_prompt(pairs))]
    )
    terms = glossary.parse_response(response.content or "")
    terms = glossary.attach_counts(glossary.drop_truncated_aliases(terms), pairs)
    if not terms:
        raise SystemExit("용어를 하나도 읽지 못했습니다. 모델 응답을 확인하세요.")

    # 이름이 비슷하면 LLM이 다른 사업을 같은 것으로 묶기도 한다. 문서로 확인한다.
    titles_by_id = {r["document_id"]: r.get("title", "") for r in records}
    ids, vectors = similarity.load_summary_vectors()
    terms, dropped = glossary.verify_aliases(terms, titles_by_id, ids, vectors)
    if dropped:
        print()
        print(f"다른 사업으로 판단해 뺀 별칭 {len(dropped)}개")
        for term, alias, score in dropped:
            reason = f"유사도 {score:.3f}" if score else "그 이름을 쓴 문서 없음"
            print(f"  {term} ↮ {alias}  ({reason})")

    path = glossary.save(terms, args.out)
    page = write_markdown(terms, args.page)

    print(f"용어 {len(terms)}개")
    for term in sorted(terms, key=lambda t: -t.count)[:10]:
        aliases = f" (= {', '.join(term.aliases)})" if term.aliases else ""
        print(f"  {term.count:3}회  {term.term}{aliases}")
    print(f"\n{path}\n{page}")


if __name__ == "__main__":
    main()
