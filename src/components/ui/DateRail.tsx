import { daysBetween, formatShort, parseISODate, TODAY } from "@/lib/dates";
import type { TaskInstance } from "@/domain/types";

/**
 * The "three dates" signature visualization: recommended start, official
 * due date, and last year's actual completion date on one shared axis, plus
 * today's position — see docs/01 §12 UX02/UX03 (5초/10초/30초 요구).
 */
export function DateRail({ task }: { task: TaskInstance }) {
  const prep = parseISODate(task.recommendedStartDate);
  const due = parseISODate(task.officialDueDate);
  const prev = parseISODate(task.previousActualDate);
  const prevThisYear = new Date(prev.getFullYear() + 1, prev.getMonth(), prev.getDate());

  const lo = new Date(Math.min(prep.getTime(), prevThisYear.getTime(), TODAY.getTime()) - 7 * 86_400_000);
  const hi = new Date(Math.max(due.getTime(), TODAY.getTime()) + 7 * 86_400_000);
  const span = daysBetween(lo, hi) || 1;
  const pct = (d: Date) => Math.max(3, Math.min(97, (daysBetween(lo, d) / span) * 100));

  const a = pct(prep);
  const b = pct(due);
  const n = pct(TODAY);
  const v = pct(prevThisYear);

  return (
    <div className="rail-track">
      <span className="rail-line" />
      <span className="rail-fill" style={{ left: `${a}%`, width: `${Math.max(0, n - a)}%` }} />
      <span className="rcap up" style={{ left: `${a}%`, color: "var(--navy-500)" }}>
        준비 {formatShort(task.recommendedStartDate)}
      </span>
      <span className="rnode" style={{ left: `${a}%` }}>
        <i />
      </span>
      <span className="rnode prev" style={{ left: `${v}%` }}>
        <i />
      </span>
      <span className="rcap dn" style={{ left: `${v}%`, color: "var(--gam-ink)" }}>
        작년 {formatShort(task.previousActualDate)}
      </span>
      <span className="rnode now" style={{ left: `${n}%` }}>
        <i />
      </span>
      <span className="rcap up" style={{ left: `${n}%`, color: "var(--ok-ink)" }}>
        오늘
      </span>
      <span className="rnode due" style={{ left: `${b}%` }}>
        <i />
      </span>
      <span className="rcap dn" style={{ left: `${b}%`, color: "var(--navy-700)" }}>
        마감 {formatShort(task.officialDueDate)}
      </span>
    </div>
  );
}
