"""문서에서 업무 흐름을 만들어 낸다.

    python scripts/build_workflows.py
    python scripts/build_workflows.py --show 5

relations.json 을 읽어 backend/data/workflows.json 을 만든다.
OpenAI를 부르지 않는다. 제목의 사업명과 행위어만 보고 만든다.
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import settings  # noqa: E402
from app.ingest import relations  # noqa: E402
from app.workflow import builder  # noqa: E402

MARK = {"completed": "✓", "current": "▶", "pending": "·"}


def main() -> None:
    parser = argparse.ArgumentParser(description="문서 → 업무 흐름")
    parser.add_argument("--relations", type=Path, default=settings.DATA_DIR / "relations.json")
    parser.add_argument("--out", type=Path, default=settings.DATA_DIR / "workflows.json")
    parser.add_argument("--show", type=int, default=3, help="보여 줄 업무 개수")
    args = parser.parse_args()

    graph = relations.load(args.relations)
    if not graph.get("nodes"):
        raise SystemExit(
            f"{args.relations} 가 비었습니다. 먼저 scripts/build_relations.py 를 돌리세요."
        )

    workflows = builder.build_all(graph["nodes"])
    payload = {
        "count": len(workflows),
        "workflows": [builder.to_dict(workflow) for workflow in workflows],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8", errors="replace") as stream:
        stream.write(json.dumps(payload, ensure_ascii=False, indent=2))

    by_template = Counter(workflow.template_id for workflow in workflows)
    documents = sum(workflow.document_count for workflow in workflows)
    print(f"업무 {len(workflows)}개 / 문서 {documents}건")
    for template_id, count in by_template.most_common():
        print(f"  {template_id:20} {count}개")

    for workflow in workflows[: args.show]:
        done = sum(1 for step in workflow.steps if step.status == "completed")
        print(f"\n[{workflow.name}] {done}/{len(workflow.steps)}단계 · 문서 {workflow.document_count}건")
        for step in workflow.steps:
            date = step.completed_at.isoformat() if step.completed_at else ""
            print(f"  {MARK[step.status]} {step.name:8} {date:12} 문서 {len(step.document_ids)}건")

    print(f"\n{args.out}")


if __name__ == "__main__":
    main()
