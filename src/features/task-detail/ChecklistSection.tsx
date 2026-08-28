import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toggleChecklistItemMockOnly } from "@/services/checklistService";
import { useToast } from "@/state/ToastContext";
import { qk } from "@/state/queryKeys";
import { CheckIcon } from "@/lib/icons";
import type { ChecklistItem, TaskDetail } from "@/domain/types";

/**
 * F07 업무 체크리스트. Optimistic toggle with rollback on failure — see
 * services/checklistService.ts. Persistence is MOCK_ONLY: a page reload
 * will not keep the change (BACKEND_CONTRACT_REQUIRED for real storage).
 */
export function ChecklistSection({ taskId, checklist }: { taskId: string; checklist: ChecklistItem[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const done = checklist.filter((c) => c.done).length;

  const mutation = useMutation<{ ok: true }, Error, string, { previous?: TaskDetail }>({
    mutationFn: () => toggleChecklistItemMockOnly(),
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
    onError: (_err, _itemId, context) => {
      // Roll back to the pre-mutation cache. We deliberately do NOT
      // invalidate/refetch on success: the backing fixture is a static
      // JSON file with no real persistence, so a refetch would silently
      // discard the optimistic change and make the checklist look broken.
      // The optimistic cache IS the session's source of truth until a real
      // backend (BACKEND_CONTRACT_REQUIRED) replaces this mock.
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
