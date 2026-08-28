/**
 * Query-key factory.
 * Every user-scoped key carries user, school, assignment and session epoch so a
 * context switch cannot reuse another principal's cached response.
 */

function normalizedEntries(value) {
  return Object.entries(value ?? {})
    .filter(([, item]) => item !== undefined && item !== null && item !== "")
    .sort(([left], [right]) => left.localeCompare(right));
}

function stableParams(value) {
  return normalizedEntries(value).map(([key, item]) => [
    key,
    typeof item === "object" && !Array.isArray(item) ? stableParams(item) : item,
  ]);
}

export function contextScope(context) {
  if (!context?.userId || !context?.schoolId || !context?.assignmentId || !context?.sessionEpoch) {
    throw new TypeError("Complete user/school/assignment/session context is required");
  }
  return Object.freeze([
    "principal",
    context.userId,
    "school",
    context.schoolId,
    "assignment",
    context.assignmentId,
    "epoch",
    context.sessionEpoch,
  ]);
}

export function queryKey(context, resource, params = {}) {
  if (typeof resource !== "string" || resource.length === 0) throw new TypeError("resource is required");
  return Object.freeze([...contextScope(context), resource, stableParams(params)]);
}

export const apiKeys = Object.freeze({
  home: (context) => queryKey(context, "home"),
  annual: (context, params) => queryKey(context, "annual", params),
  task: (context, taskId) => queryKey(context, "task", { taskId }),
  documents: (context, params) => queryKey(context, "documents", params),
  search: (context, params) => queryKey(context, "search", params),
  notes: (context, params) => queryKey(context, "experience-notes", params),
  handover: (context, academicYear) => queryKey(context, "handover", { academicYear }),
  notifications: (context, params) => queryKey(context, "notifications", params),
  analysis: (context, jobId) => queryKey(context, "analysis", { jobId }),
});
