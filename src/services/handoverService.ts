import type { RequestContext } from "@/api/ui-api-boundary-v2";
import { adaptHandover } from "@/domain/adapters";
import type { HandoverPreview } from "@/domain/types";
import { getFrontendApiService } from "./apiClient";
import { requestScope, runApiRequest } from "./requestExecution";

export async function getHandoverPreview(context: RequestContext, academicYear: number, signal?: AbortSignal): Promise<HandoverPreview> {
  return runApiRequest(requestScope(["handover", context.sessionEpoch, context.assignmentId, academicYear]), signal, async (requestSignal) => {
    const api = await getFrontendApiService();
    return adaptHandover(await api.getHandoverPreview(context, academicYear, { signal: requestSignal }), context);
  });
}
