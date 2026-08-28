import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toggleChecklistItem } from "@/services/checklistService";
import { useToast } from "@/state/ToastContext";
import { qk } from "@/state/queryKeys";
import { CheckIcon } from "@/lib/icons";
import type { ChecklistItem, TaskDetail } from "@/domain/types";

/**
 * F07 업무 체크리스트. 디자인 마크업은 유지하고 저장 이벤트만 실제
 * 백엔드 서비스에 연결한다. 실패 시 낙관적 갱신을 되돌린다.
 */
export function ChecklistSection({ taskId, checklist }: { taskId: string; checklist: ChecklistItem[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const done = checklist.filter((c) => c.done).length;

  const mutation = useMutation<TaskDetail, Error, string, { previous?: TaskDetail }>({
    mutationFn: (itemId: string) => {
      const target = checklist.find((item) => item.id === itemId);
      return toggleChecklistItem(taskId, itemId, !(target?.done ?? false));
    },
    onMutate: async (itemId: string) => {
      await queryClient.cancelQueries({ queryKey: qk.taskDetail(taskId) });
      const previous = queryClient.getQueryData<TaskDetail>(qk.taskDetail(taskId));
      if (previous) {
        queryClient.setQueryData<TaskDetail>(qk.taskDetail(taskId), {
          ...previous,
          checklist: previous.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)),
        });
      }
      return { previous };
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(qk.taskDetail(taskId), detail);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (_err, _itemId, context) => {
      if (context?.previous) queryClient.setQueryData(qk.taskDetail(taskId), context.previous);
      toast("저장에 실패했습니다. 이전 상태로 되돌렸습니다.");
    },
  });

  return (
    <section className="card card-pad">
      <div className="card-head">
        <span className="lead">
          <h2 className="t-h2">업무 체크리스트</h2>
          <span className="chip navy num">{done}/{checklist.length}</span>
        </span>
        <span className="t-cap">완료 기록은 인수인계 초안에 포함됩니다</span>
      </div>
      {checklist.map((c) => (
        <div className={`check${c.done ? " on" : ""}`} key={c.id}>
          <button
            className="cbox"
            role="checkbox"
            aria-checked={c.done}
            aria-label={c.text}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(c.id)}
          >
            {c.done ? <CheckIcon /> : null}
          </button>
          <span>
            <span className="ct">{c.text}</span>
            {c.note && <span className="cm">{c.note}</span>}
          </span>
        </div>
      ))}
    </section>
  );
}
