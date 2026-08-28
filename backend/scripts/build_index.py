"""2단계: Markdown 파일을 LangChain으로 읽어 조각 저장소를 만든다.

    python scripts/build_index.py

backend/data/markdown/**/*.md 를 읽어 backend/data/documents.json 을 만든다.
원본 문서는 건드리지 않으므로, 조각 크기를 바꿔 가며 몇 번이든 다시 돌릴 수 있다.

다음 단계(임베딩·벡터 저장소)도 여기서 만든 LangChain Document를 그대로 받으면 된다.
"""

import argparse
import json
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.ingest import splitter  # noqa: E402

DEFAULT_MARKDOWN_DIR = BACKEND_DIR / "data" / "markdown"
DEFAULT_OUTPUT = BACKEND_DIR / "data" / "documents.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="Markdown → 조각 저장소")
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN_DIR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    if not args.markdown.exists():
        raise SystemExit(
            f"Markdown 폴더가 없습니다: {args.markdown}\n"
            "먼저 scripts/convert_to_markdown.py 를 돌리세요."
        )

    started = time.time()
    records, chunk_total = splitter.build_records(args.markdown)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8", errors="replace") as stream:
        stream.write(
            json.dumps(
                {
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "markdown_dir": str(args.markdown),
                    "document_count": len(records),
                    "chunk_count": chunk_total,
                    "documents": records,
                },
                ensure_ascii=False,
            )
        )

    by_type = Counter(record["source_type"] for record in records)
    print(f"문서 {len(records)}건 / 조각 {chunk_total}개")
    print()
    print("형식별 문서:")
    for source_type, count in by_type.most_common():
        print(f"  {source_type:6} {count}")
    print()
    size_mb = args.out.stat().st_size / 1024 / 1024
    print(f"{args.out} ({size_mb:.1f} MB), {time.time() - started:.0f}초")


if __name__ == "__main__":
    main()
