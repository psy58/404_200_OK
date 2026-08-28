/**
 * Central query-key factory. Every key that depends on the current user's
 * context includes assignmentId so switching Assignment invalidates and
 * isolates cache instead of leaking another task list into view — see
 * docs/03 §12.1 (cache isolation) and §12.2 (stale-response race control).
 */
export const qk = {
  assignments: () => ["assignments"] as const,
  tasks: (assignmentId: string) => ["tasks", assignmentId] as const,
  taskDetail: (taskId: string) => ["task-detail", taskId] as const,
  documents: () => ["documents"] as const,
  notes: () => ["experience-notes"] as const,
  notifications: () => ["notifications"] as const,
  feed: () => ["feed"] as const,
};
