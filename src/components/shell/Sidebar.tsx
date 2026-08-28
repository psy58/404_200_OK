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
import gamIcon from "@/assets/brand/gam-icon.png";

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
        <img src={gamIcon} alt="" width={36} height={36} />
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
          <span className="em num">전임자 문서 412건</span> 분석 완료
        </p>
      </div>
    </aside>
  );
}
