"""공문을 분석해 문서 사이의 연결을 만든다.

    python scripts/build_relations.py
    python scripts/build_relations.py --show 10    이어진 사슬을 몇 개 보여 준다

backend/data/markdown/**/*.md 를 읽어 backend/data/relations.json 을 만든다.
OpenAI를 부르지 않는다. 공문 서식만 보고 잇는다.
"""

import argparse
import sys
from collections import Counter
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import settings  # noqa: E402
from app.ingest import relations, similarity  # noqa: E402


def show_chains(graph: relations.RelationGraph, limit: int) -> None:
    """관련으로 이어진 문서 사슬을 보여 준다."""
    forward = [edge for edge in graph.edges if edge.type == relations.RELATED]
    print(f"\n관련으로 이어진 문서 {len(forward)}쌍 (앞의 {limit}개)")
    for edge in forward[:limit]:
        source = graph.nodes[edge.source]
        target = graph.nodes[edge.target]
        print(f"\n  {source.title[:46]}")
        print(f"    {source.direction} / 결재 {source.approval_date or '-'}")
        print(f"    └─관련({edge.label})─▶ {target.title[:46]}")
        print(f"       {target.direction} / 시행 {target.issuing_date or '-'}")


def main() -> None:
    parser = argparse.ArgumentParser(description="공문 분석 → 문서 연결")
    parser.add_argument("--markdown", type=Path, default=settings.MARKDOWN_DIR)
    parser.add_argument("--out", type=Path, default=settings.DATA_DIR / "relations.json")
    parser.add_argument("--show", type=int, default=5, help="보여 줄 사슬 개수")
    parser.add_argument(
        "--no-suggest",
        action="store_true",
        help="내용·날짜로 추정한 연결을 빼고 문서번호로 이은 것만 남긴다",
    )
    args = parser.parse_args()

    if not args.markdown.exists():
        raise SystemExit(
            f"Markdown 폴더가 없습니다: {args.markdown}\n"
            "먼저 scripts/convert_to_markdown.py 를 돌리세요."
        )

    graph = relations.build(args.markdown, suggest=not args.no_suggest)
    path = relations.save(graph, args.out)

    official_count = sum(1 for node in graph.nodes.values() if node.issuing_number)
    dated = sum(1 for node in graph.nodes.values() if node.approval_date)
    by_type = Counter(edge.type for edge in graph.edges)

    print(f"문서 {len(graph.nodes):,}건")
    print(f"  공문 서식(시행 번호 있음) {official_count:,}건")
    print(f"  결재일자 확인 {dated:,}건")
    print()
    print(f"연결 {len(graph.edges):,}개")
    for edge_type, count in by_type.most_common():
        label = {
            relations.ATTACHMENT: "본문 ↔ 첨부",
            relations.RELATED: "관련 (앞선 문서)",
            relations.FOLLOW_UP: "후속 (뒤따른 문서)",
            similarity.SAME_TOPIC: "같은 사업 (추정)",
            similarity.LIKELY_FOLLOW_UP: "후속 (추정)",
        }.get(edge_type, edge_type)
        print(f"  {label:20} {count:,}")
    print()
    print(f"연결하지 못한 관련 참조 {len(graph.unresolved):,}건 (우리가 갖고 있지 않은 문서)")

    if args.show:
        show_chains(graph, args.show)

    print(f"\n{path}")


if __name__ == "__main__":
    main()
