"""변환된 .md 파일의 목록을 다시 만든다.

    python scripts/markdown_index.py

backend/data/markdown/_INDEX.md 를 만든다. 변환을 다시 돌리지 않아도 되고,
에디터에서 이 파일 하나만 열면 무엇이 어떻게 변환됐는지 볼 수 있다.
"""

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import settings  # noqa: E402
from app.ingest import catalog  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="변환 결과 목록 만들기")
    parser.add_argument("--markdown", type=Path, default=settings.MARKDOWN_DIR)
    args = parser.parse_args()

    if not args.markdown.exists():
        raise SystemExit(f"Markdown 폴더가 없습니다: {args.markdown}")

    report_path = args.markdown.parent / "conversion_report.json"
    path, built = catalog.write_index(args.markdown, report_path)
    short = built.short_entries
    print(f"문서 {len(built.entries):,}건")
    print(f"  확인이 필요한 문서(짧은 변환 결과) {len(short):,}건")
    print(f"\n{path}")


if __name__ == "__main__":
    main()
