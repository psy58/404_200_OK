import { Link, NavLink } from "react-router-dom";
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
  ChevronRightIcon,
} from "@/lib/icons";
import gamLockup from "@/assets/brand/gam-lockup-dark.png";

export function Sidebar({ collapsed, onNavigate, onToggleCollapse }: { collapsed: boolean; onNavigate?: () => void; onToggleCollapse: () => void }) {
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
      <Link className="brand" to="/" aria-label="GAM 홈으로 이동">
        <img src={gamLockup} alt="GAM · Get A Map" className="brand-lockup" />
        <span className="brand-mark" aria-hidden="true">G</span>
      </Link>

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
        <NavLink className="nav-item" to="/home" onClick={onNavigate} title="내 업무 홈">
          <HomeNavIcon />
          내 업무 홈 {urgentCount > 0 && <span className="nav-badge">{urgentCount}</span>}
        </NavLink>
        <NavLink className="nav-item" to="/map" onClick={onNavigate} title="연간 업무 지도">
          <MapNavIcon />
          연간 업무 지도
        </NavLink>
        <NavLink className="nav-item" to="/docs" onClick={onNavigate} title="문서함">
          <DocsNavIcon />
          문서함
        </NavLink>
        <NavLink className="nav-item" to="/notes" onClick={onNavigate} title="선생님들의 감">
          <NotesNavIcon />
          선생님들의 감
        </NavLink>
        <span className="nav-sep" />
        <NavLink className="nav-item" to="/handover" onClick={onNavigate} title="인수인계서">
          <HandoverNavIcon />
          인수인계서
        </NavLink>
      </nav>
      <button className="side-collapse" onClick={onToggleCollapse} aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"} title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}>
        <ChevronRightIcon />
      </button>
    </aside>
  );
}
