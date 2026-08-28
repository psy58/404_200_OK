/**
 * API INTEGRATION - framework-independent MOCK_ONLY service
 *
 * User flow: session -> Assignment -> home/annual/task -> check/note/search;
 *            upload/notification/assistant remain visibly disabled.
 * Contract SOT: none. MOCK ONLY revision ui-api-boundary-v2.mock.1.
 * Operations/schemas: FrontendApiService capabilities backed by strict local
 *                     parsers; no path, method or backend enum is asserted.
 * Adapter: validated snake_case fixture DTO -> UI_API_BOUNDARY_V2 camelCase VM.
 * Auth/AuthZ: simulated context/object checks are client regression guards only;
 *             the future server must reauthorize every object/property/action.
 * State/cache: session-only mutations; context-lifecycle owns switch/logout purge.
 * Failure UX: validated problem fixtures map 401/403/404/409/412/422/429/5xx;
 *             input/version/idempotency conflicts fail without silent success.
 * Privacy/logging: synthetic data only; no document body, token or real person.
 * Verification: tests/api/mock-service.test.js + runtime-schema.test.js.
 */

import {
  parseContractDto,
  parseHomeDto,
  parseProblemCatalog,
  parseSearchDto,
  parseTaskDetailDto,
} from "./runtime-schema.js";
import { adaptHome, adaptSearch, adaptSession, adaptTaskDetail, adaptTaskSummary } from "./adapters.js";
import { mapProblemToUiIssue } from "./problem-mapper.js";

/** @typedef {{ signal?: AbortSignal }} SignalOptions */
/** @typedef {import("./ui-api-boundary-v2.js").RequestContext} RequestContext */

const NOTE_VISIBILITY = new Set(["private", "handover", "school"]);

export class MockApiError extends Error {
  constructor(issue, status) {
    super(issue.userMessage);
    this.name = "MockApiError";
    this.issue = issue;
    this.status = status;
  }
}

function abortError() {
  return new DOMException("The operation was aborted", "AbortError");
}

