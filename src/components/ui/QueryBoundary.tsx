import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { LoadingBlock, ErrorState, EmptyState } from "./States";

interface QueryBoundaryProps<T> {
  query: UseQueryResult<T>;
  /** Return true when a successfully-loaded value should render as the empty state. */
  isEmpty?: (data: T) => boolean;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  children: (data: T) => ReactNode;
}

/**
 * Renders the loading | error | empty | ready ViewStatus states (docs/01 §13)
 * for a single React Query result so every P0 screen implements the same
 * state machine instead of re-deriving it ad hoc.
 */
export function QueryBoundary<T>({ query, isEmpty, emptyTitle, emptyDescription, children }: QueryBoundaryProps<T>) {
  if (query.isPending) return <LoadingBlock />;
  if (query.isError) {
    return <ErrorState description={(query.error as Error)?.message} onRetry={() => query.refetch()} />;
  }
  if (isEmpty?.(query.data)) {
    return <EmptyState title={emptyTitle ?? "표시할 내용이 없습니다"} description={emptyDescription} />;
  }
  return <>{children(query.data)}</>;
}
