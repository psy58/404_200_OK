import type { AsyncActionStatus, UiIssue, ViewStatus } from "@/api/ui-api-boundary-v2";

interface ApiLikeError extends Error { readonly issue?: UiIssue }

export function getUiIssue(error: unknown): UiIssue | undefined {
  return error instanceof Error ? (error as ApiLikeError).issue : undefined;
}

function numericStatus(error: unknown): number | undefined {
  if (!(error instanceof Error) || !("status" in error)) return undefined;
  const status = Number((error as Error & { status?: unknown }).status);
  return Number.isInteger(status) ? status : undefined;
}

/** Converts a safe UiIssue into the full V2 screen-state vocabulary. */
export function getIssueViewStatus(issue: UiIssue | undefined, error?: unknown): ViewStatus {
  const status = numericStatus(error);
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 409 || status === 412) return "conflict";
  if (status === 422) return "validation-error";
  if (status === 429) return "rate-limited";

  const code = issue?.code.toUpperCase() ?? "";
  if (code.includes("OFFLINE") || code.includes("TIMEOUT")) return "offline";
  if (code.includes("VALIDATION")) return "validation-error";
  if (code.includes("RATE") || issue?.retryAfter) return "rate-limited";
  if (issue?.recoveryAction === "reauthenticate") return "unauthorized";
  if (issue?.recoveryAction === "request-access") return "forbidden";
  if (issue?.recoveryAction === "go-to-list") return "not-found";
  if (issue?.recoveryAction === "reload-latest" || issue?.recoveryAction === "reapply") return "conflict";
  return "server-error";
}

export function getAsyncActionStatus(state: {
  isPending?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  error?: unknown;
}): AsyncActionStatus {
  if (state.isPending) return "submitting";
  if (state.isError) return getIssueViewStatus(getUiIssue(state.error), state.error) === "conflict" ? "conflict" : "error";
  if (state.isSuccess) return "success";
  return "idle";
}

export function getSafeErrorMessage(error: unknown): string {
  const issue = getUiIssue(error);
  if (issue) return issue.userMessage;
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
