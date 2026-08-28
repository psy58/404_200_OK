import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createMemoryFixtureLoader, createMockApi, MockApiError } from "../../src/api/mock-service.js";

const names = [
  "contract.json",
  "home.json",
  "task-detail.student-competition.json",
  "search-results.json",
  "problems.json",
];

async function fixtures() {
  return Object.fromEntries(await Promise.all(names.map(async (name) => [
    name,
    JSON.parse(await readFile(new URL(`../../mocks/backend/${name}`, import.meta.url), "utf8")),
  ])));
}

async function service(options = {}) {
  return createMockApi({ fixtureLoader: createMemoryFixtureLoader(await fixtures()), ...options });
}

test("mock service exposes explicit session-only boundary", async () => {
  const api = await service();
  const session = await api.getSession();
  assert.equal(api.contractStatus, "MOCK_ONLY");
  assert.equal(session.boundary.persistence, "session-only");
  assert.match(session.boundary.label, /서버 저장 없음/);
  assert.deepEqual(session.context, api.getActiveContext());
});

test("cross-fixture authorization context mismatch fails during startup", async () => {
  const values = await fixtures();
  values["search-results.json"].context.school_id = "sch-other";
  await assert.rejects(
    createMockApi({ fixtureLoader: createMemoryFixtureLoader(values) }),
    /search fixture context must match contract fixture context/,
  );
});

test("mock and real service contract capabilities are all explicit", async () => {
  const api = await service();
  const capabilities = [
    "getSession", "setActiveAssignment", "getHome", "getAnnualMap", "getTaskDetail", "updateChecklist",
    "listDocuments", "search", "listExperienceNotes", "createExperienceNote", "updateExperienceNote",
    "deleteExperienceNote", "getHandoverPreview", "prepareUpload", "transferUploadFile", "createAnalysisJob",
    "getAnalysisJob", "cancelAnalysisJob", "retryAnalysisItem", "reviewAnalysisDraft", "deleteAnalysisItem",
    "getNotifications", "markNotificationRead", "markAllNotificationsRead", "queryAssistant", "logout",
  ];
  for (const capability of capabilities) assert.equal(typeof api[capability], "function", capability);
});

test("home response is adapted and scoped to active assignment", async () => {
  const api = await service();
  const home = await api.getHome(api.getActiveContext());
  assert.equal(home.status, "ready");
  assert.equal(home.primaryTask.id, "task-info-disclosure");
  assert.equal(home.primaryTask.dates.officialDue, "2026-08-31");
});

test("annual map honors academic year and presentation filters", async () => {
  const api = await service();
  const context = api.getActiveContext();
  const annual = await api.getAnnualMap(context, { filter: { academicYear: "2026" } });
  assert.equal(annual.status, "ready");
  assert.equal(annual.academicYear, 2026);
  assert.deepEqual(annual.items.map((item) => item.id), ["task-info-disclosure", "task-ai-week", "task-device-audit"]);
  assert.equal(annual.items[0].nextTaskId, "task-ai-week");
  assert.equal(annual.items.at(-1).previousTaskId, "task-ai-week");

  const preparing = await api.getAnnualMap(context, { filter: { academicYear: "2026", status: "preparing" } });
  assert.deepEqual(preparing.items.map((item) => item.id), ["task-device-audit"]);

  const previousYear = await api.getAnnualMap(context, { filter: { academicYear: "2025" } });
  assert.equal(previousYear.status, "empty");
  assert.equal(previousYear.academicYear, 2025);
  assert.deepEqual(previousYear.items, []);
});

test("annual map rejects invalid academic-year input", async () => {
  const api = await service();
  await assert.rejects(
    api.getAnnualMap(api.getActiveContext(), { filter: { academicYear: "not-a-year" } }),
    (error) => error instanceof MockApiError && error.status === 422,
  );
});

test("document list derives only document-backed evidence and applies filters", async () => {
  const api = await service();
  const context = api.getActiveContext();
  const all = await api.listDocuments(context);
  assert.equal(all.status, "ready");
  assert.equal(all.total, 3);
  assert.equal(all.items.every((item) => item.source !== "experience"), true);

  const schoolCase = await api.listDocuments(context, { filter: { source: "school-case", academicYear: "2025" } });
  assert.deepEqual(schoolCase.items.map((item) => item.id), ["document-school-plan-2025"]);

  const noResult = await api.listDocuments(context, { query: "존재하지않는공문" });
  assert.equal(noResult.status, "no-result");
  assert.equal(noResult.total, 0);
});

test("different-school context is rejected", async () => {
  const api = await service();
  await assert.rejects(
    api.getHome({ ...api.getActiveContext(), schoolId: "sch-other" }),
    (error) => error instanceof MockApiError && error.status === 403,
  );
});

test("unknown Assignment selection is rejected without changing the session", async () => {
  const api = await service();
  await assert.rejects(
    api.setActiveAssignment("asg-unknown", { expectedVersion: 1, idempotencyKey: "assignment-unknown" }),
    (error) => error instanceof MockApiError && error.status === 403,
  );
  assert.equal((await api.getSession()).activeAssignmentId, "asg-science");
});

