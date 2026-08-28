import { adaptTaskDetail } from "@/domain/adapters";
import { RawTaskDetailSchema } from "@/domain/raw-schemas";
import type { TaskDetail } from "@/domain/types";
import { postApi } from "./mockClient";

/**
 * F07 체크리스트 저장 — 백엔드 data/user_state.json 에 남는다.
 * 새로고침·재시작해도 유지된다. 응답은 저장 후의 업무 상세 전체다.
 */
export async function toggleChecklistItem(
  taskId: string,
  itemId: string,
  done: boolean,
): Promise<TaskDetail> {
  const raw = await postApi(
    `/api/frontend/task-details/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`,
    { done },
    RawTaskDetailSchema,
  );
  return adaptTaskDetail(raw);
}
