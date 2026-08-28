import { SearchBox } from "./SearchBox";
import { useOverlay } from "@/state/OverlayContext";
import { BellIcon, UploadIcon } from "@/lib/icons";
import { useAssignment } from "@/state/AssignmentContext";
import gamPersimmon from "@/assets/brand/gam-persimmon-green.png";

export function Topbar({ navOpen, onToggleNav }: { navOpen: boolean; onToggleNav: () => void }) {
  const { open } = useOverlay();
  const { user } = useAssignment();
  const now = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).format(new Date());
  const initial = user?.displayName.slice(0, 1) ?? "?";

  return (
    <header className="topbar">
      <button
        className="hamb gam-menu-toggle"
        id="hamb"
        type="button"
        aria-label={navOpen ? "사이드바 닫기" : "사이드바 열기"}
        aria-expanded={navOpen}
        aria-controls="primary-navigation"
        onClick={onToggleNav}
      >
        <img src={gamPersimmon} alt="" className="gam-menu-toggle-icon" />
      </button>
      <span className="date-now num">
        {now}
      </span>
      <SearchBox />

      <div className="top-right">
        <button className="btn btn-quiet btn-sm" onClick={() => open("upload")} aria-label="문서 올리기">
          <UploadIcon />
          <span className="btn-label">문서 올리기</span>
        </button>
        <button className="icon-btn" aria-label="알림" onClick={() => open("notifications")}>
          <BellIcon />
          <span className="dot" />
        </button>
        <button className="who">
          <span className="ava">{initial}</span>
          <span className="who-copy">
            <span className="n">{user?.displayName ?? "사용자 확인 중"}</span>
            <span className="r">{user?.roleLabel ?? "서버 세션 확인"}</span>
          </span>
        </button>
      </div>
    </header>
  );
}
