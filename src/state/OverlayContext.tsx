import { createContext, useContext, useState, type ReactNode } from "react";

export type OverlayKind = "assign" | "upload" | "note" | "review" | "notifications" | "assistant";

interface OverlayState {
  kind: OverlayKind;
  taskId?: string;
}

interface OverlayContextValue {
  overlay: OverlayState | null;
  open: (kind: OverlayKind, taskId?: string) => void;
  close: () => void;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  return (
    <OverlayContext.Provider
      value={{
        overlay,
        open: (kind, taskId) => setOverlay({ kind, taskId }),
        close: () => setOverlay(null),
      }}
    >
      {children}
    </OverlayContext.Provider>
  );
}

export function useOverlay(): OverlayContextValue {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error("useOverlay must be used within OverlayProvider");
  return ctx;
}
