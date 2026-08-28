import type { RequestContext } from "@/api/ui-api-boundary-v2";
import { adaptTask, adaptTaskDetail } from "@/domain/adapters";
import type { TaskDetail, TaskInstance } from "@/domain/types";
import { getFrontendApiService } from "./apiClient";
import { createIdempotencyKey, requestScope, runApiRequest } from "./requestExecution";

export async function getTasks(context: RequestContext, signal?: AbortSignal): Promise<TaskInstance[]> {
  return runApiRequest(requestScope(["tasks", context.sessionEpoch, context.assignmentId]), signal, async (requestSignal) => {
    const api = await getFrontendApiService();
    const home = await api.getHome(context, { signal: requestSignal });
    const unique = new Map([...home.urgent, ...home.thisMonth, ...home.nextThirtyDays].map((task) => [task.id, task]));
    return [...unique.values()].map((task) => adaptTask(task, context));
  });
}

export async function getAnnualTasks(
  context: RequestContext,
  academicYear: number,
  signal?: AbortSignal,
): Promise<TaskInstance[]> {
  return runApiRequest(requestScope(["annual", context.sessionEpoch, context.assignmentId, academicYear]), signal, async (requestSignal) => {
    const api = await getFrontendApiService();
    const annual = await api.getAnnualMap(context, {
      filter: { academicYear: String(academicYear) },
      signal: requestSignal,
    });
    return annual.items.map((task) => ({
      ...adaptTask(task, context),
      timelineMonthStart: task.monthStart,
      timelineMonthEnd: task.monthEnd,
    }));
  });
}

export async function getTaskDetail(context: RequestContext, taskId: string, signal?: AbortSignal): Promise<TaskDetail | null> {
  try {
    return await runApiRequest(requestScope(["task", context.sessionEpoch, context.assignmentId, taskId]), signal, async (requestSignal) => {
      const api = await getFrontendApiService();
      return adaptTaskDetail(await api.getTaskDetail(context, taskId, { signal: requestSignal }), context);
    });
  } catch (error) {
    if (error instanceof Error && "status" in error && Number((error as Error & { status?: unknown }).status) === 404) return null;
    throw error;
  }
}

export async function createTask(
  context: RequestContext,
  input: { title: string; startDate?: string; dueDate?: string; category?: string; memo?: string },
  signal?: AbortSignal,
): Promise<TaskInstance> {
  return runApiRequest(requestScope(["task-create", context.sessionEpoch, context.assignmentId]), signal, async (requestSignal) => {
    const api = await getFrontendApiService();
    const task = await api.createTask(context, {
      ...input,
      idempotencyKey: createIdempotencyKey("task-create"),
      signal: requestSignal,
    });
    return adaptTask(task, context);
  });
}
