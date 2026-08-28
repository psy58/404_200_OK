"""3단계-2: 두 인덱스를 만든다.

    Summary Index   문서 요약   text-embedding-3-large
    Chunk Index     조각 본문   text-embedding-3-small

    python scripts/build_embeddings.py --dry-run          무엇을 얼마에 할지만
    python scripts/build_embeddings.py                    둘 다
    python scripts/build_embeddings.py --index chunk      한쪽만
    python scripts/build_embeddings.py --limit 100        앞의 100개만

키는 backend/.env 의 OPENAI_API_KEY 에서 읽는다.
이미 넣은 것은 건너뛰므로 중간에 끊겨도 다시 돌리면 이어서 한다.

주의: 조각 본문과 요약이 OpenAI로 전송된다. 업무 문서에는 학생·교직원
이름과 연락처가 들어 있다(요약에는 넣지 않도록 지시해 두었다).
"""

import argparse
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import settings  # noqa: E402
from app.rag import embedder, store  # noqa: E402

SUMMARY = "summary"
CHUNK = "chunk"


def build_one(
    index: str,
    vectors_dir: Path,
    limit: int | None,
    batch_size: int,
    dry_run: bool,
    opened: list,
) -> float:
    """인덱스 하나를 만든다. 이번에 쓴 예상 요금을 돌려준다."""
    if index == SUMMARY:
        model = settings.SUMMARY_EMBEDDING_MODEL
        documents = store.load_summary_documents()
        embeddings = embedder.build_embeddings(model)
        vector_store = store.open_summary_store(embeddings, vectors_dir)
        label = "Summary Index (문서 요약)"
    else:
        model = settings.CHUNK_EMBEDDING_MODEL
        documents = store.load_chunk_documents()
        embeddings = embedder.build_embeddings(model)
        vector_store = store.open_chunk_store(embeddings, vectors_dir)
        label = "Chunk Index (조각 본문)"

    opened.append(vector_store)
    print(f"── {label}")
    plan = embedder.plan(documents, vector_store, model, limit=limit)
    print(plan.render())

    if dry_run:
        print()
        return plan.cost
    if not plan.pending:
        print("새로 임베딩할 것이 없습니다.\n")
        return 0.0

    def show(done: int, total: int, elapsed: float) -> None:
        rate = done / elapsed if elapsed else 0
        remaining = (total - done) / rate if rate else 0
        print(
            f"  ... {done:,}/{total:,} ({done / total:.0%}) "
            f"남은 시간 약 {remaining / 60:.1f}분",
            flush=True,
        )

    started = time.time()
    added = embedder.run(vector_store, plan.pending, batch_size=batch_size, on_progress=show)
    print(
        f"{added:,}개 완료 / 인덱스 총 {store.count(vector_store):,}개"
        f" / {time.time() - started:.0f}초\n"
    )
    return plan.cost


def main() -> None:
    parser = argparse.ArgumentParser(description="요약·조각 임베딩")
    parser.add_argument("--vectors", type=Path, default=settings.VECTOR_DIR)
    parser.add_argument(
        "--index", choices=[SUMMARY, CHUNK, "all"], default="all", help="만들 인덱스"
    )
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=embedder.BATCH_SIZE)
    parser.add_argument("--dry-run", action="store_true", help="요금만 계산한다")
    args = parser.parse_args()

    targets = [SUMMARY, CHUNK] if args.index == "all" else [args.index]
    opened: list = []
    total = 0.0
    try:
        for index in targets:
            total += build_one(
                index, args.vectors, args.limit, args.batch_size, args.dry_run, opened
            )
    finally:
        # 색인 파일이 디스크에 쓰이도록 넣기를 마친 저장소를 닫는다.
        # 닫지 않으면 다음에 열 때 hnsw 색인을 읽지 못한다.
        for vector_store in opened:
            store.close(vector_store)

    print(f"예상 요금 합계 약 ${total:.2f}")
    print(f"저장 위치 {args.vectors}")


if __name__ == "__main__":
    main()
