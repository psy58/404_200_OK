import { adaptNotification } from "@/domain/adapters";
import { RawNotificationsResponseSchema } from "@/domain/raw-schemas";
import type { AppNotification } from "@/domain/types";
import { fetchMock } from "./mockClient";

/**
 * F08 — real P1 feature per docs/영상_기반_디자인_참고_지시서.md §5.9 and
 * docs/프론트엔드_구현_프롬프트_영상_반영_보충안.md §8: this screen must not be
 * decorative. Backing store here is still JSON mock (BACKEND_CONTRACT_REQUIRED
 * for delivery/read-receipt persistence), so "mark all read" only updates
 * client state, not a server record — see NotificationPanel usage.
 */
export async function getNotifications(signal?: AbortSignal): Promise<AppNotification[]> {
  const raw = await fetchMock("/mocks/backend/notifications.json", RawNotificationsResponseSchema, { signal });
  return raw.items.map(adaptNotification);
}
