import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { saveExperienceNoteMockOnly } from "@/services/notesService";
import { useToast } from "@/state/ToastContext";
import { qk } from "@/state/queryKeys";
import { InfoIcon, CheckIcon } from "@/lib/icons";
import type { NoteVisibility } from "@/domain/types";

const VISIBILITY_OPTIONS: { value: NoteVisibility; label: string; hint: string }[] = [
  { value: "private", label: "나만 보기", hint: "연말 검토 전까지 비공개" },
  { value: "handover", label: "후임자 전달", hint: "인수인계 전달 후보" },
  { value: "organization", label: "학교 조직지식", hint: "승인 후 학교에 축적" },
];

/**
 * F10 경험 메모 작성 (최소형, "선생님들의 감"). Save is MOCK_ONLY — see
 * services/notesService.ts — so this never claims real persistence.
 */
export function NoteComposerModal({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const [visibility, setVisibility] = useState<NoteVisibility>("private");
  const [body, setBody] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: saveExperienceNoteMockOnly,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.notes() });
      onClose();
      toast("저장했습니다 (시연)");
    },
  });

  return (
    <Modal
      titleId="note-modal-title"
      eyebrow="경험 메모"
      title="이번에 알게 된 것 기록하기"
      description="한두 줄이면 충분합니다. 연말에 모아서 인수인계 자료로 정리합니다."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            취소
          </button>
          <button
            className="btn btn-primary"
            disabled={!body.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "저장 중…" : "메모 저장"}
          </button>
        </>
      }
    >
      <span className="eyebrow">메모 내용</span>
      <textarea
        rows={5}
        style={{
          width: "100%",
          marginTop: 10,
          padding: 14,
          border: "1px solid var(--line)",
          borderRadius: 11,
          resize: "vertical",
          outline: "none",
          fontSize: 14,
          lineHeight: 1.7,
        }}
        placeholder="예: 운영계획 기안 전에 교감 선생님과 일정을 먼저 협의할 것"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        data-task-id={taskId}
      />
      <div style={{ marginTop: 20 }}>
        <span className="eyebrow">공개 범위</span>
        <div className="opt-grid" style={{ marginTop: 10, gridTemplateColumns: "1fr 1fr 1fr" }}>
          {VISIBILITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className="opt"
              aria-pressed={visibility === opt.value}
              onClick={() => setVisibility(opt.value)}
            >
              <span className="tick"><CheckIcon /></span>
              <span className="ot">{opt.label}</span>
              <span className="om">{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="notice" style={{ marginTop: 18 }}>
        <InfoIcon />
        <span>
          학생·학부모·교직원을 특정할 수 있는 표현은 저장 전 검사합니다. 민감한 내용은 <strong>나만 보기</strong>로
          남기고 연말 검토에서 다시 판단하세요.
        </span>
      </div>
    </Modal>
  );
}
