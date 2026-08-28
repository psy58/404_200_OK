import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAssignment } from "@/state/AssignmentContext";
import { useOverlay } from "@/state/OverlayContext";
import { getTasks } from "@/services/tasksService";
import { qk } from "@/state/queryKeys";
import { daysUntil } from "@/lib/dates";
import {
  DocsNavIcon,
  HandoverNavIcon,
  HomeNavIcon,
  MapNavIcon,
  NotesNavIcon,
} from "@/lib/icons";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { school, activeAssignment, context, boundary } = useAssignment();
  const { open } = useOverlay();
  const tasksQuery = useQuery({
    queryKey: context ? qk.tasks(context) : ["tasks", "disabled"],
    queryFn: ({ signal }) => getTasks(context!, signal),
    enabled: !!context,
  });
  const urgentCount = tasksQuery.data?.filter((t) => t.status === "in_progress" && daysUntil(t.officialDueDate) <= 10).length ?? 0;

  return (
    <aside className="side">
      <div className="brand">
        <svg width="36" height="36" viewBox="0 0 100 100" aria-hidden="true">
          <path d="M50 33c22 0 36 12 36 26.5S72 88 50 88 14 74 14 59.5 28 33 50 33z" fill="#F4581C" />
          <path
            d="M50 12c5 0 8.2 6 8.2 13 7-5 15.2-8 18.2-4 3 4-2 11-9 15 8 1 15 5 14 9-1 5-10 6-18 4 3 7 3 14-1 15-4 1-9-5-12.4-12-3.4 7-8.4 13-12.4 12-4-1-4-8-1-15-8 2-17 1-18-4-1-4 6-8 14-9-7-4-12-11-9-15 3-4 11.2-1 18.2 4C41.8 18 45 12 50 12z"
            fill="#0F2647"
          />
        </svg>
        <span className="wm">
          <span className="wm1">GAM</span>
          <span className="wm2">GET A MAP</span>
        </span>
      </div>

      <div className="ctx">
        <span className="lab">담당 업무</span>
        <span className="row">
          <span className="nm">{activeAssignment?.name ?? "선택 필요"}</span>
          <button className="chg" onClick={() => open("assign")}>
            변경
          </button>
        </span>
        <span className="mt">
          {school ? `${school.name} · ${school.academicYear}학년도` : " "} · 업무 {activeAssignment?.taskCount ?? 0}개
        </span>
      </div>

      <nav className="nav" aria-label="주요 메뉴">
        <NavLink className="nav-item" to="/home" onClick={onNavigate}>
          <HomeNavIcon />
          내 업무 홈 {urgentCount > 0 && <span className="nav-badge">{urgentCount}</span>}
        </NavLink>
        <NavLink className="nav-item" to="/map" onClick={onNavigate}>
          <MapNavIcon />
          연간 업무 지도
        </NavLink>
        <NavLink className="nav-item" to="/docs" onClick={onNavigate}>
          <DocsNavIcon />
          문서함
        </NavLink>
        <NavLink className="nav-item" to="/notes" onClick={onNavigate}>
          <NotesNavIcon />
          선생님들의 감
        </NavLink>
        <span className="nav-sep" />
        <NavLink className="nav-item" to="/handover" onClick={onNavigate}>
          <HandoverNavIcon />
          인수인계서
        </NavLink>
      </nav>

      <div className="side-foot">
        <p>기록은 이 학교의 조직기억으로 남습니다.</p>
        <p style={{ marginTop: 6 }}>
          <span className="em">{boundary?.label ?? "API 경계 확인 중"}</span>
        </p>
      </div>
    </aside>
  );
}
