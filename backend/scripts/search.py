"""벡터 검색을 눈으로 확인하는 도구.

    python scripts/search.py "과학대회 참가 신청 서류가 뭔가요"
    python scripts/search.py "출장 여비 지급" --direction received -k 3
"""

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.rag.retriever import Searcher  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="업무 문서 검색")
    parser.add_argument("query", help="질문")
    parser.add_argument("-k", type=int, default=5, help="가져올 조각 수")
    parser.add_argument("--documents", type=int, default=10, help="1단계에서 고를 문서 수")
    parser.add_argument("--direction", choices=["drafted", "received"], default=None)
    parser.add_argument("--doc-number", default=None)
    args = parser.parse_args()

    searcher = Searcher.open()
    counts = searcher.counts()
    print(f"요약 {counts['summaries']:,}건 / 조각 {counts['chunks']:,}개")

    matches = searcher.find_documents(
        args.query, k=args.documents, direction=args.direction, doc_number=args.doc_number
    )
    print()
    print(f"1단계 - 요약으로 고른 문서 {len(matches)}건")
    for match in matches[:5]:
        print(f"  {match.relevance:.3f}  {match.title[:55]}")
    print()
    print("2단계 - 그 문서들 안에서 찾은 근거")
    print()

    hits = searcher.search(
        args.query,
        k=args.k,
        document_candidates=args.documents,
        direction=args.direction,
        doc_number=args.doc_number,
    )
    if not hits:
        print("찾은 조각이 없습니다.")
        return

    for rank, hit in enumerate(hits, start=1):
        document_score = (
            f" (문서 {hit.document_relevance:.3f})" if hit.document_relevance else ""
        )
        print(f"[{rank}] 조각 {hit.relevance:.3f}{document_score}  {hit.title[:45]}")
        where = " / ".join(
            part for part in (hit.doc_number, hit.source_type, hit.section) if part
        )
        if where:
            print(f"     {where}")
        text = " ".join(hit.content.split())
        print(f"     {text[:160]}")
        print(f"     GET /api/v1/documents/{hit.document_id}/chunks/{hit.chunk_id}")
        print()


if __name__ == "__main__":
    main()
