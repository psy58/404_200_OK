import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { createServer } from "vite";

import { apiKeys } from "../../src/api/cache-keys.js";
import { createMutationContextGuard } from "../../src/api/mutation-context.js";
import { requestScope } from "../../src/api/request-scope.js";

let vite;

before(async () => {
  vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
});

after(async () => {
  await vite?.close();
});

function queryResult(overrides = {}) {
  return {
    data: [],
    error: null,
    isError: false,
    isPending: false,
    refetch: async () => ({}),
    ...overrides,
  };
}

test("FI-006 structural request scopes cannot collide through delimiter characters", () => {
  const first = requestScope(["task", "epoch:a", "assignment", "task-1"]);
  const second = requestScope(["task", "epoch", "a:assignment", "task-1"]);
  assert.notEqual(first, second);
  assert.notEqual(requestScope(["1"]), requestScope([1]));
  assert.equal(requestScope(["a:b", undefined, "c"]), JSON.stringify(["a:b", "c"]));
});

test("FI-003 late rollback stays blocked after Assignment cache purge", () => {
  const oldContext = { userId: "user-1", schoolId: "school-1", assignmentId: "assignment-old", sessionEpoch: "epoch-1" };
  const guard = createMutationContextGuard();
  const queryClient = new QueryClient();
  const oldKey = apiKeys.task(oldContext, "task-1");

  guard.bind(oldContext);
  const token = guard.capture(oldContext, ["checklist", "task-1"]);
  const previous = { taskId: "task-1", private: "old principal data" };
  queryClient.setQueryData(oldKey, previous);

  guard.invalidate();
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === "principal" });
  assert.equal(queryClient.getQueryCache().findAll({ queryKey: ["principal"] }).length, 0);

  // This is the exact gate used by mutation onError/onSuccess callbacks.
  if (guard.isCurrent(token)) queryClient.setQueryData(oldKey, previous);
  assert.equal(queryClient.getQueryData(oldKey), undefined);
  assert.equal(queryClient.getQueryCache().findAll({ queryKey: ["principal"] }).length, 0);
});

test("FI-003 older mutation generations cannot overwrite a newer mutation", () => {
  const context = { userId: "user-1", schoolId: "school-1", assignmentId: "assignment-1", sessionEpoch: "epoch-1" };
  const guard = createMutationContextGuard();
  guard.bind(context);
  const older = guard.capture(context, ["checklist", "task-1"]);
  const newer = guard.capture(context, ["checklist", "task-1"]);
  const independent = guard.capture(context, ["experience-note", "note-1"]);
  assert.equal(guard.isCurrent(older), false);
  assert.equal(guard.isCurrent(newer), true);
  assert.equal(guard.isCurrent(independent), true);
});

test("FI-001 current-context optimistic failure restores the exact note snapshot", () => {
  const context = { userId: "user-1", schoolId: "school-1", assignmentId: "assignment-1", sessionEpoch: "epoch-1" };
  const guard = createMutationContextGuard();
  const queryClient = new QueryClient();
  const key = apiKeys.notes(context);
  const previous = [{ id: "note-1", body: "저장 전 입력", visibility: "private", version: 1 }];
  guard.bind(context);
  const token = guard.capture(context, ["experience-note", "note-1"]);
  queryClient.setQueryData(key, previous);
  queryClient.setQueryData(key, [{ ...previous[0], body: "optimistic input", visibility: "handover" }]);
  if (guard.isCurrent(token)) queryClient.setQueryData(key, previous);
  assert.deepEqual(queryClient.getQueryData(key), previous);
});

test("FI-002 QueryBoundary preserves the design-owned loading, error, empty, and ready states", async () => {
  const { QueryBoundary } = await vite.ssrLoadModule("/src/components/ui/QueryBoundary.tsx");
  const render = (query, props = {}) => renderToStaticMarkup(React.createElement(
    QueryBoundary,
    { query, ...props },
    () => React.createElement("span", null, "rendered content"),
  ));

  assert.match(render(queryResult({ isPending: true })), /불러오는 중/);
  assert.match(render(queryResult({ isError: true, error: new Error("서버 연결 실패") })), /서버 연결 실패/);
  assert.match(render(queryResult({ data: [] }), { isEmpty: (items) => items.length === 0, emptyTitle: "새 알림이 없습니다" }), /새 알림이 없습니다/);
  assert.match(render(queryResult({ data: ["visible data"] })), /rendered content/);
});

