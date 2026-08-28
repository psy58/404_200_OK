import { adaptTaskDetail, adaptTask } from "@/domain/adapters";
import { RawTaskDetailSchema, RawTasksResponseSchema } from "@/domain/raw-schemas";
import type { TaskDetail, TaskInstance } from "@/domain/types";
import { NotFoundIssue, fetchMock } from "./mockClient";

export async function getTasks(assignmentId: string, signal?: AbortSignal): Promise<TaskInstance[]> {
  const raw = await fetchMock("/mocks/backend/tasks.json", RawTasksResponseSchema, { signal });
  return raw.items.filter((t) => t.assignment_id === assignmentId).map(adaptTask);
}

export async function getTaskDetail(taskId: string, signal?: AbortSignal): Promise<TaskDetail | null> {
  try {
    const raw = await fetchMock(`/mocks/backend/task-details/${taskId}.json`, RawTaskDetailSchema, { signal });
    return adaptTaskDetail(raw);
  } catch (err) {
    if (err instanceof NotFoundIssue) return null;
    throw err;
  }
}
