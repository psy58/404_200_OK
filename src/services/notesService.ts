import { adaptExperienceNote } from "@/domain/adapters";
import { RawExperienceNotesResponseSchema } from "@/domain/raw-schemas";
import type { ExperienceNote } from "@/domain/types";
import { fetchMock } from "./mockClient";

export async function getExperienceNotes(signal?: AbortSignal): Promise<ExperienceNote[]> {
  const raw = await fetchMock("/mocks/backend/experience-notes.json", RawExperienceNotesResponseSchema, { signal });
  return raw.items.map(adaptExperienceNote);
}

/**
 * MOCK_ONLY: no server persistence. A save here is not durable across a
 * reload and must not be reported as F10 completion — see
 * docs/requirements-traceability-design.md §6 (BACKEND_CONTRACT_REQUIRED).
 */
export async function saveExperienceNoteMockOnly(): Promise<{ ok: true }> {
  await new Promise((r) => setTimeout(r, 300));
  return { ok: true };
}
