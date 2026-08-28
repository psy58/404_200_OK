import { adaptDocument } from "@/domain/adapters";
import { RawDocumentsResponseSchema } from "@/domain/raw-schemas";
import type { DocumentItem } from "@/domain/types";
import { fetchMock } from "./mockClient";
import { getHakmatongDocuments } from "@/state/hakmatongDemo";

export async function getDocuments(signal?: AbortSignal): Promise<DocumentItem[]> {
  const raw = await fetchMock("/mocks/backend/documents.json", RawDocumentsResponseSchema, { signal });
  return [...raw.items.map(adaptDocument), ...getHakmatongDocuments()];
}
