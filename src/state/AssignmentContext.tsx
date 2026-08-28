/** Server-shaped active Assignment context and cache/request isolation boundary. */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExecutionBoundary, RequestContext, UserSummaryVM } from "@/api/ui-api-boundary-v2";
import { createMutationContextGuard } from "@/api/mutation-context.js";
import type { MutationContextToken } from "@/api/mutation-context.js";
import { getAssignments, switchActiveAssignment } from "@/services/assignmentsService";
import { cancelAllApiRequests } from "@/services/requestExecution";
import { getSafeErrorMessage } from "@/services/errorPresentation";
import { qk } from "./queryKeys";
import type { Assignment, School } from "@/domain/types";

interface AssignmentContextValue {
  school: School | null;
  user: UserSummaryVM | null;
  boundary: ExecutionBoundary | null;
  context: RequestContext | null;
  assignments: Assignment[];
  activeAssignmentId: string | null;
  activeAssignment: Assignment | null;
  setActiveAssignmentId: (id: string) => Promise<void>;
  captureMutationContext: (context: RequestContext, scope: readonly (string | number)[]) => MutationContextToken;
  isMutationContextCurrent: (token: MutationContextToken | undefined) => boolean;
  status: "loading" | "switching" | "ready" | "error";
  errorMessage: string | null;
}

const AssignmentContext = createContext<AssignmentContextValue | null>(null);

export function AssignmentProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const mutationGuardRef = useRef(createMutationContextGuard());
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const query = useQuery({ queryKey: qk.session(), queryFn: ({ signal }) => getAssignments(signal) });

  const setActiveAssignmentId = useCallback(async (id: string) => {
    const current = queryClient.getQueryData<Awaited<ReturnType<typeof getAssignments>>>(qk.session());
    if (!current || current.session.activeAssignmentId === id) return;
    // Invalidate mutation callbacks synchronously before any old request/cache
    // can settle during the Assignment transition.
    mutationGuardRef.current.invalidate();
    setSwitching(true);
    setSwitchError(null);
    cancelAllApiRequests();
    await queryClient.cancelQueries();
    queryClient.removeQueries({ predicate: (candidate) => candidate.queryKey[0] === "principal" });
    try {
      const next = await switchActiveAssignment(id, current.session.version);
      queryClient.setQueryData(qk.session(), next);
      mutationGuardRef.current.bind(next.session.context);
    } catch (error) {
      setSwitchError(getSafeErrorMessage(error));
      throw error;
    } finally {
      setSwitching(false);
    }
  }, [queryClient]);

  const captureMutationContext = useCallback((context: RequestContext, scope: readonly (string | number)[]) => (
    mutationGuardRef.current.capture(context, scope)
  ), []);
  const isMutationContextCurrent = useCallback((token: MutationContextToken | undefined) => (
    mutationGuardRef.current.isCurrent(token)
  ), []);

  const data = query.data;
  const status = switching ? "switching" : query.isPending ? "loading" : query.isError || switchError ? "error" : "ready";
  const activeContext = status === "ready" ? data?.session.context ?? null : null;
  mutationGuardRef.current.bind(activeContext);

  const value = useMemo<AssignmentContextValue>(() => {
    const items = data?.items ?? [];
    const activeId = data?.session.activeAssignmentId ?? null;
    return {
      school: data?.school ?? null,
      user: data?.session.user ?? null,
      boundary: data?.session.boundary ?? null,
      context: activeContext,
      assignments: items,
      activeAssignmentId: status === "ready" ? activeId : null,
      activeAssignment: status === "ready" ? items.find((assignment) => assignment.id === activeId) ?? null : null,
      setActiveAssignmentId,
      captureMutationContext,
      isMutationContextCurrent,
      status,
      errorMessage: switchError ?? (query.isError ? getSafeErrorMessage(query.error) : null),
    };
  }, [activeContext, captureMutationContext, data, isMutationContextCurrent, query.error, query.isError, setActiveAssignmentId, status, switchError]);

  return <AssignmentContext.Provider value={value}>{children}</AssignmentContext.Provider>;
}

export function useAssignment(): AssignmentContextValue {
  const ctx = useContext(AssignmentContext);
  if (!ctx) throw new Error("useAssignment must be used within AssignmentProvider");
  return ctx;
}
