import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getTasks } from "@/services/tasksService";
import { useAssignment } from "@/state/AssignmentContext";
import { qk } from "@/state/queryKeys";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { formatShort, MONTHS } from "@/lib/dates";
import type { TaskInstance, TaskStatus } from "@/domain/types";

const STATUS_LABEL: Record<TaskStatus, string> = {
  in_progress: "진행중",
  upcoming: "준비",
  planned: "예정",
  complete: "완료",
};
const CURRENT_MONTH_INDEX = 5; // August in the 3월~다음해2월 axis (index 5 = 8월)

function barClass(status: TaskStatus): string {
  if (status === "complete") return "done";
  if (status === "in_progress") return "live";
  return "";
}

export function AnnualMapPage() {
  const { activeAssignment, activeAssignmentId } = useAssignment();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const tasksQuery = useQuery({
    queryKey: qk.tasks(activeAssignmentId ?? ""),
    queryFn: ({ signal }) => getTasks(activeAssignmentId ?? "", signal),
    enabled: !!activeAssignmentId,
  });

  const categories = useMemo(
    () => Array.from(new Set((tasksQuery.data ?? []).map((t) => t.category))),
    [tasksQuery.data],
  );

  const filtered = (tasksQuery.data ?? []).filter(
    (t) => (statusFilter === "all" || t.status === statusFilter) && (!categoryFilter || t.category === categoryFilter),
  );

  const statusCounts = useMemo(() => {
    const all = tasksQuery.data ?? [];
    const counts: Record<TaskStatus, number> = { in_progress: 0, upcoming: 0, planned: 0, complete: 0 };
    all.forEach((t) => counts[t.status]++);
    return counts;
  }, [tasksQuery.data]);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">
            {activeAssignment?.name ?? ""} · {activeAssignment ? "2026학년도" : ""}
          </span>
          <h1 className="t-display" style={{ marginTop: 9 }}>
            연간 업무 지도
          </h1>
          <p className="sub">3월부터 다음 해 2월까지의 업무 일정</p>
        </div>
      </div>

      <div className="filters">
        <button className="fchip" aria-pressed={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
          전체 <span className="c num">{tasksQuery.data?.length ?? 0}</span>
        </button>
        {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
          <button key={s} className="fchip" aria-pressed={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {STATUS_LABEL[s]} <span className="c num">{statusCounts[s]}</span>
          </button>
        ))}
        <span style={{ width: 1, height: 22, background: "var(--line)", margin: "0 4px" }} />
        {categories.map((c) => (
          <button
            key={c}
            className="fchip"
            aria-pressed={categoryFilter === c}
            onClick={() => setCategoryFilter((cur) => (cur === c ? null : c))}
          >
            {c}
          </button>
        ))}
      </div>

      <QueryBoundary query={tasksQuery} isEmpty={() => filtered.length === 0} emptyTitle="조건에 맞는 업무가 없습니다">
        {() => (
          <section className="card card-pad">
            <div className="map-scroll">
              <div className="map-inner">
                <div className="map-months">
                  <span />
                  {MONTHS.map((m, i) => (
                    <span key={m} className={`mh${i === CURRENT_MONTH_INDEX ? " now" : ""}`}>
                      {m}
                    </span>
                  ))}
                </div>
                <div style={{ position: "relative", paddingTop: 26 }}>
                  <span
                    className="map-now"
                    style={{ left: `calc(230px + (100% - 230px) * ${(CURRENT_MONTH_INDEX + 0.9) / 12})` }}
                  />
                  {filtered.map((t) => (
                    <MapRow key={t.id} task={t} onOpen={() => navigate(`/tasks/${t.id}`)} />
                  ))}
                </div>
              </div>
            </div>
            <div className="legend">
              <span className="leg">
                <span className="sw" style={{ background: "var(--navy-700)" }} />
                <span>
                  <span className="lt">진행 중</span>
                  <br />
                  <span className="lv">{statusCounts.in_progress}건</span>
                </span>
              </span>
              <span className="leg">
                <span className="sw" style={{ background: "var(--navy-100)" }} />
                <span>
                  <span className="lt">준비·예정</span>
                  <br />
                  <span className="lv">{statusCounts.upcoming + statusCounts.planned}건</span>
                </span>
              </span>
              <span className="leg">
                <span className="sw" style={{ background: "#E2E8F0" }} />
                <span>
                  <span className="lt">완료</span>
                  <br />
                  <span className="lv">{statusCounts.complete}건</span>
                </span>
              </span>
              <span className="leg">
                <span className="sw" style={{ background: "var(--gam)" }} />
                <span>
                  <span className="lt">주황 점</span>
                  <br />
                  <span className="lv">작년 실제 처리일</span>
                </span>
              </span>
            </div>
          </section>
        )}
      </QueryBoundary>

      <div className="mlist" style={{ display: filtered.length ? undefined : "none" }}>
        {filtered.map((t) => (
          <button className="mi" key={t.id} onClick={() => navigate(`/tasks/${t.id}`)}>
            <span className="mt">{t.title}</span>
            <span className="mm">
              <span>준비 {formatShort(t.recommendedStartDate)}</span>
              <span>마감 {formatShort(t.officialDueDate)}</span>
              <span>작년 {formatShort(t.previousActualDate)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MapRow({ task, onOpen }: { task: TaskInstance; onOpen: () => void }) {
  const start = task.timelineMonthStart + 2;
  const end = task.timelineMonthEnd + 3;
  return (
    <div className="map-row">
      <span className="map-label">
        {task.title}
        <span className="mm">
          준비 {formatShort(task.recommendedStartDate)} · 마감 {formatShort(task.officialDueDate)} · 작년{" "}
          {formatShort(task.previousActualDate)}
        </span>
      </span>
      <button className={`map-bar ${barClass(task.status)}`} style={{ gridColumn: `${start} / ${end}` }} onClick={onOpen}>
        <span className="pm" />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{task.title}</span>
      </button>
    </div>
  );
}
