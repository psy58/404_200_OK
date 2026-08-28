import { z, type ZodType } from "zod";
import type {
  AnalysisJobMutation,
  AssistantQuery,
  AssistantVM,
  ChecklistMutation,
  DocumentListVM,
  EvidenceVM,
  ExperienceNoteCreate,
  ExperienceNoteDelete,
  ExperienceNotesVM,
  ExperienceNoteUpdate,
  FrontendApiService,
  HandoverPreviewVM,
  IdempotentMutation,
  ListQuery,
  NotificationCenterVM,
  NotificationReadMutation,
  RequestContext,
  SessionContextVM,
  TaskCreateMutation,
  TaskDetailVM,
  TaskSummaryVM,
  UploadAnalysisVM,
  UploadPrepareRequest,
  UploadTransferRequest,
  VersionedMutation,
} from "./ui-api-boundary-v2";
import {
  RawAssignmentsResponseSchema,
  RawAssistantAnswerSchema,
  RawDocumentsResponseSchema,
  RawExperienceNoteSchema,
  RawExperienceNotesResponseSchema,
  RawNotificationsReadSchema,
  RawNotificationsResponseSchema,
  RawTaskDetailSchema,
  RawTaskSchema,
  RawTasksResponseSchema,
  RawUploadRecordSchema,
  RawUploadsResponseSchema,
} from "@/domain/raw-schemas";

const BackendErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ field: z.string(), reason: z.string() })).optional(),
  }),
});

type RawAssignments = z.infer<typeof RawAssignmentsResponseSchema>;
type RawTask = z.infer<typeof RawTaskSchema>;
type RawTaskDetail = z.infer<typeof RawTaskDetailSchema>;
type RawDocument = z.infer<typeof RawDocumentsResponseSchema>["items"][number];
type RawExperienceNote = z.infer<typeof RawExperienceNoteSchema>;
type RawNotification = z.infer<typeof RawNotificationsResponseSchema>["items"][number];
type RawUploadRecord = z.infer<typeof RawUploadRecordSchema>;

export class BackendApiError extends Error {
  readonly issue: {
    code: string;
    title: string;
    userMessage: string;
    fieldErrors?: readonly { field: string; message: string }[];
    retryable: boolean;
    recoveryAction: "retry" | "go-to-list" | "none" | "contact-support";
  };
  constructor(readonly status: number, code: string, message: string, fieldErrors?: readonly { field: string; message: string }[]) {
    super(message);
    this.name = "BackendApiError";
    this.issue = {
      code,
      title: status === 404 ? "요청한 정보를 찾을 수 없습니다" : status === 422 ? "입력 내용을 확인해 주세요" : "요청을 처리하지 못했습니다",
      userMessage: message,
      fieldErrors,
      retryable: status >= 500,
      recoveryAction: status === 404 ? "go-to-list" : status >= 500 ? "retry" : "none",
    };
  }
}

function unavailable(capability: string): never {
  throw new BackendApiError(501, "BACKEND_CAPABILITY_MISSING", `${capability} 기능은 현재 백엔드에 없습니다.`);
}

