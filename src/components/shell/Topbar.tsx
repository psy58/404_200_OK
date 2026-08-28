import { SearchBox } from "./SearchBox";
import { useOverlay } from "@/state/OverlayContext";
import { BellIcon } from "@/lib/icons";
import gamPersimmon from "@/assets/brand/gam-persimmon-green.png";

export function Topbar({ navOpen, onToggleNav }: { navOpen: boolean; onToggleNav: () => void }) {
  const { open } = useOverlay();

  return (
    <header className="topbar">
      <button className="hamb gam-menu-toggle" id="hamb" type="button" aria-label={navOpen ? "사이드바 닫기" : "사이드바 열기"} onClick={onToggleNav}>
        <img src={gamPersimmon} alt="" className="gam-menu-toggle-icon" />
      </button>
      <SearchBox />

      <div className="top-right">
        <button className="icon-btn" aria-label="알림" onClick={() => open("notifications")}>
          <BellIcon />
          <span className="dot" />
        </button>
        <button className="who">
          <span className="ava">박</span>
          <span className="who-copy">
            <span className="n">박새연</span>
          </span>
        </button>
      </div>
    </header>
  );
}
