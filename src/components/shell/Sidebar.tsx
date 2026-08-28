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
import gamWordmark from "@/assets/brand/gam-wordmark-white.png";
import gamPersimmon from "@/assets/brand/gam-persimmon-green.png";

export function Sidebar({ collapsed, onNavigate, onToggleCollapse }: { collapsed: boolean; onNavigate?: () => void; onToggleCollapse: () => void }) {
  const { school, activeAssignment, context, boundary } = useAssignment();
  const { open } = useOverlay();
  const tasksQuery = useQuery({
    queryKey: context ? qk.tasks(context) : ["tasks", "disabled"],
    queryFn: ({ signal }) => getTasks(context!, signal),
    enabled: !!context,
  });
  const urgentCount = tasksQuery.data?.filter((t) => t.status === "in_progress" && daysUntil(t.officialDueDate) <= 10).length ?? 0;

  return (
    <aside className="side" id="primary-navigation">
      <Link className="brand" to="/" aria-label="GAM 홈으로 이동">
        <img src={gamWordmark} alt="GAM" className="brand-lockup" />
        <span className="brand-mark"><img src={gamPersimmon} alt="GAM 감 아이콘" /></span>
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
      <div className="side-foot">
        <p>기록은 이 학교의 조직기억으로 남습니다.</p>
        <p style={{ marginTop: 6 }}>
          <span className="em">{boundary?.label ?? "API 경계 확인 중"}</span>
        </p>
      </div>
      <button className="side-collapse" onClick={onToggleCollapse} aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"} title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}>
        <ChevronRightIcon />
      </button>
    </aside>
  );
}