test("stale checklist version returns 412", async () => {
  const api = await service();
  await assert.rejects(api.updateChecklist(api.getActiveContext(), {
    taskId: "task-ai-week",
    itemId: "check-budget",
    complete: true,
    expectedVersion: 6,
    idempotencyKey: "mutation-stale",
  }), (error) => error instanceof MockApiError && error.status === 412);
});

test("checklist mutation increments version and preserves a coherent count", async () => {
  const api = await service();
  const result = await api.updateChecklist(api.getActiveContext(), {
    taskId: "task-ai-week",
    itemId: "check-budget",
    complete: true,
    expectedVersion: 7,
    idempotencyKey: "mutation-check-budget",
  });
  assert.equal(result.task.version, 8);
  assert.equal(result.task.checklistDone, 4);
  assert.equal(result.checklist.find((item) => item.id === "check-budget").complete, true);
});

test("unknown checklist item returns 404 without changing task version", async () => {
  const api = await service();
  const context = api.getActiveContext();
  await assert.rejects(api.updateChecklist(context, {
    taskId: "task-ai-week",
    itemId: "check-missing",
    complete: true,
    expectedVersion: 7,
    idempotencyKey: "mutation-missing-item",
  }), (error) => error instanceof MockApiError && error.status === 404);
  assert.equal((await api.getTaskDetail(context, "task-ai-week")).task.version, 7);
});

test("idempotency key prevents duplicate checklist application", async () => {
  const api = await service();
  const mutation = {
    taskId: "task-ai-week",
    itemId: "check-budget",
    complete: true,
    expectedVersion: 7,
    idempotencyKey: "mutation-same-key",
  };
  const first = await api.updateChecklist(api.getActiveContext(), mutation);
  const second = await api.updateChecklist(api.getActiveContext(), mutation);
  assert.equal(first.task.version, 8);
  assert.equal(second.task.version, 8);
});

test("reusing an idempotency key with a different payload returns 409", async () => {
  const api = await service();
  const mutation = {
    taskId: "task-ai-week",
    itemId: "check-budget",
    complete: true,
    expectedVersion: 7,
    idempotencyKey: "mutation-reused-key",
  };
  await api.updateChecklist(api.getActiveContext(), mutation);
  await assert.rejects(
    api.updateChecklist(api.getActiveContext(), { ...mutation, itemId: "check-draft" }),
    (error) => error instanceof MockApiError && error.status === 409,
  );
});

test("switching assignment isolates prior task data", async () => {
  const api = await service();
  const session = await api.getSession();
  await api.setActiveAssignment("asg-gifted", {
    expectedVersion: 1,
    idempotencyKey: "assignment-gifted",
  });
  const context = { ...api.getActiveContext() };
  const home = await api.getHome(context);
  assert.equal(home.status, "empty");
  assert.notEqual(context.assignmentId, session.activeAssignmentId);
  await assert.rejects(
    api.getTaskDetail(context, "task-ai-week"),
    (error) => error instanceof MockApiError && error.status === 404,
  );
  const search = await api.search(context, { query: "AI" });
  assert.equal(search.total, 0);
});

test("experience notes support search and filters", async () => {
  const api = await service();
  const result = await api.listExperienceNotes(api.getActiveContext(), {
    query: "강사",
    filter: { academicYear: "2025", approval: "approved" },
  });
  assert.equal(result.status, "ready");
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, "note-instructor");
});

test("experience note creation validates fields and is versioned", async () => {
  const api = await service();
  const context = api.getActiveContext();
  const result = await api.createExperienceNote(context, {
    taskId: "task-ai-week",
    academicYear: 2026,
    text: "  결재 전에 관리자 일정을 다시 확인  ",
    visibility: "handover",
    expectedVersion: 7,
    idempotencyKey: "note-create-1",
  });
  const created = result.items.find((note) => note.id.startsWith("note-session-"));
  assert.equal(created.text, "결재 전에 관리자 일정을 다시 확인");
  assert.equal(created.academicYear, 2026);
  assert.equal(created.visibility, "handover");
  assert.equal(created.approval, "draft");
  assert.equal((await api.getTaskDetail(context, "task-ai-week")).task.version, 8);
});

test("invalid experience-note year and visibility fail without state mutation", async () => {
  const api = await service();
  const context = api.getActiveContext();
  const base = {
    taskId: "task-ai-week",
    text: "검증되지 않은 메모",
    expectedVersion: 7,
  };
  await assert.rejects(api.createExperienceNote(context, {
    ...base,
    academicYear: 1999,
    visibility: "handover",
    idempotencyKey: "note-invalid-year",
  }), (error) => error instanceof MockApiError && error.status === 422);
  await assert.rejects(api.createExperienceNote(context, {
    ...base,
    academicYear: 2026,
    visibility: "public",
    idempotencyKey: "note-invalid-visibility",
  }), (error) => error instanceof MockApiError && error.status === 422);
  const detail = await api.getTaskDetail(context, "task-ai-week");
  assert.equal(detail.task.version, 7);
  assert.equal(detail.experienceNotes.length, 2);
});

