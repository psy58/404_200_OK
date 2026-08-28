import type { UiIssue } from "@/api/ui-api-boundary-v2";

interface ApiLikeError extends Error { readonly issue?: UiIssue }

export function getUiIssue(error: unknown): UiIssue | undefined {
  return error instanceof Error ? (error as ApiLikeError).issue : undefined;
}

export function getSafeErrorMessage(error: unknown): string {
  const issue = getUiIssue(error);
  if (issue) return issue.userMessage;
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}
