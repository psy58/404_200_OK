import { adaptAssignment } from "@/domain/adapters";
import { RawAssignmentsResponseSchema } from "@/domain/raw-schemas";
import type { Assignment, School } from "@/domain/types";
import { fetchMock } from "./mockClient";

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
