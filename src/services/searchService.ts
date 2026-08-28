import type { RequestContext } from "@/api/ui-api-boundary-v2";
import { adaptSearchResult } from "@/domain/adapters";
import type { SearchResult } from "@/domain/types";
import { getFrontendApiService } from "./apiClient";
import { requestScope, runApiRequest } from "./requestExecution";

export async function searchAll(context: RequestContext, query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  return runApiRequest(requestScope(["search", context.sessionEpoch, context.assignmentId, query]), signal, async (requestSignal) => {
    const api = await getFrontendApiService();
    const result = await api.search(context, { query, limit: 8, signal: requestSignal });
    return result.items.map(adaptSearchResult);
  });
}
