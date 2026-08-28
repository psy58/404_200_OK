import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Outlet, useMatch, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useOverlay } from "@/state/OverlayContext";
import { AssistantIcon } from "@/lib/icons";
import { useAssignment } from "@/state/AssignmentContext";
import { ErrorState, LoadingBlock } from "@/components/ui/States";

const ROUTE_SHORTCUTS: Record<string, string> = { h: "/home", m: "/map", d: "/docs", n: "/notes", i: "/handover" };

// Upload/analysis, notifications and AI stay out of the initial shell bundle.
const AssignmentModal = lazy(() => import("./AssignmentModal").then((module) => ({ default: module.AssignmentModal })));
const NewAssignmentModal = lazy(() => import("./NewAssignmentModal").then((module) => ({ default: module.NewAssignmentModal })));
const NotificationPanel = lazy(() => import("./NotificationPanel").then((module) => ({ default: module.NotificationPanel })));
const AssistantPanel = lazy(() => import("./AssistantPanel").then((module) => ({ default: module.AssistantPanel })));
const UploadModal = lazy(() => import("@/components/upload/UploadModal").then((module) => ({ default: module.UploadModal })));
const NoteComposerModal = lazy(() => import("@/components/notes/NoteComposerModal").then((module) => ({ default: module.NoteComposerModal })));
const ReviewModal = lazy(() => import("@/components/notes/ReviewModal").then((module) => ({ default: module.ReviewModal })));

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("gam-sidebar-collapsed") === "true");
  const { overlay, open, close } = useOverlay();
  const { status, errorMessage } = useAssignment();
  const navigate = useNavigate();
  const taskMatch = useMatch("/tasks/:taskId");
  const gPressed = useRef(false);
  const gTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    document.body.classList.toggle("nav-on", navOpen);
    return () => document.body.classList.remove("nav-on");
  }, [navOpen]);

  useEffect(() => {
    localStorage.setItem("gam-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

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
        if (window.matchMedia("(max-width: 760px)").matches) {
          document.getElementById("mobile-search-trigger")?.click();
        } else {
          document.getElementById("q")?.focus();
        }
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
    <div className={`app${sidebarCollapsed ? " side-collapsed" : ""}`}>
      <a className="skip-link" href="#view" onClick={() => document.getElementById("view")?.focus()}>본문으로 건너뛰기</a>
      <div className="side-scrim" onClick={() => setNavOpen(false)} />
      <Sidebar collapsed={sidebarCollapsed} onNavigate={() => setNavOpen(false)} onToggleCollapse={() => setSidebarCollapsed((value) => !value)} />
      <div className="main">
        <Topbar navOpen={navOpen} onToggleNav={() => setNavOpen((value) => !value)} />
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

      <button className="fab" onClick={() => open("assistant", taskMatch?.params.taskId)}>
        <AssistantIcon />
        AI 감
      </button>

      <Suspense fallback={<span className="sr" role="status">기능 화면을 준비하는 중입니다.</span>}>
        {overlay?.kind === "assign" && <AssignmentModal onClose={close} />}
        {overlay?.kind === "new-assignment" && <NewAssignmentModal onClose={close} onNext={() => open("upload")} />}
        {overlay?.kind === "notifications" && <NotificationPanel onClose={close} />}
        {overlay?.kind === "assistant" && <AssistantPanel taskId={overlay.taskId} onClose={close} />}
        {overlay?.kind === "upload" && <UploadModal onClose={close} />}
        {overlay?.kind === "note" && <NoteComposerModal taskId={overlay.taskId} onClose={close} />}
        {overlay?.kind === "review" && <ReviewModal onClose={close} />}
      </Suspense>
    </div>
  );
}
