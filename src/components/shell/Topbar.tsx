import { SearchBox } from "./SearchBox";
import { useOverlay } from "@/state/OverlayContext";
import { BellIcon, MenuIcon, UploadIcon } from "@/lib/icons";

export function Topbar({ onToggleNav }: { onToggleNav: () => void }) {
  const { open } = useOverlay();

  return (
    <header className="topbar">
      <button className="hamb" id="hamb" aria-label="메뉴 열기" onClick={onToggleNav}>
        <MenuIcon />
      </button>
      <span className="date-now num">
        2026. 08. 28. 금 <span>· 2학기 3주차</span>
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
          <span className="ava">박</span>
          <span>
            <span className="n">박새연</span>
            <span className="r">교사 · 과학정보부</span>
          </span>
        </button>
      </div>
    </header>
  );
}
