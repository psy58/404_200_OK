/**
 * MOCK_ONLY mutation used to exercise the optimistic-update / rollback UX
 * required by docs/01 §13 REL01-REL02 even though there is no server yet.
 * A small deterministic-looking failure rate lets TaskDetailPage demonstrate
 * the rollback path instead of only the happy path.
 */
export class ChecklistSaveIssue extends Error {}

let attempt = 0;

export async function toggleChecklistItemMockOnly(): Promise<{ ok: true }> {
  attempt += 1;
  await new Promise((r) => setTimeout(r, 260));
  // Fails roughly one in six saves so the UI's failure/rollback path is reachable in a demo.
  if (attempt % 6 === 0) {
    throw new ChecklistSaveIssue("저장에 실패했습니다");
  }
  return { ok: true };
}
