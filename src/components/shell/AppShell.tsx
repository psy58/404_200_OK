import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useOverlay } from "@/state/OverlayContext";
import { AssistantIcon } from "@/lib/icons";
import { useAssignment } from "@/state/AssignmentContext";
import { ErrorState, LoadingBlock } from "@/components/ui/States";

const ROUTE_SHORTCUTS: Record<string, string> = { h: "/home", m: "/map", d: "/docs", n: "/notes", i: "/handover" };

// Upload/analysis, notifications and AI stay out of the initial shell bundle.
const AssignmentModal = lazy(() => import("./AssignmentModal").then((module) => ({ default: module.AssignmentModal })));
const NotificationPanel = lazy(() => import("./NotificationPanel").then((module) => ({ default: module.NotificationPanel })));
const AssistantPanel = lazy(() => import("./AssistantPanel").then((module) => ({ default: module.AssistantPanel })));
const UploadModal = lazy(() => import("@/components/upload/UploadModal").then((module) => ({ default: module.UploadModal })));
const NoteComposerModal = lazy(() => import("@/components/notes/NoteComposerModal").then((module) => ({ default: module.NoteComposerModal })));
const ReviewModal = lazy(() => import("@/components/notes/ReviewModal").then((module) => ({ default: module.ReviewModal })));

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const { overlay, open, close } = useOverlay();
  const { status, errorMessage } = useAssignment();
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
          {status === "loading" || status === "switching" ? (
            <LoadingBlock label={status === "switching" ? "담당 업무를 전환하는 중" : "학교와 담당 업무를 확인하는 중"} />
          ) : status === "error" ? (
            <ErrorState description={errorMessage ?? "세션 정보를 확인하지 못했습니다."} />
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <button className="fab" onClick={() => open("assistant")}>
        <AssistantIcon />
        업무 도우미
      </button>

      <Suspense fallback={<span className="sr" role="status">기능 화면을 준비하는 중입니다.</span>}>
        {overlay?.kind === "assign" && <AssignmentModal onClose={close} />}
        {overlay?.kind === "notifications" && <NotificationPanel onClose={close} />}
        {overlay?.kind === "assistant" && <AssistantPanel taskId={overlay.taskId} onClose={close} />}
        {overlay?.kind === "upload" && <UploadModal onClose={close} />}
        {overlay?.kind === "note" && <NoteComposerModal taskId={overlay.taskId} onClose={close} />}
        {overlay?.kind === "review" && <ReviewModal onClose={close} />}
      </Suspense>
    </div>
  );
}
