import { SearchBox } from "./SearchBox";
import { useOverlay } from "@/state/OverlayContext";
import { BellIcon, MenuIcon } from "@/lib/icons";

export function Topbar({ onToggleNav }: { onToggleNav: () => void }) {
  const { open } = useOverlay();

  return (
    <header className="topbar">
      <button className="hamb" id="hamb" aria-label="메뉴 열기" onClick={onToggleNav}>
        <MenuIcon />
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
