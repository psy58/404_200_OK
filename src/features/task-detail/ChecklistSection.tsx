import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateChecklistItem } from "@/services/checklistService";
import { useAssignment } from "@/state/AssignmentContext";
import { useToast } from "@/state/ToastContext";
import { qk } from "@/state/queryKeys";
import { CheckIcon } from "@/lib/icons";
import type { ChecklistItem, TaskDetail } from "@/domain/types";

interface ToggleInput { itemId: string; complete: boolean; expectedVersion: number }

/** F07 optimistic update with version/idempotency and exact rollback. */
export function ChecklistSection({ taskId, checklist }: { taskId: string; checklist: ChecklistItem[] }) {
  const queryClient = useQueryClient();
  const { context } = useAssignment();
  const { toast } = useToast();
  const done = checklist.filter((item) => item.done).length;
  const key = context ? qk.taskDetail(context, taskId) : ["task-detail", "disabled", taskId];

  const mutation = useMutation<TaskDetail, Error, ToggleInput, { previous?: TaskDetail }>({
    mutationFn: (input) => {
      if (!context) throw new Error("담당 업무 맥락을 확인해 주세요.");
      return updateChecklistItem(context, { taskId, ...input });
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TaskDetail>(key);
      if (previous) {
        queryClient.setQueryData<TaskDetail>(key, {
          ...previous,
          checklist: previous.checklist.map((item) => item.id === input.itemId ? { ...item, done: input.complete } : item),
        });
      }
      return { previous };
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
      if (context) queryClient.invalidateQueries({ queryKey: qk.tasks(context) });
    },
    onError: (_error, _input, rollback) => {
      if (rollback?.previous) queryClient.setQueryData(key, rollback.previous);
      toast("저장하지 못했습니다. 이전 상태로 되돌렸습니다.");
    },
  });

  return (
    <section className="card card-pad">
      <div className="card-head">
        <span className="lead"><h2 className="t-h2">업무 체크리스트</h2><span className="chip navy num">{done}/{checklist.length}</span></span>
        <span className="t-cap">체크 기록은 인수인계서에 자동 반영됩니다</span>
      </div>
      {checklist.map((item) => (
        <div className={`check${item.done ? " on" : ""}`} key={item.id}>
          <button
            className="cbox"
            role="checkbox"
            aria-checked={item.done}
            aria-label={item.text}
            disabled={mutation.isPending || !context}
            onClick={() => mutation.mutate({ itemId: item.id, complete: !item.done, expectedVersion: item.version })}
          >
            {item.done ? <CheckIcon /> : null}
          </button>
          <span><span className="ct">{item.text}</span>{item.note && <span className="cm">{item.note}</span>}</span>
        </div>
      ))}
    </section>
  );
}
