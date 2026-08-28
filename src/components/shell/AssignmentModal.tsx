import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useAssignment } from "@/state/AssignmentContext";
import { useToast } from "@/state/ToastContext";
import { CheckIcon, InfoIcon } from "@/lib/icons";

/**
 * F01 담당 업무 선택. Only server-allowed assignments are selectable;
 * "업무 등록 제안" is intentionally disabled because no backend contract
 * exists yet to accept a school-proposed task — see docs/01 §8.2.
 */
export function AssignmentModal({ onClose }: { onClose: () => void }) {
  const { assignments, activeAssignmentId, setActiveAssignmentId, school } = useAssignment();
  const [pending, setPending] = useState(activeAssignmentId);
  const { toast } = useToast();

  return (
    <Modal
      titleId="assign-modal-title"
      eyebrow={school ? `${school.name} · ${school.academicYear}학년도` : undefined}
      title="담당 업무 선택"
      description="서버가 허용한 업무분장만 표시됩니다. 선택은 작업 맥락을 바꾸는 것이며 권한을 부여하지 않습니다."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" disabled>
            업무 등록 제안
          </button>
          <button className="btn btn-quiet" onClick={onClose}>
            취소
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (pending) setActiveAssignmentId(pending);
              onClose();
              toast("담당 업무를 전환했습니다");
            }}
          >
            이 업무로 계속하기
          </button>
        </>
      }
    >
      <div className="opt-grid">
        {assignments.map((a) => (
          <button
            key={a.id}
            className="opt"
            aria-pressed={pending === a.id}
            onClick={() => setPending(a.id)}
          >
            <span className="tick">
              <CheckIcon />
            </span>
            <span className="ot">{a.name}</span>
            <span className="om">
              {a.activeFrom}~ · {a.note ?? "서버 허용"} · 업무 {a.taskCount}개
            </span>
          </button>
        ))}
      </div>
      <div className="notice info" style={{ marginTop: 18 }}>
        <InfoIcon />
        <span>
          목록에 없는 업무를 맡으셨나요? 담당 업무 추가는 권한 상승이 아니라 <strong>학교 자체 업무 등록·제안</strong>으로
          진행됩니다. 현재 배포에서는 백엔드 계약이 없어 비활성 상태입니다.
        </span>
      </div>
    </Modal>
  );
}
