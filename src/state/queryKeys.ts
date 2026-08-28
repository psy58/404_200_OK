/** Full principal-scoped React Query keys backed by the V2 API key factory. */
import { apiKeys, queryKey } from "@/api/cache-keys.js";
import type { RequestContext } from "@/api/ui-api-boundary-v2";

export const qk = {
  session: () => ["session-context"] as const,
  home: (context: RequestContext) => apiKeys.home(context),
  tasks: (context: RequestContext) => queryKey(context, "task-summaries"),
  annual: (context: RequestContext, academicYear: number) => apiKeys.annual(context, { academicYear }),
  taskDetail: (context: RequestContext, taskId: string) => apiKeys.task(context, taskId),
  documents: (context: RequestContext) => apiKeys.documents(context),
  notes: (context: RequestContext) => apiKeys.notes(context),
  search: (context: RequestContext, query: string) => apiKeys.search(context, { query }),
  handover: (context: RequestContext, academicYear: number) => apiKeys.handover(context, academicYear),
  notifications: (context: RequestContext) => apiKeys.notifications(context),
  analysis: (context: RequestContext, jobId = "new") => apiKeys.analysis(context, jobId),
};
