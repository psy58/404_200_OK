import { Link } from "react-router-dom";
import { Chip } from "@/components/ui/Chip";
import { ChevronRightIcon } from "@/lib/icons";
import { daysUntil, formatShort } from "@/lib/dates";
import type { TaskInstance } from "@/domain/types";

export function TaskRow({ task }: { task: TaskInstance }) {
  const n = daysUntil(task.officialDueDate);
  const ddClass = n <= 5 ? "d0" : n <= 14 ? "d1" : "d2";
  const pct = task.checklistTotal > 0 ? Math.round((task.checklistDone / task.checklistTotal) * 100) : 0;

  return (
    <Link className="trow" to={`/tasks/${task.id}`}>
      <span className={`dd ${ddClass} num`}>{n < 0 ? "지남" : `D-${n}`}</span>
      <span>
        <span className="tt">{task.title}</span>
        <span className="tm">
          <Chip>{task.category}</Chip>
          <span>
            <span className="k">공식 마감</span> <span className="v">{formatShort(task.officialDueDate)}</span>
          </span>
          <span className="prev">
            <span className="k">작년 처리</span> <span className="v">{formatShort(task.previousActualDate)}</span>
          </span>
        </span>
      </span>
      <span className="prog">
        <span className="bar">
          <i style={{ width: `${pct}%` }} />
        </span>
        <span className="pn">
          {task.checklistDone}/{task.checklistTotal}
        </span>
      </span>
      <span className="go">
        <ChevronRightIcon />
      </span>
    </Link>
  );
}
