import { useEffect, useRef, type ReactNode } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { CloseIcon } from "@/lib/icons";

interface PanelProps {
  titleId: string;
  title: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

/** Right-edge slide-in panel used for notifications and the assistant. */
export function Panel({ titleId, title, onClose, footer, children }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="scrim"
      style={{ justifyContent: "flex-end", padding: 0 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <aside className="panel" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="panel-head">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 id={titleId} className="t-h1">{title}</h2>
            <button className="icon-btn" aria-label="닫기" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="panel-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </aside>
    </div>
  );
}
