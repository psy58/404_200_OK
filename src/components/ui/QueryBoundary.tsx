import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { RecoveryAction, UiIssue, ViewStatus } from "@/api/ui-api-boundary-v2";
import { LoadingBlock, EmptyState, IssueState } from "./States";
import { getIssueViewStatus, getUiIssue } from "@/services/errorPresentation";

interface QueryBoundaryProps<T> {
  query: UseQueryResult<T>;
  /** Return true when a successfully-loaded value should render as the empty state. */
  isEmpty?: (data: T) => boolean;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  noResultTitle?: ReactNode;
  status?: ViewStatus;
  issue?: UiIssue;
  onRecovery?: (action: RecoveryAction) => void;
  children: (data: T) => ReactNode;
}

/**
 * Renders the complete UI_API_BOUNDARY_V2 state vocabulary. Successful stale
 * or partial data remains visible below a warning; failures preserve recovery,
 * field-error, support-ID and retry-after semantics.
 */
export function QueryBoundary<T>({
  query,
  isEmpty,
  emptyTitle,
  emptyDescription,
  noResultTitle,
  status,
  issue,
  onRecovery,
  children,
}: QueryBoundaryProps<T>) {
  if (query.isPending) return <LoadingBlock />;
  if (query.isError) {
    const queryIssue = getUiIssue(query.error);
    const queryStatus = getIssueViewStatus(queryIssue, query.error);
    const action = queryIssue?.recoveryAction;
    const canRefetch = action === "retry" || action === "reload-latest";
    return <IssueState status={queryStatus} issue={queryIssue} onRecover={onRecovery ?? (canRefetch ? () => { void query.refetch(); } : undefined)} />;
  }

  const dataMeta = query.data && typeof query.data === "object" && !Array.isArray(query.data)
    ? query.data as { status?: ViewStatus; issue?: UiIssue }
    : undefined;
  const viewStatus = status ?? dataMeta?.status ?? "ready";
  const viewIssue = issue ?? dataMeta?.issue;

  if (viewStatus === "loading") return <LoadingBlock />;
  if (viewStatus === "idle") return <IssueState status="idle" issue={viewIssue} />;
  if (viewStatus === "empty") return <EmptyState title={emptyTitle ?? "표시할 내용이 없습니다"} description={emptyDescription} />;
  if (viewStatus === "no-result") return <EmptyState title={noResultTitle ?? emptyTitle ?? "검색 결과가 없습니다"} description={emptyDescription} />;
  if (["unauthorized", "forbidden", "not-found", "conflict", "validation-error", "rate-limited", "server-error", "offline", "disabled"].includes(viewStatus)) {
    const action = viewIssue?.recoveryAction;
    const canRefetch = action === "retry" || action === "reload-latest";
    return <IssueState status={viewStatus} issue={viewIssue} onRecover={onRecovery ?? (canRefetch ? () => { void query.refetch(); } : undefined)} />;
  }
  if (viewStatus === "partial" || viewStatus === "stale") {
    return <div className="stack query-state-stack"><IssueState status={viewStatus} issue={viewIssue} onRecover={onRecovery} />{children(query.data)}</div>;
  }
  if (isEmpty?.(query.data)) {
    return <EmptyState title={emptyTitle ?? "표시할 내용이 없습니다"} description={emptyDescription} />;
  }
  return <>{children(query.data)}</>;
}
