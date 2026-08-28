"""1단계: 업무 문서를 전부 Markdown 파일로 바꾼다.

    python scripts/convert_to_markdown.py                  업무목록 전체
    python scripts/convert_to_markdown.py --limit 20       앞의 20건만
    python scripts/convert_to_markdown.py --ext .hwp .pdf  특정 형식만
    python scripts/convert_to_markdown.py --overwrite      이미 만든 것도 다시

결과는 backend/data/markdown/ 아래에 원본과 같은 폴더 구조로 쌓인다.
이미 변환한 파일은 건너뛰므로 중간에 멈춰도 이어서 돌리면 된다.

구버전 HWP는 한글 오피스로 HWPX를 만든 뒤 변환한다(표가 표로 남는다).
한글이 없는 환경에서는 자동으로 파이썬 변환으로 물러선다.
"""

import argparse
import json
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.ingest import catalog, converter  # noqa: E402

DEFAULT_SOURCE = ROOT_DIR / "업무목록"
DEFAULT_OUTPUT = BACKEND_DIR / "data" / "markdown"


def main() -> None:
    parser = argparse.ArgumentParser(description="업무 문서 → Markdown")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, default=None, help="변환할 최대 건수")
    parser.add_argument("--ext", nargs="*", default=None, help="예: --ext .pdf .hwp")
    parser.add_argument(
        "--overwrite", action="store_true", help="이미 변환한 파일도 다시 만든다"
    )
    parser.add_argument(
        "--no-hancom",
        action="store_true",
        help="구버전 HWP를 한글 오피스 대신 파이썬으로 변환한다(표가 흩어진다)",
    )
    args = parser.parse_args()

    if not args.source.exists():
        raise SystemExit(f"원본 폴더가 없습니다: {args.source}")

    print(f"원본: {args.source}")
    print(f"출력: {args.out}")
    started = time.time()

    report = converter.convert_tree(
        args.source,
        args.out,
        limit=args.limit,
        extensions={e.lower() for e in args.ext} if args.ext else None,
        overwrite=args.overwrite,
        use_hancom=not args.no_hancom,
    )

    print()
    print(report.render())

    # 실패·건너뜀 사유를 파일로 남긴다. 목록에 그대로 실린다.
    report_path = args.out.parent / "conversion_report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_path, "w", encoding="utf-8", errors="replace") as stream:
        stream.write(json.dumps(report.to_dict(), ensure_ascii=False, indent=2))

    # 변환 결과를 눈으로 확인할 수 있게 목록을 만든다.
    index_path, built = catalog.write_index(args.out, report_path)
    print()
    print(f"목록 {index_path}")
    print(f"  문서 {len(built.entries):,}건 / 확인이 필요한 문서 {len(built.short_entries):,}건")
    print(f"{time.time() - started:.0f}초")


if __name__ == "__main__":
    main()
