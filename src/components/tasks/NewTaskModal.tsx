import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { createTask } from "@/services/tasksService";
import { useToast } from "@/state/ToastContext";

/**
 * 업무 카드 직접 추가 — 작년 기록에 없는 새 업무를 담당자가 직접 등록한다.
 * 서버(data/user_state.json)에 저장되어 목록·연간 지도에 함께 나온다.
 * 기본 체크리스트(계획 수립 → … → 결과 보고)가 붙는다.
 */
export function NewTaskModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [memo, setMemo] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => createTask({ title, startDate, dueDate, memo }),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      onClose();
      toast(`"${task.title}" 업무를 추가했습니다`);
    },
    onError: (error: Error) => toast(error.message),
  });

  const field = { display: "grid", gap: 6 } as const;
  const label = { fontSize: 12, fontWeight: 640, color: "var(--ink-600, #5a6270)" } as const;
  const input = {
    font: "inherit",
    padding: "9px 11px",
    border: "1px solid var(--line, #e3e6ea)",
    borderRadius: 8,
  } as const;

  return (
    <Modal
      titleId="new-task-modal-title"
      eyebrow="업무 추가"
      title="새 업무 카드 만들기"
      description="작년 기록에 없는 새 업무를 등록합니다. 관련 공문이 들어오면 근거가 이 카드에 쌓입니다."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            취소
          </button>
          <button
            className="btn btn-primary"
            disabled={!title.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "저장 중" : "추가"}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <label style={field}>
          <span style={label}>업무 이름 *</span>
          <input
            style={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예) 2026 신입생 과학 캠프 운영"
            maxLength={120}
            autoFocus
          />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={field}>
            <span style={label}>준비 시작일</span>
            <input style={input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label style={field}>
            <span style={label}>마감일</span>
            <input style={input} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>
        <label style={field}>
          <span style={label}>메모</span>
          <input
            style={input}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="업무 카드에 표시할 한 줄 설명 (선택)"
            maxLength={500}
          />
        </label>
      </div>
    </Modal>
  );
}