function wait(milliseconds, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function clone(value) {
  return structuredClone(value);
}

function contextFromDto(dto) {
  return {
    userId: dto.user_id,
    schoolId: dto.school_id,
    assignmentId: dto.assignment_id,
    sessionEpoch: dto.session_epoch,
  };
}

function sameContext(left, right) {
  return left.userId === right.userId
    && left.schoolId === right.schoolId
    && left.assignmentId === right.assignmentId
    && left.sessionEpoch === right.sessionEpoch;
}

function monthIndex(date) {
  const month = Number(date.slice(5, 7));
  return month >= 3 ? month - 3 : month + 9;
}

function noIssueView(status, overrides = {}) {
  return Object.freeze({ status, ...overrides });
}

export function createFetchFixtureLoader(baseUrl = "/mocks/backend/", fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  /** @param {string} name @param {SignalOptions} [options] */
  return async function loadFetchFixture(name, options = {}) {
    const { signal } = options;
    const response = await fetchImpl(`${normalized}${name}`, { signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Mock fixture unavailable: ${name} (${response.status})`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) throw new Error(`Mock fixture is not JSON: ${name}`);
    return response.json();
  };
}

export function createMemoryFixtureLoader(fixtures) {
  /** @param {string} name @param {SignalOptions} [options] */
  return async function loadMemoryFixture(name, options = {}) {
    const { signal } = options;
    if (signal?.aborted) throw abortError();
    if (!(name in fixtures)) throw new Error(`Mock fixture unavailable: ${name}`);
    return clone(fixtures[name]);
  };
}

/**
 * @param {{ fixtureLoader?: (name: string, options?: SignalOptions) => Promise<unknown>, latencyMs?: number }} [options]
 */
export async function createMockApi(options = {}) {
  const { fixtureLoader, latencyMs = 0 } = options;
  if (typeof fixtureLoader !== "function") throw new TypeError("fixtureLoader is required");

  const load = async (name, parser, signal) => {
    await wait(latencyMs, signal);
    if (signal?.aborted) throw abortError();
    return parser(await fixtureLoader(name, { signal }));
  };

  const [contractSeed, homeSeed, taskSeed, searchSeed, problemCatalog] = await Promise.all([
    load("contract.json", parseContractDto),
    load("home.json", parseHomeDto),
    load("task-detail.student-competition.json", parseTaskDetailDto),
    load("search-results.json", parseSearchDto),
    load("problems.json", parseProblemCatalog),
  ]);

  const seedContext = {
    userId: contractSeed.session.user.id,
    schoolId: contractSeed.session.school.id,
    assignmentId: contractSeed.session.active_assignment_id,
    sessionEpoch: contractSeed.session.session_epoch,
  };
  for (const [name, dto] of [["home", homeSeed], ["task", taskSeed], ["search", searchSeed]]) {
    if (!sameContext(seedContext, contextFromDto(dto.context))) {
      throw new TypeError(`${name} fixture context must match contract fixture context`);
    }
  }

  let contract = clone(contractSeed);
  let home = clone(homeSeed);
  let task = clone(taskSeed);
  const searchSeedCopy = clone(searchSeed);
  const idempotency = new Map();
  let nextExperienceNoteSequence = task.experience_notes.length + 1;
  const seedAssignmentId = home.context.assignment_id;
  let authenticated = true;

  const syncTaskSnapshots = () => {
    home.urgent = home.urgent.map((candidate) => candidate.id === task.task.id ? clone(task.task) : candidate);
    home.this_month = home.this_month.map((candidate) => candidate.id === task.task.id ? clone(task.task) : candidate);
    home.next_thirty_days = home.next_thirty_days.map((candidate) => candidate.id === task.task.id ? clone(task.task) : candidate);
    if (home.primary_task?.id === task.task.id) home.primary_task = clone(task.task);
  };

  const problem = (status) => {
    const match = problemCatalog.items.find((item) => item.status === status);
    if (!match) throw new Error(`Missing mock problem for status ${status}`);
    return match;
  };

  const throwProblem = (status) => {
    throw new MockApiError(mapProblemToUiIssue(problem(status)), status);
  };

  const activeContext = () => ({
    userId: contract.session.user.id,
    schoolId: contract.session.school.id,
    assignmentId: contract.session.active_assignment_id,
    sessionEpoch: contract.session.session_epoch,
  });

  const authorize = (context) => {
    if (!authenticated) throwProblem(401);
    if (!context || !sameContext(context, activeContext())) throwProblem(403);
  };

  const hasSeedAssignment = (context) => context.assignmentId === seedAssignmentId;

  const requireSeedTask = (context, taskId) => {
    if (!hasSeedAssignment(context) || taskId !== task.task.id) throwProblem(404);
  };

  const replayMutation = (key, fingerprint) => {
    if (!key || typeof key !== "string") throw new TypeError("idempotencyKey is required");
    if (!idempotency.has(key)) return { replayed: false, result: undefined };
    const previous = idempotency.get(key);
    if (previous.fingerprint !== fingerprint) throwProblem(409);
    return { replayed: true, result: previous.result };
  };

  const mutationResult = (key, fingerprint, work) => {
    const result = work();
    idempotency.set(key, { fingerprint, result });
    return result;
  };

  const experienceNotesView = (query = {}) => {
    const detail = adaptTaskDetail(clone(task));
    const filter = query.filter ?? {};
    const normalized = String(query.query ?? "").trim().toLocaleLowerCase("ko");
    const items = detail.experienceNotes.filter((note) => {
      if (normalized && !`${note.text} ${note.authorLabel}`.toLocaleLowerCase("ko").includes(normalized)) return false;
      if (filter.taskId && note.taskId !== filter.taskId) return false;
      if (filter.academicYear && note.academicYear !== Number(filter.academicYear)) return false;
      if (filter.authorLabel && note.authorLabel !== filter.authorLabel) return false;
      if (filter.approval && note.approval !== filter.approval) return false;
      if (filter.visibility && note.visibility !== filter.visibility) return false;
      return true;
    });
    const status = items.length ? "ready" : (normalized || Object.keys(filter).length ? "no-result" : "empty");
    return noIssueView(status, { items: Object.freeze(items), nextCursor: null, total: items.length });
  };

  const disabledAnalysis = async (context, signal) => {
    await wait(latencyMs, signal);
    authorize(context);
    return noIssueView("disabled", {
      jobId: null, state: "idle", progress: 0, files: Object.freeze([]), drafts: Object.freeze([]),
      issue: Object.freeze({
        code: "BACKEND_REQUIRED",
        title: "파일 분석 서버 계약이 필요합니다",
        userMessage: "파일 검사·격리·파싱·분석은 프론트 목업으로 완료 처리하지 않습니다.",
        retryable: false,
        recoveryAction: "none",
      }),
    });
  };

  const disabledNotifications = async (context, signal) => {
    await wait(latencyMs, signal);
    authorize(context);
    return noIssueView("disabled", {
      items: Object.freeze([]), unread: 0, nextCursor: null,
      issue: Object.freeze({
        code: "BACKEND_REQUIRED",
        title: "알림은 실제 P1 계약이 필요합니다",
        userMessage: "고정 숫자나 브라우저 전용 읽음 상태를 실제 알림으로 표시하지 않습니다.",
        retryable: false,
        recoveryAction: "none",
      }),
    });
  };

  return Object.freeze({
    contractStatus: "MOCK_ONLY",
    persistence: "session-only",

    /** @param {SignalOptions} [options] */
    async getSession(options = {}) {
      const { signal } = options;
      await wait(latencyMs, signal);
      if (!authenticated) throwProblem(401);
      return adaptSession(clone(contract));
    },

    async setActiveAssignment(assignmentId, mutation) {
      await wait(latencyMs, mutation?.signal);
      if (!authenticated) throwProblem(401);
      const fingerprint = JSON.stringify({ operation: "setActiveAssignment", assignmentId });
      const replay = replayMutation(mutation?.idempotencyKey, fingerprint);
      if (replay.replayed) return replay.result;
      if (mutation?.expectedVersion !== contract.session.version) throwProblem(412);
      const target = contract.session.assignments.find((assignment) => assignment.id === assignmentId);
      if (!target) throwProblem(403);
      return mutationResult(mutation.idempotencyKey, fingerprint, () => {
        contract.session.assignments.forEach((assignment) => { assignment.active = assignment.id === assignmentId; });
        contract.session.active_assignment_id = assignmentId;
        contract.session.version += 1;
        return adaptSession(clone(contract));
      });
    },

    /** @param {RequestContext} context @param {SignalOptions} [options] */
    async getHome(context, options = {}) {
      const { signal } = options;
      await wait(latencyMs, signal);
      authorize(context);
      if (context.assignmentId !== home.context.assignment_id) {
        return noIssueView("empty", {
          generatedAt: home.generated_at,
          context: Object.freeze({ ...context }),
          primaryTask: null,
          urgent: Object.freeze([]),
          thisMonth: Object.freeze([]),
          nextThirtyDays: Object.freeze([]),
          summaries: Object.freeze([]),
        });
      }
      return adaptHome(clone(home));
    },

    async getAnnualMap(context, query = {}) {
      await wait(latencyMs, query.signal);
      authorize(context);
      const filter = query.filter ?? {};
      const academicYear = Number(filter.academicYear ?? 2026);
      if (!Number.isInteger(academicYear) || academicYear < 2000 || academicYear > 2200) throwProblem(422);
      if (context.assignmentId !== home.context.assignment_id || academicYear !== 2026) {
        return noIssueView("empty", { academicYear, activeMonth: 8, items: Object.freeze([]), nextCursor: null });
      }
      const all = [...home.this_month, ...home.next_thirty_days];
      const unique = [...new Map(all.map((item) => [item.id, item])).values()];
      const annualItems = unique.map((item, index) => Object.freeze({
        ...adaptTaskSummary(item),
        academicYear,
        monthStart: monthIndex(item.dates.recommended_start),
        monthEnd: monthIndex(item.dates.official_due),
        previousTaskId: index === 0 ? null : unique[index - 1].id,
        nextTaskId: index === unique.length - 1 ? null : unique[index + 1].id,
      }));
      const items = annualItems.filter((item) => {
        if (filter.category && item.category !== filter.category) return false;
        if (filter.status && item.status !== filter.status) return false;
        if (filter.priority && item.priority !== filter.priority) return false;
        if (filter.month && !(item.monthStart <= Number(filter.month) && item.monthEnd >= Number(filter.month))) return false;
        return true;
      });
      const filtered = Object.keys(filter).some((key) => key !== "academicYear");
      return noIssueView(items.length ? "ready" : (filtered ? "no-result" : "empty"), {
        academicYear, activeMonth: 8, items: Object.freeze(items), nextCursor: null,
      });
    },

    /** @param {RequestContext} context @param {string} taskId @param {SignalOptions} [options] */
    async getTaskDetail(context, taskId, options = {}) {
      const { signal } = options;
      await wait(latencyMs, signal);
      authorize(context);
      requireSeedTask(context, taskId);
      return adaptTaskDetail(clone(task));
    },

    async updateChecklist(context, mutation) {
      await wait(latencyMs, mutation?.signal);
      authorize(context);
      requireSeedTask(context, mutation.taskId);
      const fingerprint = JSON.stringify({
        operation: "updateChecklist",
        taskId: mutation.taskId,
        itemId: mutation.itemId,
        complete: Boolean(mutation.complete),
      });
      const replay = replayMutation(mutation.idempotencyKey, fingerprint);
      if (replay.replayed) return replay.result;
      if (mutation.expectedVersion !== task.task.version) throwProblem(412);
      const item = task.checklist.find((candidate) => candidate.id === mutation.itemId);
      if (!item) throwProblem(404);
      return mutationResult(mutation.idempotencyKey, fingerprint, () => {
        item.complete = Boolean(mutation.complete);
        task.task.version += 1;
        task.task.checklist_done = task.checklist.filter((candidate) => candidate.complete).length;
        task.checklist.forEach((candidate) => { candidate.version = task.task.version; });
        syncTaskSnapshots();
        return adaptTaskDetail(clone(task));
      });
    },

    async listDocuments(context, query = {}) {
      await wait(latencyMs, query.signal);
      authorize(context);
      if (!hasSeedAssignment(context)) {
        return noIssueView("empty", { items: Object.freeze([]), nextCursor: null, total: 0, asOf: home.generated_at });
      }
      const normalized = String(query.query ?? "").trim().toLocaleLowerCase("ko");
      const filter = query.filter ?? {};
      const allItems = task.evidence
        .filter((evidence) => evidence.document_id !== null && evidence.source !== "experience")
        .map((evidence) => Object.freeze({
          id: evidence.document_id,
          title: evidence.title,
          documentNumber: evidence.document_number ?? "문서번호 없음",
          relatedTaskId: task.task.id,
          relatedTaskTitle: task.task.title,
          date: evidence.effective_at ?? evidence.issued_at,
          source: evidence.source === "official" ? "official" : "school-case",
          analysisState: evidence.state === "review_required" ? "review-required" : "complete",
          evidenceState: evidence.state.replaceAll("_", "-"),
        }));
      const items = allItems.filter((item) => {
        if (normalized && !`${item.title} ${item.documentNumber} ${item.relatedTaskTitle ?? ""}`.toLocaleLowerCase("ko").includes(normalized)) return false;
        if (filter.source && item.source !== filter.source) return false;
        if (filter.analysisState && item.analysisState !== filter.analysisState) return false;
        if (filter.evidenceState && item.evidenceState !== filter.evidenceState) return false;
        if (filter.relatedTaskId && item.relatedTaskId !== filter.relatedTaskId) return false;
        if (filter.academicYear && !item.date.startsWith(`${filter.academicYear}-`)) return false;
        return true;
      });
      const constrained = normalized || Object.keys(filter).length > 0;
      return noIssueView(items.length ? "ready" : (constrained ? "no-result" : "empty"), {
        items: Object.freeze(items), nextCursor: null, total: items.length, asOf: home.generated_at,
      });
    },

    async search(context, query = {}) {
      await wait(latencyMs, query.signal);
      authorize(context);
      const normalized = String(query.query ?? "").trim().toLocaleLowerCase("ko");
      const snapshot = clone(searchSeedCopy);
      snapshot.query = String(query.query ?? "");
      snapshot.context = {
        user_id: context.userId,
        school_id: context.schoolId,
        assignment_id: context.assignmentId,
        session_epoch: context.sessionEpoch,
      };
      if (!hasSeedAssignment(context)) snapshot.items = [];
      if (normalized) {
        snapshot.items = snapshot.items.filter((item) => `${item.title} ${item.description}`.toLocaleLowerCase("ko").includes(normalized));
      }
      const filter = query.filter ?? {};
      if (filter.type) snapshot.items = snapshot.items.filter((item) => item.type === filter.type);
      if (filter.source) snapshot.items = snapshot.items.filter((item) => item.source === filter.source);
      snapshot.total = snapshot.items.length;
      return adaptSearch(parseSearchDto(snapshot));
    },

    async listExperienceNotes(context, query = {}) {
      await wait(latencyMs, query.signal);
      authorize(context);
      if (!hasSeedAssignment(context)) return noIssueView("empty", { items: Object.freeze([]), nextCursor: null, total: 0 });
      return experienceNotesView(query);
    },

    async createExperienceNote(context, mutation) {
      await wait(latencyMs, mutation?.signal);
      authorize(context);
      requireSeedTask(context, mutation.taskId);
      const fingerprint = JSON.stringify({
        operation: "createExperienceNote",
        taskId: mutation.taskId,
        academicYear: mutation.academicYear,
        text: mutation.text,
        visibility: mutation.visibility,
      });
      const replay = replayMutation(mutation.idempotencyKey, fingerprint);
      if (replay.replayed) return replay.result;
      if (mutation.expectedVersion !== task.task.version) throwProblem(412);
      if (typeof mutation.text !== "string" || mutation.text.trim().length < 1 || mutation.text.length > 1000) throwProblem(422);
      if (!Number.isInteger(mutation.academicYear) || mutation.academicYear < 2000 || mutation.academicYear > 2200) throwProblem(422);
      if (!NOTE_VISIBILITY.has(mutation.visibility)) throwProblem(422);
      return mutationResult(mutation.idempotencyKey, fingerprint, () => {
        task.task.version += 1;
        task.checklist.forEach((candidate) => { candidate.version = task.task.version; });
        syncTaskSnapshots();
        task.experience_notes.push({
          id: `note-session-${nextExperienceNoteSequence++}`,
          task_id: task.task.id,
          academic_year: mutation.academicYear,
          text: mutation.text.trim(),
          author_label: "현재 담당자",
          visibility: mutation.visibility,
          approval: "draft",
          reviewed_at: null,
          version: 1,
        });
        return experienceNotesView();
      });
    },

    async updateExperienceNote(context, mutation) {
      await wait(latencyMs, mutation?.signal);
      authorize(context);
      requireSeedTask(context, mutation.taskId);
      const fingerprint = JSON.stringify({
        operation: "updateExperienceNote",
        taskId: mutation.taskId,
        noteId: mutation.noteId,
        text: mutation.text,
        visibility: mutation.visibility,
      });
      const replay = replayMutation(mutation.idempotencyKey, fingerprint);
      if (replay.replayed) return replay.result;
      const note = task.experience_notes.find((candidate) => candidate.id === mutation.noteId);
      if (!note) throwProblem(404);
      if (mutation.expectedVersion !== note.version) throwProblem(412);
      if (typeof mutation.text !== "string" || mutation.text.trim().length < 1 || mutation.text.length > 1000) throwProblem(422);
      if (!NOTE_VISIBILITY.has(mutation.visibility)) throwProblem(422);
      return mutationResult(mutation.idempotencyKey, fingerprint, () => {
        note.text = mutation.text.trim();
        note.visibility = mutation.visibility;
        note.version += 1;
        task.task.version += 1;
        task.checklist.forEach((candidate) => { candidate.version = task.task.version; });
        syncTaskSnapshots();
        return experienceNotesView();
      });
    },

    async deleteExperienceNote(context, mutation) {
      await wait(latencyMs, mutation?.signal);
      authorize(context);
      requireSeedTask(context, mutation.taskId);
      const fingerprint = JSON.stringify({
        operation: "deleteExperienceNote",
        taskId: mutation.taskId,
        noteId: mutation.noteId,
      });
      const replay = replayMutation(mutation.idempotencyKey, fingerprint);
      if (replay.replayed) return replay.result;
      const index = task.experience_notes.findIndex((candidate) => candidate.id === mutation.noteId);
      if (index < 0) throwProblem(404);
      if (mutation.expectedVersion !== task.experience_notes[index].version) throwProblem(412);
      return mutationResult(mutation.idempotencyKey, fingerprint, () => {
        task.experience_notes.splice(index, 1);
        task.task.version += 1;
        task.checklist.forEach((candidate) => { candidate.version = task.task.version; });
        syncTaskSnapshots();
        return experienceNotesView();
      });
    },

    /** @param {RequestContext} context @param {number} academicYear @param {SignalOptions} [options] */
    async getHandoverPreview(context, academicYear, options = {}) {
      const { signal } = options;
      await wait(latencyMs, signal);
      authorize(context);
      if (!hasSeedAssignment(context)) {
        return noIssueView("empty", {
          academicYear,
          generatedFromVersion: task.task.version,
          annualFlow: Object.freeze([]),
          incomplete: Object.freeze([]),
          evidence: Object.freeze([]),
          notes: Object.freeze([]),
        });
      }
      const homeView = adaptHome(clone(home));
      const detail = adaptTaskDetail(clone(task));
      const approvedNotes = detail.experienceNotes.filter((note) => (
        note.academicYear === academicYear && note.approval === "approved" && note.visibility !== "private"
      ));
      return noIssueView("ready", {
        academicYear,
        generatedFromVersion: task.task.version,
        annualFlow: Object.freeze([...homeView.thisMonth, ...homeView.nextThirtyDays]),
        incomplete: homeView.urgent,
        evidence: detail.evidence,
        notes: Object.freeze(approvedNotes),
      });
    },

    async getNotifications(context, query = {}) {
      return disabledNotifications(context, query.signal);
    },

    async markNotificationRead(context, mutation = {}) {
      return disabledNotifications(context, mutation.signal);
    },

    async markAllNotificationsRead(context, mutation = {}) {
      return disabledNotifications(context, mutation.signal);
    },

    async prepareUpload(context, request = {}) {
      return disabledAnalysis(context, request.signal);
    },

    async transferUploadFile(context, request = {}) {
      return disabledAnalysis(context, request.signal);
    },

    async createAnalysisJob(context, request = {}) {
      return disabledAnalysis(context, request.signal);
    },

    /** @param {RequestContext} context @param {string} _jobId @param {SignalOptions} [options] */
    async getAnalysisJob(context, _jobId, options = {}) {
      const { signal } = options;
      return disabledAnalysis(context, signal);
    },

    async cancelAnalysisJob(context, mutation = {}) {
      return disabledAnalysis(context, mutation.signal);
    },

    async retryAnalysisItem(context, mutation = {}) {
      return disabledAnalysis(context, mutation.signal);
    },

    async reviewAnalysisDraft(context, mutation = {}) {
      return disabledAnalysis(context, mutation.signal);
    },

    async deleteAnalysisItem(context, mutation = {}) {
      return disabledAnalysis(context, mutation.signal);
    },

    async queryAssistant(context, request = {}) {
      await wait(latencyMs, request.signal);
      authorize(context);
      return noIssueView("disabled", {
        answer: "",
        citations: Object.freeze([]),
        grounding: "unsupported",
        requiresHumanReview: true,
        issue: Object.freeze({
          code: "BACKEND_REQUIRED",
          title: "근거 기반 보조 AI 계약이 필요합니다",
          userMessage: "승인된 검색·인용 계약 없이 범용 채팅 응답을 생성하지 않습니다.",
          retryable: false,
          recoveryAction: "none",
        }),
      });
    },

    /** @param {SignalOptions} [options] */
    async logout(options = {}) {
      const { signal } = options;
      await wait(latencyMs, signal);
      authenticated = false;
      idempotency.clear();
    },

    getActiveContext() {
      return Object.freeze(activeContext());
    },
  });
}
