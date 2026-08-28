import { adaptFeedItem } from "@/domain/adapters";
import { RawFeedResponseSchema } from "@/domain/raw-schemas";
import type { FeedItem } from "@/domain/types";
import { fetchMock } from "./mockClient";
import { getHakmatongFeed } from "@/state/hakmatongDemo";

export async function getFeed(signal?: AbortSignal): Promise<FeedItem[]> {
  const raw = await fetchMock("/mocks/backend/feed.json", RawFeedResponseSchema, { signal });
  return [...raw.items.map(adaptFeedItem), ...getHakmatongFeed()];
}
