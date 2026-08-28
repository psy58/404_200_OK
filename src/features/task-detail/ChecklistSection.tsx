import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toggleChecklistItem } from "@/services/checklistService";
import { useToast } from "@/state/ToastContext";
import { qk } from "@/state/queryKeys";
import { CheckIcon } from "@/lib/icons";
import type { ChecklistItem, TaskDetail } from "@/domain/types";

/**
 * F07 업무 체크리스트 — 백엔드에 저장된다(새로고침·재시작에도 유지).
 * 낙관적 갱신 후 실패하면 되돌리고, 성공하면 서버가 준 상세로 맞춘 뒤
 * 목록의 n/m 카운트도 새로 고친다.
 */
export function ChecklistSection({ taskId, checklist }: { taskId: string; checklist: ChecklistItem[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const done = checklist.filter((c) => c.done).length;

  const mutation = useMutation<TaskDetail, Error, string, { previous?: TaskDetail }>({
    mutationFn: (itemId: string) => {
      const target = checklist.find((c) => c.id === itemId);
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
      // 서버가 준 상세가 저장된 진실이다. 목록의 n/m·상태도 바뀌므로 새로 고친다.
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
        <span className="t-cap">체크는 서버에 저장되어 새로고침해도 유지됩니다</span>
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
