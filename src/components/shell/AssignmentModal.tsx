import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useAssignment } from "@/state/AssignmentContext";
import { useToast } from "@/state/ToastContext";
import { CheckIcon } from "@/lib/icons";

/** F01 담당 업무 선택. 서버가 허용한 업무분장 중에서만 고를 수 있다. */
export function AssignmentModal({ onClose }: { onClose: () => void }) {
  const { assignments, activeAssignmentId, setActiveAssignmentId, school } = useAssignment();
  const [pending, setPending] = useState(activeAssignmentId);
  const { toast } = useToast();

  return (
    <Modal
      titleId="assign-modal-title"
      eyebrow={school ? `${school.name} · ${school.academicYear}학년도` : undefined}
      title="담당 업무 선택"
      onClose={onClose}
      footer={
        <>
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
              {a.activeFrom}~ · {a.note ?? "학교 기본 업무"} · 업무 {a.taskCount}개
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
