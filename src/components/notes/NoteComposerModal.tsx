import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { createExperienceNote } from "@/services/notesService";
import { getTasks } from "@/services/tasksService";
import { useAssignment } from "@/state/AssignmentContext";
import { useToast } from "@/state/ToastContext";
import { qk } from "@/state/queryKeys";
import { InfoIcon, CheckIcon } from "@/lib/icons";
import type { NoteVisibility } from "@/domain/types";

const OPTIONS: { value: NoteVisibility; label: string; hint: string }[] = [
  { value: "private", label: "나만 보기", hint: "연말 검토 전까지 비공개" },
  { value: "handover", label: "후임자 전달", hint: "인수인계 전달 후보" },
  { value: "organization", label: "학교 조직지식", hint: "승인 후 학교에 축적" },
];

export function NoteComposerModal({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const [visibility, setVisibility] = useState<NoteVisibility>("private");
  const [body, setBody] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState(taskId ?? "");
  const { context, user, school } = useAssignment();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({
    queryKey: context ? qk.tasks(context) : ["tasks", "disabled"],
    queryFn: ({ signal }) => getTasks(context!, signal),
    enabled: !!context,
  });
  const effectiveTaskId = taskId ?? selectedTaskId;
  const task = tasksQuery.data?.find((item) => item.id === effectiveTaskId);
  const mutation = useMutation({
    mutationFn: () => {
      if (!context || !user || !school || !task) throw new Error("메모를 연결할 업무를 확인해 주세요.");
      return createExperienceNote(context, user.displayName, {
        taskId: task.id,
        academicYear: school.academicYear,
        text: body.trim(),
        visibility,
        expectedVersion: task.version,
      });
    },
    onSuccess: (notes) => {
      if (context) {
        queryClient.setQueryData(qk.notes(context), notes);
        queryClient.invalidateQueries({ queryKey: qk.tasks(context) });
        if (task) queryClient.invalidateQueries({ queryKey: qk.taskDetail(context, task.id) });
        if (school) queryClient.invalidateQueries({ queryKey: qk.handover(context, school.academicYear) });
      }
      onClose();
      toast("경험 메모를 세션 경계에 저장했습니다");
    },
    onError: () => toast("메모를 저장하지 못했습니다. 작성 내용은 유지됩니다.", "error"),
  });

  return (
    <Modal
      titleId="note-modal-title"
      eyebrow="경험 메모"
      title="이번에 알게 된 것 기록하기"
      description="한두 줄이면 충분합니다. 연말에 모아서 인수인계 자료로 정리합니다."
      onClose={onClose}
      footer={<><button className="btn btn-quiet" onClick={onClose}>취소</button><button className="btn btn-primary" disabled={!body.trim() || !task || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "저장 중…" : "메모 저장"}</button></>}
    >
      {!taskId && (
        <label className="eyebrow">관련 업무
          <select value={effectiveTaskId} onChange={(event) => setSelectedTaskId(event.target.value)} style={{ display: "block", width: "100%", marginTop: 10, padding: 12 }}>
            <option value="">업무를 선택하세요</option>
            {(tasksQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
      )}
      <span className="eyebrow" style={{ display: "block", marginTop: taskId ? 0 : 18 }}>메모 내용</span>
      <textarea rows={5} style={{ width: "100%", marginTop: 10, padding: 14, border: "1px solid var(--line)", borderRadius: 11, resize: "vertical", outline: "none", fontSize: 14, lineHeight: 1.7 }} placeholder="예: 운영계획 기안 전에 교감 선생님과 일정을 먼저 협의할 것" value={body} onChange={(event) => setBody(event.target.value)} />
      <div style={{ marginTop: 20 }}><span className="eyebrow">공개 범위</span><div className="opt-grid" style={{ marginTop: 10, gridTemplateColumns: "1fr 1fr 1fr" }}>
        {OPTIONS.map((option) => <button key={option.value} className="opt" aria-pressed={visibility === option.value} onClick={() => setVisibility(option.value)}><span className="tick"><CheckIcon /></span><span className="ot">{option.label}</span><span className="om">{option.hint}</span></button>)}
      </div></div>
      <div className="notice" style={{ marginTop: 18 }}><InfoIcon /><span>학생·학부모·교직원을 특정할 수 있는 표현은 적지 마세요. 실제 서버 검사는 <strong>BACKEND_REQUIRED</strong>입니다.</span></div>
    </Modal>
  );
}
