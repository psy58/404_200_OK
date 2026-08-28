import type { RequestContext } from "@/api/ui-api-boundary-v2";
import { adaptDocument } from "@/domain/adapters";
import type { DocumentItem } from "@/domain/types";
import { getFrontendApiService } from "./apiClient";
import { requestScope, runApiRequest } from "./requestExecution";

export async function getDocuments(context: RequestContext, signal?: AbortSignal): Promise<DocumentItem[]> {
  return runApiRequest(requestScope(["documents", context.sessionEpoch, context.assignmentId]), signal, async (requestSignal) => {
    const api = await getFrontendApiService();
    const result = await api.listDocuments(context, { signal: requestSignal });
    return result.items.map(adaptDocument);
  });
}
