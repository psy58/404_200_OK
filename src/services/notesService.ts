import type { RequestContext } from "@/api/ui-api-boundary-v2";
import { adaptExperienceNote } from "@/domain/adapters";
import type { ExperienceNote, NoteVisibility } from "@/domain/types";
import { getFrontendApiService } from "./apiClient";
import { createIdempotencyKey, requestScope, runApiRequest } from "./requestExecution";

function apiVisibility(visibility: NoteVisibility): "private" | "handover" | "school" {
  return visibility === "organization" ? "school" : visibility;
}

export async function getExperienceNotes(context: RequestContext, currentUserLabel: string, signal?: AbortSignal): Promise<ExperienceNote[]> {
  return runApiRequest(requestScope(["notes", context.sessionEpoch, context.assignmentId]), signal, async (requestSignal) => {
    const api = await getFrontendApiService();
    const [notes, home] = await Promise.all([
      api.listExperienceNotes(context, { signal: requestSignal }),
      api.getHome(context, { signal: requestSignal }),
    ]);
    const tasks = [...home.urgent, ...home.thisMonth, ...home.nextThirtyDays];
    const taskTitles = new Map(tasks.map((task) => [task.id, task.title]));
    return notes.items.map((note) => adaptExperienceNote(note, taskTitles, currentUserLabel));
  });
}

export async function createExperienceNote(
  context: RequestContext,
  currentUserLabel: string,
  input: { taskId: string; academicYear: number; text: string; visibility: NoteVisibility; expectedVersion: number },
  signal?: AbortSignal,
): Promise<ExperienceNote[]> {
  return runApiRequest(requestScope(["note-create", context.sessionEpoch, context.assignmentId]), signal, async (requestSignal) => {
    const api = await getFrontendApiService();
    const result = await api.createExperienceNote(context, {
      taskId: input.taskId,
      academicYear: input.academicYear,
      text: input.text,
      visibility: apiVisibility(input.visibility),
      expectedVersion: input.expectedVersion,
      idempotencyKey: createIdempotencyKey("experience-note-create"),
      signal: requestSignal,
    });
    const home = await api.getHome(context, { signal: requestSignal });
    const taskTitles = new Map([...home.urgent, ...home.thisMonth, ...home.nextThirtyDays].map((task) => [task.id, task.title]));
    return result.items.map((note) => adaptExperienceNote(note, taskTitles, currentUserLabel));
  });
}
