/** Server-shaped active Assignment context and cache/request isolation boundary. */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExecutionBoundary, RequestContext, UserSummaryVM } from "@/api/ui-api-boundary-v2";
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
  status: "loading" | "switching" | "ready" | "error";
  errorMessage: string | null;
}

const AssignmentContext = createContext<AssignmentContextValue | null>(null);

export function AssignmentProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const query = useQuery({ queryKey: qk.session(), queryFn: ({ signal }) => getAssignments(signal) });

  const setActiveAssignmentId = useCallback(async (id: string) => {
    const current = queryClient.getQueryData<Awaited<ReturnType<typeof getAssignments>>>(qk.session());
    if (!current || current.session.activeAssignmentId === id) return;
    setSwitching(true);
    setSwitchError(null);
    cancelAllApiRequests();
    await queryClient.cancelQueries();
    queryClient.removeQueries({ predicate: (candidate) => candidate.queryKey[0] === "principal" });
    try {
      const next = await switchActiveAssignment(id, current.session.version);
      queryClient.setQueryData(qk.session(), next);
    } catch (error) {
      setSwitchError(getSafeErrorMessage(error));
      throw error;
    } finally {
      setSwitching(false);
    }
  }, [queryClient]);

  const value = useMemo<AssignmentContextValue>(() => {
    const data = query.data;
    const items = data?.items ?? [];
    const activeId = data?.session.activeAssignmentId ?? null;
    const status = switching ? "switching" : query.isPending ? "loading" : query.isError || switchError ? "error" : "ready";
    return {
      school: data?.school ?? null,
      user: data?.session.user ?? null,
      boundary: data?.session.boundary ?? null,
      context: switching ? null : data?.session.context ?? null,
      assignments: items,
      activeAssignmentId: switching ? null : activeId,
      activeAssignment: switching ? null : items.find((assignment) => assignment.id === activeId) ?? null,
      setActiveAssignmentId,
      status,
      errorMessage: switchError ?? (query.isError ? getSafeErrorMessage(query.error) : null),
    };
  }, [query.data, query.error, query.isError, query.isPending, setActiveAssignmentId, switchError, switching]);

  return <AssignmentContext.Provider value={value}>{children}</AssignmentContext.Provider>;
}

export function useAssignment(): AssignmentContextValue {
  const ctx = useContext(AssignmentContext);
  if (!ctx) throw new Error("useAssignment must be used within AssignmentProvider");
  return ctx;
}