async function requestJson<T>(path: string, schema: ZodType<T>, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new BackendApiError(500, "BACKEND_PATH_INVALID", "안전하지 않은 API 경로를 차단했습니다.");
  }
  let response: Response;
  try {
    const isForm = init.body instanceof FormData;
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      redirect: "error",
      headers: {
        Accept: "application/json",
        ...(init.body && !isForm ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new BackendApiError(0, "OFFLINE", "백엔드에 연결할 수 없습니다. 서버 실행 상태를 확인해 주세요.");
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new BackendApiError(response.status || 500, "RESPONSE_CONTENT_TYPE_INVALID", "서버 응답 형식을 확인할 수 없습니다.");
  }
  const payload: unknown = await response.json();
  if (!response.ok) {
    const parsedError = BackendErrorSchema.safeParse(payload);
    if (!parsedError.success) {
      throw new BackendApiError(response.status, "BACKEND_ERROR_INVALID", `요청이 실패했습니다 (${response.status}).`);
    }
    throw new BackendApiError(
      response.status,
      parsedError.data.error.code,
      parsedError.data.error.message,
      parsedError.data.error.details?.map((item) => ({ field: item.field, message: item.reason })),
    );
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new BackendApiError(500, "CONTRACT_RESPONSE_INVALID", "검증되지 않은 서버 응답은 화면에 반영하지 않았습니다.");
  }
  return parsed.data;
}

function isoNow(): string {
  return new Date().toISOString();
}

function dueInDays(date: string): number {
  return Math.ceil((new Date(`${date}T00:00:00+09:00`).getTime() - Date.now()) / 86_400_000);
}

function taskStatus(status: RawTask["status"]): TaskSummaryVM["status"] {
  if (status === "in_progress") return "in-progress";
  if (status === "complete") return "complete";
  if (status === "upcoming") return "preparing";
  return "scheduled";
}

function taskPriority(task: RawTask): TaskSummaryVM["priority"] {
  if (task.status === "complete") return "low";
  const remaining = dueInDays(task.official_due_date);
  if (remaining <= 7) return "critical";
  if (remaining <= 14) return "high";
  return "normal";
}

function adaptTask(task: RawTask): TaskSummaryVM {
  return {
    id: task.id,
    seriesId: task.id,
    title: task.title,
    nextAction: task.rationale || "업무 상세와 체크리스트를 확인하세요.",
    category: task.category,
    status: taskStatus(task.status),
    priority: taskPriority(task),
    dates: {
      recommendedStart: task.recommended_start_date,
      officialDue: task.official_due_date,
      previousActual: task.previous_actual_date,
      dueInDays: dueInDays(task.official_due_date),
    },
    checklistDone: task.checklist_done,
    checklistTotal: task.checklist_total,
    evidenceState: "review-required",
    version: 1,
  };
}

function safeExternalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function adaptEvidence(taskId: string, item: RawTaskDetail["evidence_chain"][number], index: number): EvidenceVM {
  const url = safeExternalUrl(item.url);
  return {
    id: `${taskId}:evidence:${index + 1}`,
    documentId: null,
    source: item.source_type === "school_case" ? "school-case" : "official",
    title: item.title,
    documentNumber: null,
    issuer: null,
    issuedAt: null,
    effectiveAt: null,
    pageRange: null,
    versionLabel: null,
    verifiedAt: null,
    verifiedBy: null,
    state: "review-required",
    rationale: item.detail,
    originalAvailable: Boolean(url),
    url,
  };
}

function adaptNote(note: RawExperienceNote): ExperienceNotesVM["items"][number] {
  return {
    id: note.id,
    taskId: note.task_id,
    academicYear: note.academic_year,
    text: note.body,
    authorLabel: note.author_display,
    visibility: note.visibility === "organization" ? "school" : note.visibility,
    approval: note.visibility === "organization" ? "review-required" : "draft",
    reviewedAt: null,
    version: 1,
  };
}

function notificationType(kind: RawNotification["kind"]): NotificationCenterVM["items"][number]["type"] {
  return {
    due: "official-due",
    prep: "recommended-start",
    doc: "new-document",
    evidence_update: "evidence-updated",
    analysis_complete: "analysis-complete",
  }[kind] as NotificationCenterVM["items"][number]["type"];
}

function uploadState(record: RawUploadRecord): UploadAnalysisVM["state"] {
  if (record.status === "failed") return "failed";
  if (record.status === "indexed") return "complete";
  if (record.status === "analyzed") return "partial";
  return "analyzing";
}

function uploadProgress(record: RawUploadRecord): number {
  if (record.status === "failed") return 100;
  if (record.status === "indexed") return 100;
  if (record.status === "analyzed") return 85;
  return 55;
}

export function createBackendApi(): FrontendApiService {
  let activeAssignmentId = "";
  let sessionVersion = 1;
  const sessionEpoch = crypto.randomUUID();
  const knownAssignments = new Set<string>();
  const uploadCandidates = new Map<string, UploadPrepareRequest["files"]>();
  const uploadRecords = new Map<string, RawUploadRecord[]>();

  function assertContext(context: RequestContext) {
    if (!knownAssignments.has(context.assignmentId) || context.assignmentId !== activeAssignmentId) {
      throw new BackendApiError(403, "ASSIGNMENT_CONTEXT_INVALID", "현재 담당 업무 맥락과 일치하지 않는 요청을 차단했습니다.");
    }
  }

  async function loadAssignments(signal?: AbortSignal): Promise<RawAssignments> {
    const result = await requestJson("/api/frontend/assignments", RawAssignmentsResponseSchema, { signal });
    knownAssignments.clear();
    result.items.forEach((item) => knownAssignments.add(item.id));
    if (!activeAssignmentId || !knownAssignments.has(activeAssignmentId)) activeAssignmentId = result.items[0]?.id ?? "";
    return result;
  }

  function sessionFrom(assignments: RawAssignments): SessionContextVM {
    const active = assignments.items.find((item) => item.id === activeAssignmentId) ?? assignments.items[0];
    if (!active) throw new BackendApiError(500, "ASSIGNMENT_MISSING", "백엔드에 담당 업무가 없습니다.");
    activeAssignmentId = active.id;
    return {
      status: "ready",
      version: sessionVersion,
      user: { id: "backend-demo-user", displayName: "해커톤 데모 사용자", roleLabel: "인증 미연결 백엔드 세션" },
      school: { id: assignments.school.id, name: assignments.school.name },
      assignments: assignments.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.note ?? `${assignments.school.academic_year}학년도 담당 업무`,
        taskCount: item.task_count,
        active: item.id === active.id,
      })),
      activeAssignmentId: active.id,
      context: { userId: "backend-demo-user", schoolId: assignments.school.id, assignmentId: active.id, sessionEpoch },
      boundary: {
        mode: "real",
        contractStatus: "CONFIRMED",
        contractRevision: "fastapi-0.2.0@70354ff",
        persistence: "server",
        label: "실 API · 인증 미연결 데모",
      },
    };
  }

  async function loadTasks(context: RequestContext, signal?: AbortSignal): Promise<RawTask[]> {
    assertContext(context);
    const result = await requestJson("/api/frontend/tasks", RawTasksResponseSchema, { signal });
    return result.items.filter((task) => task.assignment_id === context.assignmentId);
  }

  async function loadNotes(context: RequestContext, signal?: AbortSignal): Promise<ExperienceNotesVM> {
    assertContext(context);
    const result = await requestJson("/api/frontend/experience-notes", RawExperienceNotesResponseSchema, { signal });
    const items = result.items.map(adaptNote);
    return { status: items.length ? "ready" : "empty", items, nextCursor: null, total: items.length };
  }

  async function loadNotifications(context: RequestContext, signal?: AbortSignal): Promise<NotificationCenterVM> {
    assertContext(context);
    const result = await requestJson("/api/frontend/notifications", RawNotificationsResponseSchema, { signal });
    const items = result.items.map((item) => ({
      id: item.id,
      type: notificationType(item.kind),
      title: item.title,
      occurredAt: item.message,
      read: !item.is_new,
      target: item.related_task_id ? `/tasks/${encodeURIComponent(item.related_task_id)}` : null,
    }));
    return { status: items.length ? "ready" : "empty", items, unread: items.filter((item) => !item.read).length, nextCursor: null };
  }

  async function taskDetail(context: RequestContext, taskId: string, signal?: AbortSignal): Promise<TaskDetailVM> {
    assertContext(context);
    const [rawDetail, tasks, notes] = await Promise.all([
      requestJson(`/api/frontend/task-details/${encodeURIComponent(taskId)}`, RawTaskDetailSchema, { signal }),
      loadTasks(context, signal),
      loadNotes(context, signal),
    ]);
    const task = tasks.find((item) => item.id === taskId);
    if (!task) throw new BackendApiError(404, "task_not_found", "요청한 업무를 찾을 수 없습니다.");
    return {
      status: "ready",
      task: adaptTask(task),
      checklist: rawDetail.checklist.map((item, index) => ({ id: item.id, label: item.text, note: item.note || null, complete: item.done, order: index + 1, version: 1 })),
      evidence: rawDetail.evidence_chain.map((item, index) => adaptEvidence(taskId, item, index)),
      previousActivities: rawDetail.previous_timeline.map((item, index) => ({ id: `${taskId}:activity:${index + 1}`, type: "changed", occurredAt: `${item.date}T00:00:00+09:00`, label: item.event })),
      experienceNotes: notes.items.filter((item) => item.taskId === taskId),
    };
  }

  const api: FrontendApiService = {
    contractStatus: "CONFIRMED",
    async getSession(options = {}) {
      return sessionFrom(await loadAssignments(options.signal));
    },
    async setActiveAssignment(assignmentId: string, mutation: VersionedMutation) {
      const assignments = await loadAssignments(mutation.signal);
      if (!assignments.items.some((item) => item.id === assignmentId)) {
        throw new BackendApiError(403, "ASSIGNMENT_NOT_ALLOWED", "백엔드가 제공하지 않은 담당 업무는 선택할 수 없습니다.");
      }
      activeAssignmentId = assignmentId;
      sessionVersion += 1;
      return sessionFrom(assignments);
    },
    async getHome(context, options = {}) {
      const raw = await loadTasks(context, options.signal);
      const items = raw.map(adaptTask);
      const urgent = items.filter((task) => task.status === "in-progress" && task.dates.dueInDays <= 10);
      const upcoming = items.filter((task) => task.status === "preparing" || task.status === "scheduled");
      return {
        status: items.length ? "ready" : "empty",
        generatedAt: isoNow(),
        context,
        primaryTask: urgent[0] ?? items.find((task) => task.status === "in-progress") ?? items[0] ?? null,
        urgent,
        thisMonth: items,
        nextThirtyDays: upcoming,
        summaries: [],
      };
    },
    async getAnnualMap(context, query: ListQuery) {
      const academicYear = Number(query.filter?.academicYear ?? new Date().getFullYear());
      const items = (await loadTasks(context, query.signal)).map((task, index, all) => ({
        ...adaptTask(task),
        academicYear,
        monthStart: task.timeline_month_start,
        monthEnd: task.timeline_month_end,
        previousTaskId: index > 0 ? all[index - 1].id : null,
        nextTaskId: index + 1 < all.length ? all[index + 1].id : null,
      }));
      return { status: items.length ? "ready" : "empty", academicYear, activeMonth: new Date().getMonth(), items, nextCursor: null };
    },
    async getTaskDetail(context, taskId, options = {}) {
      return taskDetail(context, taskId, options.signal);
    },
    async updateChecklist(context, mutation: ChecklistMutation) {
      assertContext(context);
      await requestJson(
        `/api/frontend/task-details/${encodeURIComponent(mutation.taskId)}/checklist/${encodeURIComponent(mutation.itemId)}`,
        RawTaskDetailSchema,
        { method: "POST", body: JSON.stringify({ done: mutation.complete }), signal: mutation.signal },
      );
      return taskDetail(context, mutation.taskId, mutation.signal);
    },
    async listDocuments(context, query: ListQuery): Promise<DocumentListVM> {
      assertContext(context);
      const [documents, tasks] = await Promise.all([
        requestJson("/api/frontend/documents", RawDocumentsResponseSchema, { signal: query.signal }),
        loadTasks(context, query.signal),
      ]);
      const taskIds = new Map(tasks.map((task) => [task.title, task.id]));
      const normalized = query.query?.trim().toLocaleLowerCase("ko") ?? "";
      const items = documents.items
        .filter((item) => !normalized || `${item.title} ${item.document_number} ${item.related_task_title}`.toLocaleLowerCase("ko").includes(normalized))
        .map((item: RawDocument) => ({
          id: item.id,
          title: item.title,
          documentNumber: item.document_number,
          relatedTaskId: taskIds.get(item.related_task_title) ?? null,
          relatedTaskTitle: item.related_task_title,
          date: item.issued_at,
          source: item.source_type === "school_case" ? "school-case" as const : "official" as const,
          analysisState: item.analysis_status === "pending" ? "processing" as const : item.analysis_status,
          evidenceState: item.verification_status === "verified" ? "verified" as const : item.verification_status === "none" ? "missing" as const : "review-required" as const,
        }));
      return { status: items.length ? "ready" : normalized ? "no-result" : "empty", items, nextCursor: null, total: items.length, asOf: isoNow() };
    },
    async search(context, query: ListQuery) {
      const normalized = query.query?.trim().toLocaleLowerCase("ko") ?? "";
      const [tasks, documents, notes] = await Promise.all([
        loadTasks(context, query.signal),
        api.listDocuments(context, { signal: query.signal }),
        loadNotes(context, query.signal),
      ]);
      const items = [
        ...tasks.filter((item) => `${item.title} ${item.category}`.toLocaleLowerCase("ko").includes(normalized)).map((item) => ({ id: item.id, type: "task" as const, title: item.title, description: item.category, source: null, target: `/tasks/${encodeURIComponent(item.id)}` })),
        ...documents.items.filter((item) => `${item.title} ${item.documentNumber}`.toLocaleLowerCase("ko").includes(normalized)).map((item) => ({ id: item.id, type: "document" as const, title: item.title, description: item.documentNumber, source: item.source, target: "/docs" })),
        ...notes.items.filter((item) => item.text.toLocaleLowerCase("ko").includes(normalized)).map((item) => ({ id: item.id, type: "experience" as const, title: item.text.slice(0, 60), description: item.authorLabel, source: "experience" as const, target: "/notes" })),
      ].slice(0, query.limit ?? 8);
      return { status: items.length ? "ready" : "no-result", query: query.query ?? "", items, nextCursor: null, total: items.length };
    },
    async listExperienceNotes(context, query: ListQuery) {
      const result = await loadNotes(context, query.signal);
      const normalized = query.query?.trim().toLocaleLowerCase("ko") ?? "";
      const items = result.items.filter((item) => !normalized || `${item.text} ${item.authorLabel}`.toLocaleLowerCase("ko").includes(normalized));
      return { ...result, status: items.length ? "ready" : normalized ? "no-result" : "empty", items, total: items.length };
    },
    async createExperienceNote(context, mutation: ExperienceNoteCreate) {
      assertContext(context);
      await requestJson("/api/frontend/experience-notes", RawExperienceNoteSchema, {
        method: "POST",
        signal: mutation.signal,
        body: JSON.stringify({ task_id: mutation.taskId, visibility: mutation.visibility === "school" ? "organization" : mutation.visibility, body: mutation.text }),
      });
      return loadNotes(context, mutation.signal);
    },
    async updateExperienceNote(_context, _mutation: ExperienceNoteUpdate) {
      return unavailable("경험 메모 수정");
    },
    async deleteExperienceNote(_context, _mutation: ExperienceNoteDelete) {
      return unavailable("경험 메모 삭제");
    },
    async getHandoverPreview(context, academicYear, options = {}): Promise<HandoverPreviewVM> {
      const [tasks, detailNotes] = await Promise.all([loadTasks(context, options.signal), loadNotes(context, options.signal)]);
      const annualFlow = tasks.map(adaptTask);
      return {
        status: annualFlow.length ? "partial" : "empty",
        academicYear,
        generatedFromVersion: sessionVersion,
        annualFlow,
        incomplete: annualFlow.filter((task) => task.status !== "complete"),
        evidence: [],
        notes: detailNotes.items,
        issue: { code: "HANDOVER_DERIVED", title: "실제 데이터 기반 미리보기", userMessage: "전용 인수인계 API가 없어 실제 업무와 메모 응답으로 구성했습니다.", retryable: false, recoveryAction: "none" },
      };
    },
    async prepareUpload(context, request: UploadPrepareRequest) {
      assertContext(context);
      const jobId = `upload:${crypto.randomUUID()}`;
      uploadCandidates.set(jobId, request.files);
      uploadRecords.set(jobId, []);
      return {
        status: "ready",
        jobId,
        state: "ready",
        progress: 0,
        files: request.files.map((file) => ({ id: file.clientId, name: file.name, sizeBytes: file.sizeBytes, state: "ready", progress: 0 })),
        drafts: [],
      };
    },
    async transferUploadFile(context, request: UploadTransferRequest) {
      assertContext(context);
      const candidate = uploadCandidates.get(request.uploadId)?.find((item) => item.clientId === request.clientFileId);
      if (!candidate) throw new BackendApiError(422, "UPLOAD_CANDIDATE_MISSING", "업로드 준비 목록에 없는 파일입니다.");
      const form = new FormData();
      form.append("file", request.body, candidate.name);
      const record = await requestJson("/api/frontend/uploads", RawUploadRecordSchema, { method: "POST", body: form, signal: request.signal });
      uploadRecords.set(request.uploadId, [...(uploadRecords.get(request.uploadId) ?? []), record]);
      request.onProgress?.(candidate.sizeBytes, candidate.sizeBytes);
      const state = uploadState(record);
      return {
        status: state === "failed" ? "server-error" : "partial",
        jobId: request.uploadId,
        state,
        progress: uploadProgress(record),
        files: [{ id: record.id, name: record.filename, sizeBytes: record.size, state, progress: uploadProgress(record), ...(state === "failed" ? { issue: { code: "UPLOAD_PROCESSING_FAILED", title: "파일 처리 실패", userMessage: record.note, retryable: true, recoveryAction: "retry" as const } } : {}) }],
        drafts: [],
      };
    },
    async createAnalysisJob(context, request: IdempotentMutation & { readonly uploadId: string }) {
      assertContext(context);
      const records = uploadRecords.get(request.uploadId) ?? [];
      const latest = records[records.length - 1];
      if (!latest) throw new BackendApiError(422, "UPLOAD_REQUIRED", "분석을 시작할 업로드 파일이 없습니다.");
      const state = uploadState(latest);
      return { status: state === "failed" ? "server-error" : "partial", jobId: request.uploadId, state, progress: uploadProgress(latest), files: records.map((record) => ({ id: record.id, name: record.filename, sizeBytes: record.size, state: uploadState(record), progress: uploadProgress(record) })), drafts: [] };
    },
    async getNotifications(context, query: ListQuery) {
      return loadNotifications(context, query.signal);
    },
    async markNotificationRead(context, mutation: NotificationReadMutation) {
      assertContext(context);
      await requestJson("/api/frontend/notifications/read", RawNotificationsReadSchema, { method: "POST", signal: mutation.signal, body: JSON.stringify({ ids: [mutation.notificationId], all: false }) });
      return loadNotifications(context, mutation.signal);
    },
    async markAllNotificationsRead(context, mutation: VersionedMutation) {
      assertContext(context);
      await requestJson("/api/frontend/notifications/read", RawNotificationsReadSchema, { method: "POST", signal: mutation.signal, body: JSON.stringify({ ids: [], all: true }) });
      return loadNotifications(context, mutation.signal);
    },
    async getAnalysisJob(context, _jobId, options = {}) {
      assertContext(context);
      const result = await requestJson("/api/frontend/uploads", RawUploadsResponseSchema, { signal: options.signal });
      const latest = result.items[0];
      const state = latest ? uploadState(latest) : "idle";
      return { status: result.items.length ? "partial" : "empty", jobId: null, state, progress: latest ? uploadProgress(latest) : 0, files: result.items.map((record) => ({ id: record.id, name: record.filename, sizeBytes: record.size, state: uploadState(record), progress: uploadProgress(record) })), drafts: [] };
    },
    async cancelAnalysisJob(_context, _mutation: AnalysisJobMutation) { return unavailable("분석 취소"); },
    async retryAnalysisItem(_context, _mutation) { return unavailable("분석 항목 재시도"); },
    async reviewAnalysisDraft(_context, _mutation) { return unavailable("분석 초안 검토"); },
    async deleteAnalysisItem(_context, _mutation) { return unavailable("분석 항목 삭제"); },
    async queryAssistant(context, request: AssistantQuery): Promise<AssistantVM> {
      assertContext(context);
      const result = await requestJson("/api/v1/query", RawAssistantAnswerSchema, {
        method: "POST",
        signal: request.signal,
        body: JSON.stringify({ query: request.question, workflow_id: request.taskId || null }),
      });
      return {
        status: "ready",
        answer: result.message,
        citations: result.data.documents.map((document) => ({ claimStart: null, claimEnd: null, evidenceId: document.chunk_id ?? document.document_id, documentId: document.document_id, page: document.page === null ? null : String(document.page), title: document.title })),
        grounding: result.data.documents.length ? "grounded" : "unsupported",
        requiresHumanReview: true,
      };
    },
    async createTask(context, mutation: TaskCreateMutation) {
      assertContext(context);
      const task = await requestJson("/api/frontend/tasks", RawTaskSchema, {
        method: "POST",
        signal: mutation.signal,
        body: JSON.stringify({ title: mutation.title, start_date: mutation.startDate || null, due_date: mutation.dueDate || null, category: mutation.category || null, memo: mutation.memo || null }),
      });
      return adaptTask(task);
    },
    async logout() {
      return unavailable("로그아웃");
    },
  };
  return api;
}
