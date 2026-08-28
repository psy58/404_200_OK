import type { NotificationCenterVM, RequestContext } from "@/api/ui-api-boundary-v2";
import { adaptNotification } from "@/domain/adapters";
import type { AppNotification } from "@/domain/types";
import { getFrontendApiService } from "./apiClient";
import { requestScope, runApiRequest } from "./requestExecution";

export interface NotificationsResult {
  status: NotificationCenterVM["status"];
  unread: number;
  issue: NotificationCenterVM["issue"];
  items: AppNotification[];
}

export async function getNotifications(context: RequestContext, signal?: AbortSignal): Promise<NotificationsResult> {
  return runApiRequest(requestScope(["notifications", context.sessionEpoch, context.assignmentId]), signal, async (requestSignal) => {
    const api = await getFrontendApiService();
    const result = await api.getNotifications(context, { signal: requestSignal });
    return { status: result.status, unread: result.unread, issue: result.issue, items: result.items.map(adaptNotification) };
  });
}
