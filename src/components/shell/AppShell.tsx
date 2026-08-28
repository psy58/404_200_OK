import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AssignmentModal } from "./AssignmentModal";
import { NotificationPanel } from "./NotificationPanel";
import { AssistantPanel } from "./AssistantPanel";
import { UploadModal } from "@/components/upload/UploadModal";
import { NoteComposerModal } from "@/components/notes/NoteComposerModal";
import { ReviewModal } from "@/components/notes/ReviewModal";
import { useOverlay } from "@/state/OverlayContext";
import { AssistantIcon } from "@/lib/icons";

const ROUTE_SHORTCUTS: Record<string, string> = { h: "/home", m: "/map", d: "/docs", n: "/notes", i: "/handover" };

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const { overlay, open, close } = useOverlay();
  const navigate = useNavigate();
  const gPressed = useRef(false);
  const gTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    document.body.classList.toggle("nav-on", navOpen);
    return () => document.body.classList.remove("nav-on");
  }, [navOpen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const typing = /INPUT|TEXTAREA/.test((document.activeElement as HTMLElement)?.tagName ?? "");
      if (e.key === "Escape") {
        close();
        setNavOpen(false);
        return;
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        document.getElementById("q")?.focus();
        return;
      }
      if (typing) return;
      if (e.key === "g") {
        gPressed.current = true;
        clearTimeout(gTimer.current);
        gTimer.current = setTimeout(() => (gPressed.current = false), 900);
        return;
      }
      if (gPressed.current) {
        const to = ROUTE_SHORTCUTS[e.key];
        if (to) {
          gPressed.current = false;
          close();
          navigate(to);
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, navigate]);

  return (
    <div className="app">
      <div className="side-scrim" onClick={() => setNavOpen(false)} />
      <Sidebar onNavigate={() => setNavOpen(false)} />
      <div className="main">
        <Topbar onToggleNav={() => setNavOpen((v) => !v)} />
        <main className="view" id="view" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <button className="fab" onClick={() => open("assistant")}>
        <AssistantIcon />
        업무 도우미
      </button>

      {overlay?.kind === "assign" && <AssignmentModal onClose={close} />}
      {overlay?.kind === "notifications" && <NotificationPanel onClose={close} />}
      {overlay?.kind === "assistant" && <AssistantPanel taskId={overlay.taskId} onClose={close} />}
      {overlay?.kind === "upload" && <UploadModal onClose={close} />}
      {overlay?.kind === "note" && <NoteComposerModal taskId={overlay.taskId} onClose={close} />}
      {overlay?.kind === "review" && <ReviewModal onClose={close} />}
    </div>
  );
}
