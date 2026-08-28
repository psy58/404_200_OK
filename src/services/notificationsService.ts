import { adaptNotification } from "@/domain/adapters";
import { RawNotificationsReadSchema, RawNotificationsResponseSchema } from "@/domain/raw-schemas";
import type { AppNotification } from "@/domain/types";
import { fetchMock, postApi } from "./mockClient";

/**
 * F08 알림 — 읽음 처리는 백엔드 data/user_state.json 에 남는다.
 * 알림 자체는 올해 업무의 시기(작년 기준)에서 만들어진다.
 */
export async function getNotifications(signal?: AbortSignal): Promise<AppNotification[]> {
  const raw = await fetchMock("/mocks/backend/notifications.json", RawNotificationsResponseSchema, { signal });
  return raw.items.map(adaptNotification);
}

export async function markAllNotificationsRead(): Promise<number> {
  const raw = await postApi("/api/frontend/notifications/read", { all: true }, RawNotificationsReadSchema);
  return raw.marked;
}