test("FI-002 mutations stay in service wiring instead of replacing design markup", async () => {
  const [noteSource, checklistSource, notificationSource] = await Promise.all([
    readFile(new URL("../../src/components/notes/NoteComposerModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/features/task-detail/ChecklistSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/shell/NotificationPanel.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(noteSource, /saveExperienceNote\(\{ taskId, visibility, body \}\)/);
  assert.match(checklistSource, /toggleChecklistItem\(taskId, itemId/);
  assert.match(notificationSource, /markAllNotificationsRead/);
  for (const source of [noteSource, checklistSource, notificationSource]) {
    assert.doesNotMatch(source, /fetch\(|\/api\/|\/mocks\/backend\//);
  }
});

test("FI-007 search keeps design-owned result controls and delegates navigation", async () => {
  const source = await readFile(new URL("../../src/components/shell/SearchBox.tsx", import.meta.url), "utf8");
  assert.match(source, /className="res-item"/);
  assert.match(source, /selectResult\(`\/tasks\/\$\{task\.id\}`/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /useFocusTrap\(mobilePanelRef, mobileOpen\)/);
  assert.doesNotMatch(source, /searchNavigation/);
});

test("FI-004/FI-005 detail adapter follows the executable backend DTO", async () => {
  const { adaptTaskDetail } = await vite.ssrLoadModule("/src/domain/adapters.ts");
  const { EvidenceChain } = await vite.ssrLoadModule("/src/features/task-detail/EvidenceChain.tsx");
  const detail = adaptTaskDetail({
    task_id: "annual-only-task",
    checklist: [{ id: "check-1", text: "공식 일정 확인", note: null, done: false }],
    evidence_chain: [{
      level: "공식 근거",
      title: "공식 시행 공문",
      detail: "공식 일정과 제출 항목의 근거",
      source_type: "official",
      url: "https://example.invalid/official",
    }],
    previous_timeline: [{ date: "2025-09-20", event: "전년도 실제 처리" }],
    related_forms: [{ id: "form-1", title: "제출 양식", meta: "HWP" }],
    guideline_change_notice: "올해 공문을 우선 확인",
  });

  assert.equal(detail.taskId, "annual-only-task");
  assert.equal(detail.checklist[0].text, "공식 일정 확인");
  assert.deepEqual(detail.evidenceChain[0], {
    level: "공식 근거",
    title: "공식 시행 공문",
    detail: "공식 일정과 제출 항목의 근거",
    sourceType: "official",
    url: "https://example.invalid/official",
  });

  const html = renderToStaticMarkup(React.createElement(EvidenceChain, { chain: detail.evidenceChain }));
  for (const expected of ["공문 → 매뉴얼 → 법령 연결", "공식 시행 공문", "공식 일정과 제출 항목의 근거"]) {
    assert.match(html, new RegExp(expected));
  }
});

test("FI-001 notes service posts the design intent through the backend schema boundary", async () => {
  const notesService = await vite.ssrLoadModule("/src/services/notesService.ts");
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), body: JSON.parse(String(init.body)) };
    return new Response(JSON.stringify({
      id: "note-1",
      task_id: "task-ai-week",
      task_title: "AI 교육주간 운영",
      academic_year: 2026,
      author_display: "박새연",
      is_mine: true,
      visibility: "handover",
      body: "서비스 경계 회귀 메모",
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const created = await notesService.saveExperienceNote({
      taskId: "task-ai-week",
      body: "서비스 경계 회귀 메모",
      visibility: "handover",
    });
    assert.deepEqual(captured, {
      url: "/api/frontend/experience-notes",
      body: { task_id: "task-ai-week", visibility: "handover", body: "서비스 경계 회귀 메모" },
    });
    assert.equal(created.body, "서비스 경계 회귀 메모");
    assert.equal(created.visibility, "handover");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("FI-004/FI-007 component source keeps design authority and limits API work to wiring", async () => {
  const [detailSource, appShellSource, topbarSource, searchSource, assistantSource, uploadSource] = await Promise.all([
    readFile(new URL("../../src/features/task-detail/TaskDetailPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/shell/AppShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/shell/Topbar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/shell/SearchBox.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/shell/AssistantPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/upload/UploadModal.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(detailSource, /getTasks\(activeAssignmentId/);
  assert.match(detailSource, /const task = tasksQuery\.data\.find/);
  assert.match(appShellSource, /<Sidebar/);
  assert.match(appShellSource, /<Topbar/);
  assert.match(topbarSource, /className="hamb gam-menu-toggle"/);
  assert.match(searchSource, /className="mobile-search-panel"/);
  assert.match(assistantSource, /askAssistant/);
  assert.doesNotMatch(assistantSource, /function buildAnswer/);
  assert.match(uploadSource, /uploadDocument/);
  assert.doesNotMatch(uploadSource, /MOCK_FILES|client simulation/);
  for (const source of [detailSource, appShellSource, topbarSource, searchSource, assistantSource, uploadSource]) {
    assert.doesNotMatch(source, /\bfetch\(|VITE_BACKEND_URL/);
  }
});
