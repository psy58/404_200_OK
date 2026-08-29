import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAssignments } from "@/services/assignmentsService";
import { qk } from "./queryKeys";
import type { Assignment, School } from "@/domain/types";
import { HAKMATONG_ID, readCustomDuties, removeCustomDuty } from "./hakmatongDemo";

const SELECTED_DUTY_IDS_KEY = "gam-selected-duty-ids";

interface AssignmentContextValue {
  school: School | null;
  assignments: Assignment[];
  /** 선택한 담당 업무 id (선택 순서). 업무 목록이 필요하면 useSelectedTasks() 를 쓴다. */
  selectedAssignmentIds: string[];
  selectedAssignments: Assignment[];
  setSelectedAssignmentIds: (ids: string[]) => void;
  refreshCustomAssignments: (selectId?: string) => void;
  /** 직접 추가해 이 브라우저에만 있는 담당 업무 id — 삭제 버튼을 보여 줄 대상. */
  customAssignmentIds: string[];
  /** 직접 추가한 담당 업무를 지우고 선택 목록에서도 뺀다. 지웠으면 true. */
  removeCustomAssignment: (id: string) => boolean;
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
  const customDuties = useMemo(() => {
    void customRevision;
    return readCustomDuties();
  }, [customRevision]);
  const assignments = useMemo(() => [...(query.data?.items ?? []).filter((assignment) => !assignment.note?.includes("신규 업무")), ...customDuties], [customDuties, query.data]);

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
      customAssignmentIds: customDuties.map((duty) => duty.id),
      removeCustomAssignment: (id: string) => {
        if (!removeCustomDuty(id)) return false;
        setCustomRevision((revision) => revision + 1);
        setSavedSelectedIds((ids) => ids.filter((selectedId) => selectedId !== id));
        // 이 담당 업무의 업무 목록 캐시도 같이 버린다 (하드코딩 데모 업무가 남지 않게)
        queryClient.removeQueries({ queryKey: qk.tasks(id) });
        return true;
      },
      status: query.isPending ? "loading" : query.isError ? "error" : "ready",
    };
  }, [assignments, customDuties, query.data, query.isError, query.isPending, queryClient, selectedAssignmentIds]);

  return <AssignmentContext.Provider value={value}>{children}</AssignmentContext.Provider>;
}

export function useAssignment(): AssignmentContextValue {
  const ctx = useContext(AssignmentContext);
  if (!ctx) throw new Error("useAssignment must be used within AssignmentProvider");
  return ctx;
}
