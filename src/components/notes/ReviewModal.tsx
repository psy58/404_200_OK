import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { getExperienceNotes } from "@/services/notesService";
import { qk } from "@/state/queryKeys";
import { useToast } from "@/state/ToastContext";
import { InfoIcon } from "@/lib/icons";

const VISIBILITY_LABEL: Record<string, { label: string; tone: string }> = {
  private: { label: "나만 보기", tone: "" },
  handover: { label: "후임자 전달", tone: "warn" },
  organization: { label: "학교 조직지식", tone: "ok" },
};

/** F11 인수인계 전 메모 검토 — approval stays human, per docs/01 F10/F11. */
export function ReviewModal({ onClose }: { onClose: () => void }) {
  const query = useQuery({ queryKey: qk.notes(), queryFn: ({ signal }) => getExperienceNotes(signal) });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return (
    <Modal
      titleId="review-modal-title"
      wide
      eyebrow="인수인계 전 메모 검토"
      title="1년치 메모 검토"
      description="기록할 때는 자유롭게, 전달할 때는 신중하게. 전달할 메모만 골라 인수인계서에 넣습니다."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            닫기
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: qk.notes() });
              onClose();
              toast("검토 결과 저장 (시연)");
            }}
          >
            검토 결과 저장
          </button>
        </>
      }
    >
      <QueryBoundary query={query} isEmpty={(d) => d.length === 0} emptyTitle="검토할 메모가 없습니다">
        {(notes) => (
          <>
            {notes.map((n) => {
              const v = VISIBILITY_LABEL[n.visibility];
              return (
                <div className="mini-note" style={{ marginBottom: 12 }} key={n.id}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={`chip ${v.tone}`}>{v.label}</span>
                    <span className="chip">{n.taskTitle}</span>
                    <span className="t-cap num" style={{ marginLeft: "auto" }}>{n.academicYear}학년도</span>
                  </div>
                  <p>{n.body}</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="btn btn-quiet btn-sm">비공개 유지</button>
                    <button className="btn btn-quiet btn-sm">표현 다듬기</button>
                    <button className="btn btn-primary btn-sm">후임자에게 전달</button>
                  </div>
                </div>
              );
            })}
            <div className="notice">
              <InfoIcon />
              <span>
                AI는 민감 표현을 찾아 순화 초안을 제안할 수 있지만, <strong>최종 전달 여부는 항상 사람이 승인</strong>
                합니다.
              </span>
            </div>
          </>
        )}
      </QueryBoundary>
    </Modal>
  );
}
