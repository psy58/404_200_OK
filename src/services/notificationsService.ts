import type { NotificationCenterVM, RequestContext } from "@/api/ui-api-boundary-v2";
import { adaptNotification } from "@/domain/adapters";
import type { AppNotification } from "@/domain/types";
import { getFrontendApiService } from "./apiClient";
import { createIdempotencyKey, requestScope, runApiRequest } from "./requestExecution";

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

function adaptResult(result: NotificationCenterVM): NotificationsResult {
  return { status: result.status, unread: result.unread, issue: result.issue, items: result.items.map(adaptNotification) };
}

export async function markNotificationRead(context: RequestContext, notificationId: string): Promise<NotificationsResult> {
  return runApiRequest(requestScope(["notification-read", context.sessionEpoch, context.assignmentId, notificationId]), undefined, async (signal) => {
    const api = await getFrontendApiService();
    return adaptResult(await api.markNotificationRead(context, {
      notificationId,
      expectedVersion: 1,
      idempotencyKey: createIdempotencyKey("notification-read"),
      signal,
    }));
  });
}

export async function markAllNotificationsRead(context: RequestContext): Promise<NotificationsResult> {
  return runApiRequest(requestScope(["notifications-read-all", context.sessionEpoch, context.assignmentId]), undefined, async (signal) => {
    const api = await getFrontendApiService();
    return adaptResult(await api.markAllNotificationsRead(context, {
      expectedVersion: 1,
      idempotencyKey: createIdempotencyKey("notifications-read-all"),
      signal,
    }));
  });
}
