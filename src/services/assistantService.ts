import type { AssistantVM, RequestContext } from "@/api/ui-api-boundary-v2";
import { getFrontendApiService } from "./apiClient";
import { createIdempotencyKey, requestScope, runApiRequest } from "./requestExecution";

export async function askAssistant(
  context: RequestContext,
  question: string,
  taskId: string,
  signal?: AbortSignal,
): Promise<AssistantVM> {
  return runApiRequest(requestScope(["assistant", context.sessionEpoch, context.assignmentId, taskId]), signal, async (requestSignal) => {
    const api = await getFrontendApiService();
    return api.queryAssistant(context, {
      taskId,
      question: question.trim(),
      idempotencyKey: createIdempotencyKey("assistant-query"),
      signal: requestSignal,
    });
  });
}
