import { adaptExperienceNote } from "@/domain/adapters";
import { RawExperienceNoteSchema, RawExperienceNotesResponseSchema } from "@/domain/raw-schemas";
import type { ExperienceNote } from "@/domain/types";
import { fetchMock, postApi } from "./mockClient";

export async function getExperienceNotes(signal?: AbortSignal): Promise<ExperienceNote[]> {
  const raw = await fetchMock("/mocks/backend/experience-notes.json", RawExperienceNotesResponseSchema, { signal });
  return raw.items.map(adaptExperienceNote);
}

/** F10 경험 노트 저장 — 백엔드 data/user_state.json 에 남는다. */
export async function saveExperienceNote(input: {
  taskId?: string;
  visibility: string;
  body: string;
}): Promise<ExperienceNote> {
  const raw = await postApi(
    "/api/frontend/experience-notes",
    { task_id: input.taskId ?? null, visibility: input.visibility, body: input.body },
    RawExperienceNoteSchema,
  );
  return adaptExperienceNote(raw);
}