test("handover preview includes only approved non-private notes from the requested year", async () => {
  const api = await service();
  const context = api.getActiveContext();
  const previous = await api.getHandoverPreview(context, 2025);
  assert.deepEqual(previous.notes.map((note) => note.id), ["note-instructor"]);
  assert.equal(previous.notes.every((note) => note.approval === "approved" && note.visibility !== "private"), true);

  const current = await api.getHandoverPreview(context, 2026);
  assert.deepEqual(current.notes, []);
});

test("experience note update is versioned and idempotent", async () => {
  const api = await service();
  const mutation = {
    taskId: "task-ai-week",
    noteId: "note-instructor",
    text: "강사 섭외는 7월 마지막 주부터 시작",
    visibility: "handover",
    expectedVersion: 3,
    idempotencyKey: "note-update-1",
  };
  const first = await api.updateExperienceNote(api.getActiveContext(), mutation);
  const second = await api.updateExperienceNote(api.getActiveContext(), mutation);
  assert.equal(first.items.find((note) => note.id === mutation.noteId).version, 4);
  assert.deepEqual(second, first);
});

test("stale experience note update preserves the current note", async () => {
  const api = await service();
  await assert.rejects(api.updateExperienceNote(api.getActiveContext(), {
    taskId: "task-ai-week",
    noteId: "note-instructor",
    text: "충돌하는 수정",
    visibility: "handover",
    expectedVersion: 2,
    idempotencyKey: "note-stale-1",
  }), (error) => error instanceof MockApiError && error.status === 412);
  const result = await api.listExperienceNotes(api.getActiveContext());
  assert.equal(result.items.find((note) => note.id === "note-instructor").version, 3);
});

test("experience note deletion requires the current note version", async () => {
  const api = await service();
  const result = await api.deleteExperienceNote(api.getActiveContext(), {
    taskId: "task-ai-week",
    noteId: "note-instructor",
    expectedVersion: 3,
    idempotencyKey: "note-delete-1",
  });
  assert.equal(result.items.some((note) => note.id === "note-instructor"), false);
});

test("abort signal cancels a pending mock request", async () => {
  const api = await service({ latencyMs: 40 });
  const controller = new AbortController();
  const pending = api.getHome(api.getActiveContext(), { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
});

test("search returns no-result for unmatched terms", async () => {
  const api = await service();
  const result = await api.search(api.getActiveContext(), { query: "존재하지않는검색어" });
  assert.equal(result.status, "no-result");
  assert.equal(result.total, 0);
});

test("search applies result type and evidence-source filters", async () => {
  const api = await service();
  const context = api.getActiveContext();
  const officialDocument = await api.search(context, { filter: { type: "document", source: "official" } });
  assert.deepEqual(officialDocument.items.map((item) => item.id), ["result-document-ai-week-letter"]);
  const experience = await api.search(context, { filter: { type: "experience" } });
  assert.deepEqual(experience.items.map((item) => item.id), ["result-note-instructor"]);
});

test("P1 notifications remain disabled without a backend contract", async () => {
  const api = await service();
  const result = await api.getNotifications(api.getActiveContext());
  assert.equal(result.status, "disabled");
  assert.equal(result.unread, 0);
  assert.equal(result.issue.code, "BACKEND_REQUIRED");
});

test("file analysis remains disabled without quarantine and job contracts", async () => {
  const api = await service();
  const result = await api.getAnalysisJob(api.getActiveContext(), "job-demo");
  assert.equal(result.status, "disabled");
  assert.equal(result.issue.code, "BACKEND_REQUIRED");
  const prepare = await api.prepareUpload(api.getActiveContext(), { idempotencyKey: "prepare-disabled", files: [] });
  assert.equal(prepare.status, "disabled");
  const assistant = await api.queryAssistant(api.getActiveContext(), {
    taskId: "task-ai-week",
    question: "다음 할 일은?",
    idempotencyKey: "assistant-disabled",
  });
  assert.equal(assistant.status, "disabled");
  assert.equal(assistant.grounding, "unsupported");
});

test("mock logout invalidates the session instead of retaining prior data", async () => {
  const api = await service();
  const context = api.getActiveContext();
  await api.logout();
  await assert.rejects(
    api.getSession(),
    (error) => error instanceof MockApiError && error.status === 401 && error.issue.recoveryAction === "reauthenticate",
  );
  await assert.rejects(
    api.getHome(context),
    (error) => error instanceof MockApiError && error.status === 401,
  );
  await assert.rejects(
    api.setActiveAssignment("asg-gifted", { expectedVersion: 1, idempotencyKey: "assignment-after-logout" }),
    (error) => error instanceof MockApiError && error.status === 401,
  );
});
