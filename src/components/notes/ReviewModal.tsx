import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { getExperienceNotes } from "@/services/notesService";
import { useAssignment } from "@/state/AssignmentContext";
import { qk } from "@/state/queryKeys";
import { InfoIcon } from "@/lib/icons";

const VISIBILITY_LABEL: Record<string, { label: string; tone: string }> = {
  private: { label: "나만 보기", tone: "" }, handover: { label: "후임자 전달", tone: "warn" }, organization: { label: "학교 조직지식", tone: "ok" },
};

export function ReviewModal({ onClose }: { onClose: () => void }) {
  const { context, user } = useAssignment();
  const query = useQuery({
    queryKey: context ? qk.notes(context) : ["notes", "disabled"],
    queryFn: ({ signal }) => getExperienceNotes(context!, user?.displayName ?? "", signal),
    enabled: !!context,
  });
  return (
    <Modal titleId="review-modal-title" wide eyebrow="F11 · 인수인계 전 메모 검토" title="1년치 메모 검토" description="기록할 때는 자유롭게, 전달할 때는 신중하게. 전달할 메모만 골라 인수인계서에 넣습니다." onClose={onClose} footer={<button className="btn btn-quiet" onClick={onClose}>닫기</button>}>
      <QueryBoundary query={query} isEmpty={(notes) => notes.length === 0} emptyTitle="검토할 메모가 없습니다">
        {(notes) => <>{notes.map((note) => { const label = VISIBILITY_LABEL[note.visibility]; return <div className="mini-note" style={{ marginBottom: 12 }} key={note.id}><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span className={`chip ${label.tone}`}>{label.label}</span><span className="chip">{note.taskTitle}</span><span className="t-cap num" style={{ marginLeft: "auto" }}>{note.academicYear}학년도</span></div><p>{note.body}</p><div style={{ display: "flex", gap: 8, marginTop: 12 }}><button className="btn btn-quiet btn-sm" disabled>비공개 유지</button><button className="btn btn-quiet btn-sm" disabled>표현 다듬기</button><button className="btn btn-primary btn-sm" disabled>후임자에게 전달</button></div></div>; })}<div className="notice"><InfoIcon /><span>검토 mutation과 승인 audit 계약이 없어 변경 버튼은 비활성입니다. <strong>최종 전달 여부는 항상 사람이 승인</strong>합니다.</span></div></>}
      </QueryBoundary>
    </Modal>
  );
}
