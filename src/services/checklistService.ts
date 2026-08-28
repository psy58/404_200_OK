import type { RequestContext } from "@/api/ui-api-boundary-v2";
import { adaptTaskDetail } from "@/domain/adapters";
import type { TaskDetail } from "@/domain/types";
import { getFrontendApiService } from "./apiClient";
import { createIdempotencyKey, requestScope, runApiRequest } from "./requestExecution";

export async function updateChecklistItem(
  context: RequestContext,
  input: { taskId: string; itemId: string; complete: boolean; expectedVersion: number },
): Promise<TaskDetail> {
  return runApiRequest(requestScope(["checklist", context.sessionEpoch, context.assignmentId, input.taskId]), undefined, async (signal) => {
    const api = await getFrontendApiService();
    const detail = adaptTaskDetail(await api.updateChecklist(context, {
      ...input,
      idempotencyKey: createIdempotencyKey("checklist-update"),
      signal,
    }));
    if (!detail) throw new Error("체크리스트 응답에 업무 정보가 없습니다.");
    return detail;
  });
}
