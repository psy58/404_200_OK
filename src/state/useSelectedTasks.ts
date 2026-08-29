import { useQueries } from "@tanstack/react-query";
import { getTasks } from "@/services/tasksService";
import type { TaskInstance } from "@/domain/types";
import { useAssignment } from "./AssignmentContext";
import { qk } from "./queryKeys";

export interface SelectedTasksResult {
  /** 선택한 담당 업무 전체의 업무를 합친 목록 (선택 순서대로). */
  tasks: TaskInstance[];
  /** 하나라도 아직 불러오는 중이면 true. */
  isPending: boolean;
  /** 실패한 담당 업무 요청의 오류 (없으면 null). */
  error: Error | null;
  /** 실패한 요청을 다시 시도한다. */
  refetch: () => void;
}

type QueryResultLike = { data?: TaskInstance[]; isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };

// useQueries 의 combine 은 함수 참조가 안정적일 때만 결과를 메모하므로 모듈 스코프에 둔다.
function combine(results: QueryResultLike[]): SelectedTasksResult {
  const failed = results.find((result) => result.isError);
  return {
    tasks: results.flatMap((result) => result.data ?? []),
    isPending: results.some((result) => result.isPending),
    error: failed ? (failed.error as Error) : null,
    refetch: () => results.filter((result) => result.isError).forEach((result) => result.refetch()),
  };
}

/**
 * 선택된 담당 업무(AssignmentContext.selectedAssignmentIds)에 속한 업무 목록의
 * 단일 진입점. 담당 업무 모달에서 선택을 바꾸면 이 훅을 쓰는 모든 화면이 함께 갱신된다.
 *
 * 담당 업무별 요청은 qk.tasks(assignmentId) 키로 react-query 캐시를 공유하므로
 * 여러 화면이 동시에 써도 담당 업무 하나당 한 번만 받아온다.
 */
export function useSelectedTasks(): SelectedTasksResult {
  const { selectedAssignmentIds } = useAssignment();
  return useQueries({
    queries: selectedAssignmentIds.map((assignmentId) => ({
      queryKey: qk.tasks(assignmentId),
      queryFn: ({ signal }: { signal: AbortSignal }) => getTasks(assignmentId, signal),
    })),
    combine,
  });
}
