import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useAssignment } from "@/state/AssignmentContext";
import { useToast } from "@/state/ToastContext";
import { useOverlay } from "@/state/OverlayContext";
import { CheckIcon, CloseIcon } from "@/lib/icons";

/** F01 담당 업무 선택. 서버가 허용한 업무분장 중에서만 고를 수 있다. */
export function AssignmentModal({ onClose }: { onClose: () => void }) {
  const { assignments, selectedAssignmentIds, setSelectedAssignmentIds, school, customAssignmentIds, removeCustomAssignment } = useAssignment();
  const [pendingIds, setPendingIds] = useState(selectedAssignmentIds);
  const { toast } = useToast();
  const { open } = useOverlay();
  const initialAssignments = assignments.filter((assignment) => !assignment.note?.includes("신규 업무"));

  const remove = (assignment: { id: string; name: string }) => {
    const ok = window.confirm(`"${assignment.name}" 담당 업무를 삭제할까요?\n이 담당 업무에 딸린 업무 카드와 문서도 화면에서 사라집니다.`);
    if (!ok) return;
    if (!removeCustomAssignment(assignment.id)) {
      toast("이 담당 업무는 삭제할 수 없습니다.");
      return;
    }
    setPendingIds((current) => current.filter((id) => id !== assignment.id));
    toast(`"${assignment.name}" 담당 업무를 삭제했습니다`);
  };

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
            disabled={pendingIds.length === 0}
            onClick={() => {
              setSelectedAssignmentIds(pendingIds);
              onClose();
              toast("선택한 담당 업무를 적용했습니다");
            }}
          >
            선택한 업무 보기
          </button>
        </>
      }
    >
      <div className="assignment-grid">
        {initialAssignments.map((assignment) => (
          <div key={assignment.id} className={customAssignmentIds.includes(assignment.id) ? "assignment-card-wrap is-custom" : "assignment-card-wrap"}>
          <button
            className="assignment-card"
            aria-pressed={pendingIds.includes(assignment.id)}
            onClick={() => setPendingIds((current) => {
              if (current.includes(assignment.id)) {
                if (current.length === 1) {
                  toast("최소 1개의 담당 업무를 선택해주세요.");
                  return current;
                }
                return current.filter((id) => id !== assignment.id);
              }
              return [...current, assignment.id];
            })}
          >
            <span className="assignment-card-title">
              <strong>{assignment.name}</strong>
              {pendingIds.includes(assignment.id) && <span className="assignment-check" aria-label="선택됨"><CheckIcon /></span>}
            </span>
            <span>{Number(assignment.activeFrom.slice(5, 7))}월부터 담당</span>
          </button>
          {customAssignmentIds.includes(assignment.id) && (
            <button
              type="button"
              className="assignment-card-remove"
              aria-label={`${assignment.name} 담당 업무 삭제`}
              title="담당 업무 삭제"
              onClick={() => remove(assignment)}
            >
              <CloseIcon />
            </button>
          )}
          </div>
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
    </Modal>
  );
}
