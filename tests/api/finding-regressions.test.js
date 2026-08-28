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

test("FI-002 QueryBoundary renders every V2 state without flattening issue metadata", async () => {
  const { QueryBoundary } = await vite.ssrLoadModule("/src/components/ui/QueryBoundary.tsx");
  const render = (props = {}, data = ["visible data"]) => renderToStaticMarkup(React.createElement(
    QueryBoundary,
    { query: queryResult({ data }), ...props },
    () => React.createElement("span", null, "rendered content"),
  ));

  assert.match(render({ status: "loading" }), /불러오는 중/);
  assert.match(render({ status: "idle" }), /요청 대기 중/);
  assert.match(render({ status: "ready" }), /rendered content/);
  assert.doesNotMatch(render({ status: "empty" }), /rendered content/);
  assert.match(render({ status: "no-result" }), /검색 결과가 없습니다/);

  for (const status of ["partial", "stale"]) {
    const html = render({ status, issue: { code: status, title: `${status} title`, userMessage: `${status} detail`, retryable: false } });
    assert.match(html, new RegExp(`${status} title`));
    assert.match(html, /rendered content/);
  }

  for (const status of ["unauthorized", "forbidden", "not-found", "conflict", "server-error", "offline", "disabled"]) {
    const html = render({ status, issue: { code: status, title: `${status} title`, userMessage: `${status} detail`, retryable: false } });
    assert.match(html, new RegExp(`${status} title`));
    assert.doesNotMatch(html, /rendered content/);
  }

  const validation = render({
    status: "validation-error",
    issue: {
      code: "VALIDATION_FAILED",
      title: "입력 오류",
      userMessage: "확인해 주세요",
      retryable: false,
      fieldErrors: [{ field: "text", message: "필수 입력" }],
      supportId: "support-422",
    },
  });
  assert.match(validation, /text/);
  assert.match(validation, /필수 입력/);
  assert.match(validation, /support-422/);

  const limited = render({
    status: "rate-limited",
    issue: {
      code: "RATE_LIMITED",
      title: "요청 제한",
      userMessage: "잠시 기다려 주세요",
      retryable: true,
      retryAfter: "2026-08-28T10:00:00+09:00",
      recoveryAction: "retry",
    },
    onRecovery: () => {},
  });
  assert.match(limited, /2026-08-28T10:00:00\+09:00/);
  assert.match(limited, /다시 시도/);
});

test("FI-002 mutation action status distinguishes conflicts", async () => {
  const { getAsyncActionStatus } = await vite.ssrLoadModule("/src/services/errorPresentation.ts");
  const conflict = Object.assign(new Error("conflict"), {
    status: 412,
    issue: { code: "VERSION_CONFLICT", title: "충돌", userMessage: "최신 내용을 확인하세요", retryable: true, recoveryAction: "reload-latest" },
  });
  assert.equal(getAsyncActionStatus({ isPending: true }), "submitting");
  assert.equal(getAsyncActionStatus({ isError: true, error: conflict }), "conflict");
  assert.equal(getAsyncActionStatus({ isError: true, error: new Error("failed") }), "error");
  assert.equal(getAsyncActionStatus({ isSuccess: true }), "success");
  assert.equal(getAsyncActionStatus({}), "idle");
});

test("FI-007 listbox navigation wraps predictably for ArrowUp/ArrowDown", async () => {
  const { nextSearchIndex } = await vite.ssrLoadModule("/src/components/shell/searchNavigation.ts");
  assert.equal(nextSearchIndex(-1, 3, 1), 0);
  assert.equal(nextSearchIndex(-1, 3, -1), 2);
  assert.equal(nextSearchIndex(2, 3, 1), 0);
  assert.equal(nextSearchIndex(0, 3, -1), 2);
  assert.equal(nextSearchIndex(0, 0, 1), -1);
});

