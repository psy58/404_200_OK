import { useEffect, useRef, type ReactNode } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { CloseIcon } from "@/lib/icons";

interface ModalProps {
  titleId: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  wide?: boolean;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({ titleId, title, eyebrow, description, wide, onClose, footer, children }: ModalProps) {
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
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="modal-head">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div>
              {eyebrow && <span className="eyebrow">{eyebrow}</span>}
              <h2 id={titleId} className="t-h1" style={{ marginTop: 8 }}>{title}</h2>
              {description && <p className="t-cap" style={{ marginTop: 6 }}>{description}</p>}
            </div>
            <button className="icon-btn" aria-label="닫기" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
