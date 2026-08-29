import { useQuery } from "@tanstack/react-query";
import { getDocuments } from "@/services/documentsService";
import { getExperienceNotes } from "@/services/notesService";
import { useAssignment } from "@/state/AssignmentContext";
import { useSelectedTasks } from "@/state/useSelectedTasks";
import { useOverlay } from "@/state/OverlayContext";
import { qk } from "@/state/queryKeys";
import { LoadingBlock, ErrorState } from "@/components/ui/States";
import { InfoIcon } from "@/lib/icons";
import { formatFull, formatShort } from "@/lib/dates";

const VISIBILITY_LABEL: Record<string, { label: string; tone: string }> = {
  private: { label: "나만 보기", tone: "" },
  handover: { label: "후임자 전달", tone: "warn" },
  organization: { label: "학교 조직지식", tone: "ok" },
};

/**
 * F11 인수인계서 — P0은 읽기 전용 미리보기만. 내보내기는 P1 백엔드 계약
 * 없이는 비활성으로 유지한다 (docs/01 F11, docs/06 §9.9).
 */
export function HandoverPage() {
  const { school, selectedAssignments, selectedAssignmentIds } = useAssignment();
  const { open } = useOverlay();
  const { tasks, isPending: tasksPending, error: tasksError, refetch: refetchTasks } = useSelectedTasks();
  const docsQuery = useQuery({ queryKey: qk.documents(), queryFn: ({ signal }) => getDocuments(signal) });
  const notesQuery = useQuery({ queryKey: qk.notes(), queryFn: ({ signal }) => getExperienceNotes(signal) });

  if (selectedAssignmentIds.length === 0 || tasksPending) return <LoadingBlock label="인수인계서 초안을 불러오는 중" />;
  if (tasksError) return <ErrorState description={tasksError.message} onRetry={refetchTasks} />;

  const done = tasks.filter((t) => t.status === "complete");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const sharedNotes = (notesQuery.data ?? []).filter((n) => n.visibility !== "private");
  const privateNoteCount = (notesQuery.data ?? []).filter((n) => n.visibility === "private").length;
  const officialDocs = (docsQuery.data ?? []).filter((d) => d.sourceType === "official");

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">{school?.academicYear ?? ""}학년도</span>
          <h1 className="t-display" style={{ marginTop: 9 }}>인수인계서 초안</h1>
          <p className="sub">올해 업무 기록으로 만든 인수인계 초안입니다.</p>
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <button className="btn btn-quiet" onClick={() => open("review")}>
            메모 검토 모드
          </button>
          <button className="btn btn-primary" disabled title="내보내기 기능은 준비 중입니다">
            내보내기
          </button>
        </div>
      </div>

      <div className="notice">
        <InfoIcon />
        <span>
          <strong>아직 초안입니다.</strong> 후임자에게 전달되는 내용은 연말 검토에서 직접 선택한 항목만 포함됩니다.
          비공개 메모 <b className="num">{privateNoteCount}건</b>은 현재 제외되어 있습니다.
        </span>
      </div>

      <div className="ho-doc">
        <span className="eyebrow">{school?.name ?? ""}</span>
        <h2 className="t-display" style={{ marginTop: 10 }}>
          {school?.academicYear ?? ""}학년도 {selectedAssignments.map((assignment) => assignment.name).join(" · ")} 업무 인수인계
        </h2>
        <p className="t-cap" style={{ marginTop: 8 }}>작성 기준일 2026.08.28 · 담당 박새연 · 검토 전 초안</p>

        <h3>1. 연간 업무 흐름</h3>
        {tasks.slice(0, 6).map((t) => (
          <div className="ho-line" key={t.id}>
            <span className="k">{t.title}</span>
            <span className="v">준비 {formatShort(t.recommendedStartDate)} · 마감 {formatShort(t.officialDueDate)}</span>
          </div>
        ))}

        <h3>2. 올해 완료한 업무</h3>
        {done.length === 0 && <p className="t-cap">아직 완료한 업무가 없습니다.</p>}
        {done.map((t) => (
          <div className="ho-line" key={t.id}>
            <span className="k">{t.title}</span>
            <span className="v">{formatFull(t.officialDueDate)} 완료</span>
          </div>
        ))}

        <h3>3. 미완료·이월 업무</h3>
        {inProgress.length === 0 && <p className="t-cap">진행 중인 업무가 없습니다.</p>}
        {inProgress.map((t) => (
          <div className="ho-line" key={t.id}>
            <span className="k">{t.title}</span>
            <span className="v">{t.checklistDone}/{t.checklistTotal} 단계 진행 중</span>
          </div>
        ))}

        <h3>4. 전달 예정 경험 메모</h3>
        {sharedNotes.length === 0 && <p className="t-cap">전달 예정으로 표시된 경험 메모가 없습니다.</p>}
        {sharedNotes.map((n) => (
          <div className="mini-note" style={{ marginTop: 12 }} key={n.id}>
            <span style={{ display: "flex", gap: 7 }}>
              <span className={`chip ${VISIBILITY_LABEL[n.visibility].tone}`}>{VISIBILITY_LABEL[n.visibility].label}</span>
              <span className="chip">{n.taskTitle}</span>
            </span>
            <p>{n.body}</p>
            <span className="mf">{n.authorDisplay} · {n.academicYear}학년도</span>
          </div>
        ))}
        <div className="notice flat" style={{ marginTop: 14 }}>
          <InfoIcon />
          <span>
            비공개 메모 <b className="num">{privateNoteCount}건</b>은 포함되지 않았습니다. 검토 모드에서 전달 여부를
            다시 판단하세요.
          </span>
        </div>

        <h3>5. 주요 근거 문서</h3>
        {officialDocs.map((d) => (
          <div className="ho-line" key={d.id}>
            <span className="k">{d.title}</span>
            <span className="v">{d.documentNumber}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
