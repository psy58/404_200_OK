"""3단계-1: 문서마다 요약을 만든다. Summary Index의 재료다.

    python scripts/build_summaries.py --dry-run    무엇을 얼마에 할지만 보여 준다
    python scripts/build_summaries.py              전체 요약
    python scripts/build_summaries.py --limit 5    앞의 5건만 (품질 확인용)

결과는 backend/data/summaries.json 에 쌓인다. 이미 요약한 문서는 건너뛰므로
중간에 끊겨도 다시 돌리면 이어서 한다.

주의: 문서 본문 앞부분이 OpenAI로 전송된다.
"""

import argparse
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import settings  # noqa: E402
from app.rag import store, summarizer  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="문서 요약 생성")
    parser.add_argument("--documents", type=Path, default=settings.DOCUMENTS_PATH)
    parser.add_argument("--out", type=Path, default=settings.SUMMARIES_PATH)
    parser.add_argument("--model", default=settings.SUMMARY_MODEL)
    parser.add_argument("--limit", type=int, default=None, help="이번에 처리할 문서 수")
    parser.add_argument("--workers", type=int, default=summarizer.MAX_WORKERS)
    parser.add_argument("--dry-run", action="store_true", help="요금만 계산한다")
    parser.add_argument("--show", action="store_true", help="만들어진 요약을 출력한다")
    args = parser.parse_args()

    records = store.read_documents_file(args.documents)
    done = summarizer.load_summaries(args.out)
    plan = summarizer.plan(records, done, args.model, limit=args.limit)

    print(plan.render())
    print()

    if args.dry_run:
        print("--dry-run 이므로 호출하지 않았습니다.")
        return
    if not plan.pending:
        print("새로 요약할 문서가 없습니다.")
        return

    llm = summarizer.build_llm(args.model)

    def show(finished: int, total: int, elapsed: float) -> None:
        if finished % 25 and finished != total:
            return
        rate = finished / elapsed if elapsed else 0
        remaining = (total - finished) / rate if rate else 0
        print(
            f"  ... {finished:,}/{total:,} ({finished / total:.0%}) "
            f"남은 시간 약 {remaining / 60:.1f}분",
            flush=True,
        )

    started = time.time()
    summaries = summarizer.run(
        llm,
        plan.pending,
        done,
        save=lambda current: summarizer.save_summaries(current, args.model, args.out),
        workers=args.workers,
        on_progress=show,
    )

    print()
    print(f"요약 {len(summaries):,}건 / {args.out} / {time.time() - started:.0f}초")

    if args.show:
        print()
        for record in plan.pending[:5]:
            summary = summaries.get(record["document_id"], "")
            print(f"- {record['title'][:45]}")
            print(f"  {summary}")
            print()


if __name__ == "__main__":
    main()
