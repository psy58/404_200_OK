import { useQuery } from "@tanstack/react-query";
import { getHandoverPreview } from "@/services/handoverService";
import { useAssignment } from "@/state/AssignmentContext";
import { useOverlay } from "@/state/OverlayContext";
import { qk } from "@/state/queryKeys";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { InfoIcon } from "@/lib/icons";
import { formatShort } from "@/lib/dates";

const VISIBILITY_LABEL: Record<string, { label: string; tone: string }> = {
  private: { label: "나만 보기", tone: "" }, handover: { label: "후임자 전달", tone: "warn" }, organization: { label: "학교 조직지식", tone: "ok" },
};

/** F11 P0 read-only preview from the dedicated V2 capability. */
export function HandoverPage() {
  const { school, user, activeAssignment, context } = useAssignment();
  const { open } = useOverlay();
  const academicYear = school?.academicYear ?? new Date().getFullYear();
  const query = useQuery({
    queryKey: context ? qk.handover(context, academicYear) : ["handover", "disabled"],
    queryFn: ({ signal }) => getHandoverPreview(context!, academicYear, signal),
    enabled: !!context,
  });

  return (
    <div className="stack">
      <div className="page-head">
        <div><span className="eyebrow">{academicYear}학년도 · 자동 축적</span><h1 className="t-display" style={{ marginTop: 9 }}>인수인계서 초안</h1><p className="sub">연말에 새로 쓰는 문서가 아니라, 1년간의 업무 기록에서 자동으로 만들어집니다.</p></div>
        <div style={{ display: "flex", gap: 9 }}><button className="btn btn-quiet" onClick={() => open("review")}>메모 검토 모드</button><button className="btn btn-primary" disabled>내보내기 (백엔드 연결 전)</button></div>
      </div>
      <div className="notice"><InfoIcon /><span><strong>아직 초안입니다.</strong> 승인·검증된 기록만 미리보기에 포함되며 내보내기는 실제 P1 계약 전까지 비활성입니다.</span></div>
      <QueryBoundary query={query}>
        {(preview) => (
          <div className="ho-doc">
            <span className="eyebrow">{school?.name ?? ""}</span>
            <h2 className="t-display" style={{ marginTop: 10 }}>{academicYear}학년도 {activeAssignment?.name ?? ""} 업무 인수인계</h2>
            <p className="t-cap" style={{ marginTop: 8 }}>작성 기준일 {new Date().toLocaleDateString("ko-KR")} · 담당 {user?.displayName ?? ""} · 자동 생성 초안 v{preview.version}</p>
            <h3>1. 연간 업무 흐름</h3>
            {preview.annualFlow.length === 0 && <p className="t-cap">기록된 연간 흐름이 없습니다.</p>}
            {preview.annualFlow.map((task) => <div className="ho-line" key={task.id}><span className="k">{task.title}</span><span className="v">준비 {formatShort(task.recommendedStartDate)} · 마감 {formatShort(task.officialDueDate)}</span></div>)}
            <h3>2. 미완료·이월 업무</h3>
            {preview.incomplete.length === 0 && <p className="t-cap">진행 중인 업무가 없습니다.</p>}
            {preview.incomplete.map((task) => <div className="ho-line" key={task.id}><span className="k">{task.title}</span><span className="v">{task.checklistDone}/{task.checklistTotal} 단계 진행 중</span></div>)}
            <h3>3. 전달 승인된 경험 메모</h3>
            {preview.notes.length === 0 && <p className="t-cap">승인되어 전달할 경험 메모가 없습니다.</p>}
            {preview.notes.map((note) => { const label = VISIBILITY_LABEL[note.visibility]; return <div className="mini-note" style={{ marginTop: 12 }} key={note.id}><span style={{ display: "flex", gap: 7 }}><span className={`chip ${label.tone}`}>{label.label}</span><span className="chip">{note.taskTitle}</span></span><p>{note.body}</p><span className="mf">{note.authorDisplay} · {note.academicYear}학년도</span></div>; })}
            <h3>4. 주요 근거 문서</h3>
            {preview.evidence.length === 0 && <p className="t-cap">검증된 근거 문서가 없습니다.</p>}
            {preview.evidence.map((document) => <div className="ho-line" key={document.id}><span className="k">{document.title}</span><span className="v">{document.documentNumber}</span></div>)}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
