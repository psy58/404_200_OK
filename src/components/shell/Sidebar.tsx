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
import gamLockup from "@/assets/brand/gam-lockup-dark.png";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { school, activeAssignment } = useAssignment();
  const { open } = useOverlay();
  const tasksQuery = useQuery({
    queryKey: qk.tasks(activeAssignment?.id ?? ""),
    queryFn: ({ signal }) => getTasks(activeAssignment?.id ?? "", signal),
    enabled: !!activeAssignment,
  });
  const urgentCount = tasksQuery.data?.filter((t) => t.status === "in_progress" && daysUntil(t.officialDueDate) <= 10).length ?? 0;

  return (
    <aside className="side">
      <div className="brand">
        <img src={gamLockup} alt="GAM · Get A Map" className="brand-lockup" />
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
    </aside>
  );
}
