import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAssignments } from "@/services/assignmentsService";
import { qk } from "./queryKeys";
import type { Assignment, School } from "@/domain/types";
import { HAKMATONG_ID, readCustomDuties } from "./hakmatongDemo";

const SELECTED_DUTY_IDS_KEY = "gam-selected-duty-ids";

interface AssignmentContextValue {
  school: School | null;
  assignments: Assignment[];
  activeAssignmentId: string | null;
  activeAssignment: Assignment | null;
  selectedAssignmentIds: string[];
  selectedAssignments: Assignment[];
  setSelectedAssignmentIds: (ids: string[]) => void;
  refreshCustomAssignments: (selectId?: string) => void;
  status: "loading" | "ready" | "error";
}

const AssignmentContext = createContext<AssignmentContextValue | null>(null);

function readSelectedIds(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(SELECTED_DUTY_IDS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function AssignmentProvider({ children }: { children: ReactNode }) {
  const query = useQuery({ queryKey: qk.assignments(), queryFn: ({ signal }) => getAssignments(signal) });
  const queryClient = useQueryClient();
  const [savedSelectedIds, setSavedSelectedIds] = useState<string[]>(readSelectedIds);
  const [customRevision, setCustomRevision] = useState(0);
  const assignments = useMemo(() => [...(query.data?.items ?? []).filter((assignment) => !assignment.note?.includes("신규 업무")), ...readCustomDuties()], [customRevision, query.data]);

  const selectedAssignmentIds = useMemo(() => {
    const valid = savedSelectedIds.filter((id) => assignments.some((assignment) => assignment.id === id));
    return valid.length > 0 ? valid : assignments.slice(0, 2).map((assignment) => assignment.id);
  }, [assignments, savedSelectedIds]);

  useEffect(() => {
    if (assignments.length === 0) return;
    localStorage.setItem(SELECTED_DUTY_IDS_KEY, JSON.stringify(selectedAssignmentIds));
  }, [assignments.length, selectedAssignmentIds]);

  const value = useMemo<AssignmentContextValue>(() => {
    const selectedAssignments = assignments.filter((assignment) => selectedAssignmentIds.includes(assignment.id));
    return {
      school: query.data?.school ?? null,
      assignments,
      activeAssignmentId: selectedAssignmentIds[0] ?? null,
      activeAssignment: selectedAssignments[0] ?? null,
      selectedAssignmentIds,
      selectedAssignments,
      setSelectedAssignmentIds: setSavedSelectedIds,
      refreshCustomAssignments: (selectId?: string) => {
        setCustomRevision((revision) => revision + 1);
        // 서버에 추가된 담당 업무(duty_*)도 목록에 바로 반영한다
        queryClient.invalidateQueries({ queryKey: qk.assignments() });
        const target = selectId ?? HAKMATONG_ID;
        setSavedSelectedIds((ids) => (ids.includes(target) ? ids : [...ids, target]));
      },
      status: query.isPending ? "loading" : query.isError ? "error" : "ready",
    };
  }, [assignments, query.data, query.isError, query.isPending, selectedAssignmentIds]);

  return <AssignmentContext.Provider value={value}>{children}</AssignmentContext.Provider>;
}

export function useAssignment(): AssignmentContextValue {
  const ctx = useContext(AssignmentContext);
  if (!ctx) throw new Error("useAssignment must be used within AssignmentProvider");
  return ctx;
}
