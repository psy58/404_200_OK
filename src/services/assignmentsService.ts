import type { SessionContextVM } from "@/api/ui-api-boundary-v2";
import { adaptAssignment, adaptSchool } from "@/domain/adapters";
import type { Assignment, School } from "@/domain/types";
import { getFrontendApiService } from "./apiClient";
import { createIdempotencyKey, runApiRequest } from "./requestExecution";

export interface AssignmentsResult { session: SessionContextVM; school: School; items: Assignment[] }

function adaptResult(session: SessionContextVM): AssignmentsResult {
  return { session, school: adaptSchool(session.school), items: session.assignments.map(adaptAssignment) };
}

export async function getAssignments(signal?: AbortSignal): Promise<AssignmentsResult> {
  return runApiRequest("session", signal, async (requestSignal) => {
    const api = await getFrontendApiService();
    return adaptResult(await api.getSession({ signal: requestSignal }));
  });
}

export async function switchActiveAssignment(assignmentId: string, expectedVersion: number, signal?: AbortSignal): Promise<AssignmentsResult> {
  return runApiRequest("session-switch", signal, async (requestSignal) => {
    const api = await getFrontendApiService();
    const session = await api.setActiveAssignment(assignmentId, {
      expectedVersion,
      idempotencyKey: createIdempotencyKey("assignment-switch"),
      signal: requestSignal,
    });
    return adaptResult(session);
  });
}