test("FI-004/FI-005 detail adapter keeps annual-only summary and evidence trust metadata", async () => {
  const { adaptTaskDetail } = await vite.ssrLoadModule("/src/domain/adapters.ts");
  const { EvidenceChain } = await vite.ssrLoadModule("/src/features/task-detail/EvidenceChain.tsx");
  const context = { userId: "user-1", schoolId: "school-1", assignmentId: "assignment-1", sessionEpoch: "epoch-1" };
  const detail = adaptTaskDetail({
    status: "ready",
    task: {
      id: "annual-only-task",
      seriesId: "series-1",
      title: "연간 지도에만 있는 업무",
      nextAction: "상세 확인",
      category: "행정",
      status: "preparing",
      priority: "normal",
      dates: { recommendedStart: "2026-09-01", officialDue: "2026-09-30", previousActual: "2025-09-20" },
      checklistDone: 0,
      checklistTotal: 1,
      version: 4,
    },
    checklist: [],
    evidence: [{
      id: "evidence-1",
      documentId: "document-1",
      source: "official",
      title: "공식 시행 공문",
      documentNumber: "교육-2026-101",
      issuer: "서울특별시교육청",
      issuedAt: "2026-08-20T09:00:00+09:00",
      effectiveAt: "2026-08-20T09:00:00+09:00",
      pageRange: "3-4쪽",
      versionLabel: "v2",
      verifiedAt: "2026-08-27T15:00:00+09:00",
      verifiedBy: "업무 검증 담당자",
      state: "verified",
      rationale: "공식 일정과 제출 항목의 근거",
      originalAvailable: true,
    }],
    previousActivities: [],
    experienceNotes: [],
  }, context);

  assert.equal(detail.task.id, "annual-only-task");
  assert.equal(detail.task.title, "연간 지도에만 있는 업무");
  assert.deepEqual(detail.evidenceChain[0], {
    level: "공식 근거",
    title: "공식 시행 공문",
    detail: "공식 일정과 제출 항목의 근거",
    sourceType: "official",
    documentNumber: "교육-2026-101",
    issuer: "서울특별시교육청",
    issuedAt: "2026-08-20T09:00:00+09:00",
    pageRange: "3-4쪽",
    versionLabel: "v2",
    verifiedAt: "2026-08-27T15:00:00+09:00",
    verifiedBy: "업무 검증 담당자",
    verificationState: "verified",
    originalAvailable: true,
  });

  const html = renderToStaticMarkup(React.createElement(EvidenceChain, { chain: detail.evidenceChain }));
  for (const expected of ["발행기관", "서울특별시교육청", "문서번호", "교육-2026-101", "검증일", "2026-08-27", "검증자", "업무 검증 담당자", "검증 완료"]) {
    assert.match(html, new RegExp(expected));
  }
});

test("FI-001 notes service wires create/update/stale/delete and isolates Assignment context", async () => {
  const assignments = await vite.ssrLoadModule("/src/services/assignmentsService.ts");
  const tasks = await vite.ssrLoadModule("/src/services/tasksService.ts");
  const notesService = await vite.ssrLoadModule("/src/services/notesService.ts");
  const initial = await assignments.getAssignments();
  const context = initial.session.context;
  const userLabel = initial.session.user.displayName;
  const detail = await tasks.getTaskDetail(context, "task-ai-week");
  assert.equal(await tasks.getTaskDetail(context, "task-does-not-exist"), null);

  const createdNotes = await notesService.createExperienceNote(context, userLabel, {
    taskId: "task-ai-week",
    academicYear: 2026,
    text: "서비스 controller 회귀 메모",
    visibility: "private",
    expectedVersion: detail.version,
  });
  const created = createdNotes.find((note) => note.body === "서비스 controller 회귀 메모");
  assert.ok(created);

  const updatedNotes = await notesService.updateExperienceNote(context, userLabel, {
    taskId: created.taskId,
    noteId: created.id,
    text: "수정 후에도 입력이 보존되는 메모",
    visibility: "handover",
    expectedVersion: created.version,
  });
  const updated = updatedNotes.find((note) => note.id === created.id);
  assert.equal(updated.body, "수정 후에도 입력이 보존되는 메모");
  assert.equal(updated.visibility, "handover");

  await assert.rejects(notesService.updateExperienceNote(context, userLabel, {
    taskId: updated.taskId,
    noteId: updated.id,
    text: "오래된 버전의 수정",
    visibility: "private",
    expectedVersion: created.version,
  }), (error) => error.status === 412 && error.issue.recoveryAction === "reload-latest");

  const deletedNotes = await notesService.deleteExperienceNote(context, userLabel, {
    taskId: updated.taskId,
    noteId: updated.id,
    expectedVersion: updated.version,
  });
  assert.equal(deletedNotes.some((note) => note.id === updated.id), false);

  const other = await assignments.switchActiveAssignment("asg-gifted", initial.session.version);
  assert.deepEqual(await notesService.getExperienceNotes(other.session.context, userLabel), []);
  await assignments.switchActiveAssignment("asg-science", other.session.version);
});

test("FI-004/FI-007 component source keeps detail authority and keyboard semantics", async () => {
  const [detailSource, appShellSource, topbarSource, sidebarSource, searchSource, reviewSource] = await Promise.all([
    readFile(new URL("../../src/features/task-detail/TaskDetailPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/shell/AppShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/shell/Topbar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/shell/Sidebar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/shell/SearchBox.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/notes/ReviewModal.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(detailSource, /getTasks\(/);
  assert.match(detailSource, /const task = detail\.task/);
  assert.match(appShellSource, /className="skip-link" href="#view"/);
  assert.match(topbarSource, /aria-expanded=\{navOpen\}/);
  assert.match(topbarSource, /aria-controls="primary-navigation"/);
  assert.match(topbarSource, /navOpen \? "메뉴 닫기" : "메뉴 열기"/);
  assert.match(sidebarSource, /id="primary-navigation"/);
  for (const token of ["role=\"combobox\"", "role=\"listbox\"", "aria-activedescendant", "ArrowDown", "ArrowUp", "Enter", "Escape"]) {
    assert.match(searchSource, new RegExp(token));
  }
  assert.match(reviewSource, /삭제 확인/);
  assert.match(reviewSource, /expectedVersion: note\.version/);
});
