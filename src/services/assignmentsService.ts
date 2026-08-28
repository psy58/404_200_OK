import { adaptAssignment } from "@/domain/adapters";
import { RawAssignmentSchema, RawAssignmentsResponseSchema } from "@/domain/raw-schemas";
import type { Assignment, School } from "@/domain/types";
import { fetchMock, postApi } from "./mockClient";

export interface AssignmentsResult {
  school: School;
  items: Assignment[];
}

export async function getAssignments(signal?: AbortSignal): Promise<AssignmentsResult> {
  const raw = await fetchMock("/mocks/backend/assignments.json", RawAssignmentsResponseSchema, { signal });
  return {
    school: { id: raw.school.id, name: raw.school.name, academicYear: raw.school.academic_year },
    items: raw.items.map(adaptAssignment),
  };
}

/** 담당 업무(분장) 직접 추가 — 백엔드 data/user_state.json 에 남는다. */
export async function createAssignment(input: {
  name: string;
  activeFrom?: string;
  note?: string;
}): Promise<Assignment> {
  const raw = await postApi(
    "/api/frontend/assignments",
    { name: input.name, active_from: input.activeFrom || null, note: input.note || null },
    RawAssignmentSchema,
  );
  return adaptAssignment(raw);
}
