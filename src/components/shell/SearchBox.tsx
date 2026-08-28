import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getTasks } from "@/services/tasksService";
import { getDocuments } from "@/services/documentsService";
import { getExperienceNotes } from "@/services/notesService";
import { useAssignment } from "@/state/AssignmentContext";
import { qk } from "@/state/queryKeys";
import { SearchIcon } from "@/lib/icons";
import { SourceTag } from "@/components/ui/SourceTag";
import { formatFull, formatShort } from "@/lib/dates";

/**
 * F-없음(S07 통합검색). Searches across cached tasks/documents/notes for the
 * current assignment. Server-side search/pagination is BACKEND_CONTRACT_REQUIRED;
 * this is a client-side filter over already-fetched, already-authorized data.
 */
export function SearchBox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const { activeAssignmentId } = useAssignment();

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
      (t) => t.title.toLowerCase().includes(trimmed) || t.category.includes(trimmed),
    ).slice(0, 3);
    const docs = (docsQuery.data ?? []).filter(
      (d) => d.title.toLowerCase().includes(trimmed) || d.documentNumber.toLowerCase().includes(trimmed),
    ).slice(0, 3);
    const notes = (notesQuery.data ?? []).filter(
      (n) => n.body.includes(trimmed) || n.taskTitle.includes(trimmed),
    ).slice(0, 2);
    return { tasks, docs, notes };
  }, [trimmed, tasksQuery.data, docsQuery.data, notesQuery.data]);

  const hasResults = results && (results.tasks.length || results.docs.length || results.notes.length);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  return (
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
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(!!e.target.value.trim());
          }}
          onFocus={() => setOpen(!!q.trim())}
        />
        <kbd>/</kbd>
      </div>
      {open && results && (
        <div className="results" onMouseDown={(e) => e.preventDefault()}>
          {!hasResults && (
            <div className="empty" style={{ padding: "34px 18px" }}>
              <p className="t-h2">&ldquo;{q}&rdquo; 결과가 없습니다</p>
              <p className="t-cap" style={{ marginTop: 6 }}>업무명이나 공문 제목의 일부만 입력해 보세요.</p>
            </div>
          )}
          {results.tasks.length > 0 && (
            <>
              <div className="res-group"><span className="eyebrow">업무</span></div>
              {results.tasks.map((t) => (
                <button key={t.id} className="res-item" onClick={() => { navigate(`/tasks/${t.id}`); setOpen(false); setQ(""); }}>
                  <span className="rt">{t.title}</span>
                  <span className="rm num">마감 {formatFull(t.officialDueDate)} · 작년 {formatShort(t.previousActualDate)}</span>
                </button>
              ))}
            </>
          )}
          {results.docs.length > 0 && (
            <>
              <div className="res-group"><span className="eyebrow">문서</span></div>
              {results.docs.map((d) => (
                <button key={d.id} className="res-item" onClick={() => { navigate("/docs"); setOpen(false); setQ(""); }}>
                  <span className="rt">{d.title}</span>
                  <span className="rm"><SourceTag type={d.sourceType} /> {d.documentNumber}</span>
                </button>
              ))}
            </>
          )}
          {results.notes.length > 0 && (
            <>
              <div className="res-group"><span className="eyebrow">경험 메모</span></div>
              {results.notes.map((n) => (
                <button key={n.id} className="res-item" onClick={() => { navigate("/notes"); setOpen(false); setQ(""); }}>
                  <span className="rt">{n.body.slice(0, 40)}…</span>
                  <span className="rm"><SourceTag type="experience" /> {n.taskTitle} · {n.academicYear}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
