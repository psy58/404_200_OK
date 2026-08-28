import { adaptTaskDetail, adaptTask } from "@/domain/adapters";
import { RawTaskDetailSchema, RawTaskSchema, RawTasksResponseSchema } from "@/domain/raw-schemas";
import type { TaskDetail, TaskInstance } from "@/domain/types";
import { NotFoundIssue, fetchMock, postApi } from "./mockClient";

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

/** 업무 카드 직접 추가 — 백엔드 data/user_state.json 에 남는다. */
export async function createTask(input: {
  title: string;
  startDate?: string;
  dueDate?: string;
  memo?: string;
}): Promise<TaskInstance> {
  const raw = await postApi(
    "/api/frontend/tasks",
    {
      title: input.title,
      start_date: input.startDate || null,
      due_date: input.dueDate || null,
      memo: input.memo || null,
    },
    RawTaskSchema,
  );
  return adaptTask(raw);
}
