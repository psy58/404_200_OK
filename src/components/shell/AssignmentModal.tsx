import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useAssignment } from "@/state/AssignmentContext";
import { useToast } from "@/state/ToastContext";
import { useOverlay } from "@/state/OverlayContext";
import { CheckIcon, InfoIcon } from "@/lib/icons";

/** F01 담당 업무 선택. 서버가 허용한 업무분장 중에서만 고를 수 있다. */
export function AssignmentModal({ onClose }: { onClose: () => void }) {
  const { assignments, activeAssignmentId, setActiveAssignmentId, school, status, errorMessage } = useAssignment();
  const [pending, setPending] = useState(activeAssignmentId);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { open } = useOverlay();

  return (
    <Modal
      titleId="assign-modal-title"
      eyebrow={school ? `${school.name} · ${school.academicYear}학년도` : undefined}
      title="담당 업무 선택"
      description="지금 보고 싶은 담당 업무를 선택하세요."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            취소
          </button>
          <button
            className="btn btn-primary"
            disabled={!pending || saving || status === "switching"}
            onClick={async () => {
              if (!pending) return;
              setSaving(true);
              try {
                await setActiveAssignmentId(pending);
                onClose();
                toast("담당 업무를 전환했습니다");
              } catch {
                toast("담당 업무를 전환하지 못했습니다. 입력과 기존 화면은 유지됩니다.", "error");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "전환 중…" : "이 업무로 계속하기"}
          </button>
        </>
      }
    >
      <div className="assignment-grid">
        {assignments.map((assignment) => (
          <button
            key={assignment.id}
            className="assignment-card"
            aria-pressed={pending === assignment.id}
            onClick={() => setPending(assignment.id)}
          >
            <span className="assignment-card-title">
              <strong>{assignment.name}</strong>
              {pending === assignment.id && <span className="assignment-check" aria-label="선택됨"><CheckIcon /></span>}
            </span>
            <span>{Number(assignment.activeFrom.slice(5, 7))}월부터 담당 · 업무 {assignment.taskCount}개</span>
          </button>
        ))}
        <button
          className="assignment-add-card"
          onClick={() => {
            onClose();
            requestAnimationFrame(() => open("new-assignment"));
          }}
        >
          <span className="assignment-add-icon" aria-hidden="true">+</span>
          <span><strong>새로운 업무 추가</strong><small>새로 맡은 업무 등록</small></span>
        </button>
      </div>
      {errorMessage && <p className="t-cap" role="alert" style={{ marginTop: 12 }}>{errorMessage}</p>}
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
