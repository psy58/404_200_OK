import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getTasks } from "@/services/tasksService";
import { getDocuments } from "@/services/documentsService";
import { getExperienceNotes } from "@/services/notesService";
import { useAssignment } from "@/state/AssignmentContext";
import { qk } from "@/state/queryKeys";
import { CloseIcon, SearchIcon } from "@/lib/icons";
import { SourceTag } from "@/components/ui/SourceTag";
import { formatFull, formatShort } from "@/lib/dates";
import { taskNavigationState } from "@/lib/taskNavigation";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export function SearchBox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const { activeAssignmentId } = useAssignment();
  useFocusTrap(mobilePanelRef, mobileOpen);

  const tasksQuery = useQuery({
    queryKey: qk.tasks(activeAssignmentId ?? ""),
    queryFn: ({ signal }) => getTasks(activeAssignmentId ?? "", signal),
    enabled: !!activeAssignmentId,
  });
  const docsQuery = useQuery({ queryKey: qk.documents(), queryFn: ({ signal }) => getDocuments(signal) });
  const notesQuery = useQuery({ queryKey: qk.notes(), queryFn: ({ signal }) => getExperienceNotes(signal) });

  const trimmed = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!trimmed) return null;
    const tasks = (tasksQuery.data ?? []).filter(
      (task) => task.title.toLowerCase().includes(trimmed) || task.category.includes(trimmed),
    ).slice(0, 3);
    const docs = (docsQuery.data ?? []).filter(
      (document) => document.title.toLowerCase().includes(trimmed) || document.documentNumber.toLowerCase().includes(trimmed),
    ).slice(0, 3);
    const notes = (notesQuery.data ?? []).filter(
      (note) => note.body.includes(trimmed) || note.taskTitle.includes(trimmed),
    ).slice(0, 2);
    return { tasks, docs, notes };
  }, [trimmed, tasksQuery.data, docsQuery.data, notesQuery.data]);

  const hasResults = !!results && (results.tasks.length > 0 || results.docs.length > 0 || results.notes.length > 0);

  const closeMobileSearch = () => {
    setMobileOpen(false);
    setOpen(false);
    requestAnimationFrame(() => mobileTriggerRef.current?.focus());
  };

  const selectResult = (path: string, state?: object) => {
    navigate(path, state ? { state } : undefined);
    setQ("");
    setOpen(false);
    setMobileOpen(false);
  };

  useEffect(() => {
    if (!open || mobileOpen) return;
    function onDocMouseDown(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open, mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    mobileInputRef.current?.focus();
  }, [mobileOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      if (mobileOpen) closeMobileSearch();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const resultItems = results && (
    <>
      {!hasResults && (
        <div className="empty search-empty">
          <p className="t-h2">&ldquo;{q}&rdquo; 결과가 없습니다</p>
          <p className="t-cap">업무명이나 공문 제목의 일부만 입력해 보세요.</p>
        </div>
      )}
      {results.tasks.length > 0 && (
        <>
          <div className="res-group"><span className="eyebrow">업무</span></div>
          {results.tasks.map((task) => (
            <button key={task.id} className="res-item" onClick={() => selectResult(`/tasks/${task.id}`, taskNavigationState("/home", "검색 결과"))}>
              <span className="rt">{task.title}</span>
              <span className="rm num">마감 {formatFull(task.officialDueDate)} · 작년 {formatShort(task.previousActualDate)}</span>
            </button>
          ))}
        </>
      )}
      {results.docs.length > 0 && (
        <>
          <div className="res-group"><span className="eyebrow">문서</span></div>
          {results.docs.map((document) => (
            <button key={document.id} className="res-item" onClick={() => selectResult("/docs")}>
              <span className="rt">{document.title}</span>
              <span className="rm"><SourceTag type={document.sourceType} /> {document.documentNumber}</span>
            </button>
          ))}
        </>
      )}
      {results.notes.length > 0 && (
        <>
          <div className="res-group"><span className="eyebrow">경험 메모</span></div>
          {results.notes.map((note) => (
            <button key={note.id} className="res-item" onClick={() => selectResult("/notes")}>
              <span className="rt">{note.body.slice(0, 40)}…</span>
              <span className="rm"><SourceTag type="experience" /> {note.taskTitle} · {note.academicYear}</span>
            </button>
          ))}
        </>
      )}
    </>
  );

  return (
    <>
      <div className="search-wrap" ref={boxRef}>
        <div className="search">
          <SearchIcon />
          <input
            id="q"
            type="search"
            placeholder="업무명, 공문 키워드로 검색"
            aria-label="통합 검색"
            autoComplete="off"
            value={q}
            onChange={(event) => { setQ(event.target.value); setOpen(!!event.target.value.trim()); }}
            onFocus={() => setOpen(!!q.trim())}
          />
          <kbd>/</kbd>
        </div>
        {open && results && <div className="results" onMouseDown={(event) => event.preventDefault()}>{resultItems}</div>}
      </div>

      <button
        ref={mobileTriggerRef}
        id="mobile-search-trigger"
        className="mobile-search-trigger"
        aria-label="통합 검색 열기"
        aria-expanded={mobileOpen}
        aria-controls="mobile-search-panel"
        onClick={() => setMobileOpen(true)}
      >
        <SearchIcon />
      </button>

      {mobileOpen && (
        <div className="mobile-search-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) closeMobileSearch(); }}>
          <div className="mobile-search-panel" id="mobile-search-panel" role="dialog" aria-modal="true" aria-label="통합 검색" ref={mobilePanelRef}>
            <div className="mobile-search-head">
              <strong>통합 검색</strong>
              <button className="icon-btn" aria-label="검색 닫기" onClick={closeMobileSearch}><CloseIcon /></button>
            </div>
            <div className="search mobile-search-field">
              <SearchIcon />
              <input
                ref={mobileInputRef}
                type="search"
                placeholder="업무명, 공문 키워드로 검색"
                aria-label="통합 검색어"
                autoComplete="off"
                value={q}
                onChange={(event) => setQ(event.target.value)}
              />
            </div>
            <div className="mobile-search-results">
              {results ? resultItems : <p className="t-cap mobile-search-hint">업무명, 공문, 경험 메모 키워드를 입력해 보세요.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
