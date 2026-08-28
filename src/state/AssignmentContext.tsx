/**
 * Current-assignment context (F01). Selecting an assignment changes working
 * context only — it is never treated as an authorization grant. The list of
 * selectable assignments always comes from the server-shaped mock endpoint;
 * this context never invents an assignment id itself.
 *
 * Persistence: BACKEND_CONTRACT_REQUIRED. Per docs/01 §11 F01, the active
 * Assignment should survive a revisit via a server-confirmed value; this
 * mock keeps it in memory only for the current tab session.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAssignments } from "@/services/assignmentsService";
import { qk } from "./queryKeys";
import type { Assignment, School } from "@/domain/types";

interface AssignmentContextValue {
  school: School | null;
  assignments: Assignment[];
  activeAssignmentId: string | null;
  activeAssignment: Assignment | null;
  setActiveAssignmentId: (id: string) => void;
  status: "loading" | "ready" | "error";
}

const AssignmentContext = createContext<AssignmentContextValue | null>(null);

export function AssignmentProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: qk.assignments(),
    queryFn: ({ signal }) => getAssignments(signal),
  });
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);

  const effectiveActiveId = activeAssignmentId ?? query.data?.items[0]?.id ?? null;

  const value = useMemo<AssignmentContextValue>(() => {
    const items = query.data?.items ?? [];
    return {
      school: query.data?.school ?? null,
      assignments: items,
      activeAssignmentId: effectiveActiveId,
      activeAssignment: items.find((a) => a.id === effectiveActiveId) ?? null,
      setActiveAssignmentId,
      status: query.isPending ? "loading" : query.isError ? "error" : "ready",
    };
  }, [query.data, query.isPending, query.isError, effectiveActiveId]);

  return <AssignmentContext.Provider value={value}>{children}</AssignmentContext.Provider>;
}

export function useAssignment(): AssignmentContextValue {
  const ctx = useContext(AssignmentContext);
  if (!ctx) throw new Error("useAssignment must be used within AssignmentProvider");
  return ctx;
}
