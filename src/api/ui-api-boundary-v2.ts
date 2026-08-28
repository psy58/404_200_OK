/**
 * UI_API_BOUNDARY_V2
 *
 * Purpose: stable, presentation-facing contract between the approved GAM UI and
 * the future FastAPI service. Network DTOs must be runtime-validated and adapted
 * before they reach these types.
 *
 * Contract status: PROPOSED. No service OpenAPI/Pydantic revision is present in
 * this repository, so endpoint paths, HTTP methods and backend enum spellings are
 * intentionally not defined here.
 *
 * Security boundary: user, school, role and assignment values in these view
 * models are display/context data only. The server session remains authoritative
 * for authentication and school -> assignment -> object -> property -> action
 * authorization.
 *
 * Related requirements: F01-F17, UI_API_BOUNDARY_V2, docs/07 API prompt.
 */

export type ContractStatus =
  | "CONFIRMED"
  | "PROPOSED"
  | "MOCK_ONLY"
  | "BACKEND_CONTRACT_REQUIRED"
  | "CONTRACT_CONFLICT";

export type ViewStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "no-result"
  | "partial"
  | "stale"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "validation-error"
  | "rate-limited"
  | "server-error"
  | "offline"
  | "disabled";

export type AsyncActionStatus =
  | "idle"
  | "submitting"
  | "success"
  | "error"
  | "conflict";

export type RecoveryAction =
  | "retry"
  | "reauthenticate"
  | "go-to-list"
  | "request-access"
  | "reload-latest"
  | "reapply"
  | "clear-filters"
  | "contact-support"
  | "none";

export interface FieldIssue {
  readonly field: string;
  readonly message: string;
}

export interface UiIssue {
  readonly code: string;
  readonly title: string;
  readonly userMessage: string;
  readonly fieldErrors?: readonly FieldIssue[];
  readonly retryable: boolean;
  readonly supportId?: string;
  readonly retryAfter?: string;
  readonly recoveryAction?: RecoveryAction;
}

export interface ExecutionBoundary {
  readonly mode: "mock" | "real";
  readonly contractStatus: ContractStatus;
  readonly contractRevision: string | null;
  readonly persistence: "session-only" | "server" | "none";
  readonly label: string;
}

export interface RequestContext {
  readonly userId: string;
  readonly schoolId: string;
  readonly assignmentId: string;
  readonly sessionEpoch: string;
}

export interface UserSummaryVM {
  readonly id: string;
  readonly displayName: string;
  readonly roleLabel: string;
}

export interface SchoolSummaryVM {
  readonly id: string;
  readonly name: string;
}

export interface AssignmentSummaryVM {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly taskCount: number;
  readonly active: boolean;
}

export interface SessionContextVM {
  readonly status: ViewStatus;
  readonly version: number;
  readonly user: UserSummaryVM;
  readonly school: SchoolSummaryVM;
  readonly assignments: readonly AssignmentSummaryVM[];
  readonly activeAssignmentId: string;
  readonly context: RequestContext;
  readonly boundary: ExecutionBoundary;
  readonly issue?: UiIssue;
}

export interface DateTripleVM {
  readonly recommendedStart: string;
  readonly officialDue: string;
  readonly previousActual: string;
  readonly dueInDays: number;
}

export type TaskStatus = "preparing" | "in-progress" | "complete" | "scheduled";
export type TaskPriority = "critical" | "high" | "normal" | "low";
export type EvidenceSource = "official" | "school-case" | "experience";
export type EvidenceState = "verified" | "review-required" | "stale" | "conflicted" | "missing";

export interface TaskSummaryVM {
  readonly id: string;
  readonly seriesId: string;
  readonly title: string;
  readonly nextAction: string;
  readonly category: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly dates: DateTripleVM;
  readonly checklistDone: number;
  readonly checklistTotal: number;
  readonly evidenceState: EvidenceState;
  readonly version: number;
}

export interface HomeSummaryLinkVM {
  readonly id: "urgent" | "preparing" | "new-documents" | "completed";
  readonly label: string;
  readonly count: number | null;
  readonly asOf: string;
  readonly target: string;
  readonly query: Readonly<Record<string, string>>;
}

export interface HomeVM {
  readonly status: ViewStatus;
  readonly generatedAt: string;
  readonly context: RequestContext;
  readonly primaryTask: TaskSummaryVM | null;
  readonly urgent: readonly TaskSummaryVM[];
  readonly thisMonth: readonly TaskSummaryVM[];
  readonly nextThirtyDays: readonly TaskSummaryVM[];
  readonly summaries: readonly HomeSummaryLinkVM[];
  readonly issue?: UiIssue;
}

export interface AnnualTaskVM extends TaskSummaryVM {
  readonly academicYear: number;
  readonly monthStart: number;
  readonly monthEnd: number;
  readonly previousTaskId: string | null;
  readonly nextTaskId: string | null;
}

export interface AnnualMapVM {
  readonly status: ViewStatus;
  readonly academicYear: number;
  readonly activeMonth: number;
  readonly items: readonly AnnualTaskVM[];
  readonly nextCursor: string | null;
  readonly issue?: UiIssue;
}

export interface ChecklistItemVM {
  readonly id: string;
  readonly label: string;
  readonly note: string | null;
  readonly complete: boolean;
  readonly order: number;
  readonly version: number;
}

export interface EvidenceVM {
  readonly id: string;
  readonly documentId: string | null;
  readonly source: EvidenceSource;
  readonly title: string;
  readonly documentNumber: string | null;
  readonly issuer: string | null;
  readonly issuedAt: string | null;
  readonly effectiveAt: string | null;
  readonly pageRange: string | null;
  readonly versionLabel: string | null;
  readonly verifiedAt: string | null;
  readonly verifiedBy: string | null;
  readonly state: EvidenceState;
  readonly rationale: string;
  readonly originalAvailable: boolean;
  readonly url?: string;
}

export interface ExperienceNoteVM {
  readonly id: string;
  readonly taskId: string;
  readonly academicYear: number;
  readonly text: string;
  readonly authorLabel: string;
  readonly visibility: "private" | "handover" | "school";
  readonly approval: "draft" | "approved" | "rejected" | "review-required";
  readonly reviewedAt: string | null;
  readonly version: number;
}

export interface ActivityVM {
  readonly id: string;
  readonly type: "started" | "completed" | "submitted" | "notified" | "changed";
  readonly occurredAt: string;
  readonly label: string;
}

export interface TaskDetailVM {
  readonly status: ViewStatus;
  readonly task: TaskSummaryVM | null;
  readonly checklist: readonly ChecklistItemVM[];
  readonly evidence: readonly EvidenceVM[];
  readonly previousActivities: readonly ActivityVM[];
  readonly experienceNotes: readonly ExperienceNoteVM[];
  readonly issue?: UiIssue;
}

export interface DocumentRowVM {
  readonly id: string;
  readonly title: string;
  readonly documentNumber: string;
  readonly relatedTaskId: string | null;
  readonly relatedTaskTitle: string | null;
  readonly date: string;
  readonly source: Exclude<EvidenceSource, "experience">;
  readonly analysisState: "waiting" | "processing" | "review-required" | "partial" | "complete" | "failed";
  readonly evidenceState: EvidenceState;
}

export interface DocumentListVM {
  readonly status: ViewStatus;
  readonly items: readonly DocumentRowVM[];
  readonly nextCursor: string | null;
  readonly total: number | null;
  readonly asOf: string;
  readonly issue?: UiIssue;
}

export interface SearchResultVM {
  readonly id: string;
  readonly type: "task" | "document" | "evidence" | "experience";
  readonly title: string;
  readonly description: string;
  readonly source: EvidenceSource | null;
  readonly target: string;
}

export interface SearchVM {
  readonly status: ViewStatus;
  readonly query: string;
  readonly items: readonly SearchResultVM[];
  readonly nextCursor: string | null;
  readonly total: number | null;
  readonly issue?: UiIssue;
}

export type AnalysisState =
  | "idle"
  | "selecting"
  | "ready"
  | "uploading"
  | "quarantined"
  | "scanning"
  | "parsing"
  | "analyzing"
  | "review-required"
  | "partial"
  | "complete"
  | "failed"
  | "cancelled"
  | "expired";

export interface AnalysisFileVM {
  readonly id: string;
  readonly name: string;
  readonly sizeBytes: number;
  readonly state: AnalysisState;
  readonly progress: number;
  readonly issue?: UiIssue;
}

export interface AnalysisDraftVM {
  readonly id: string;
  readonly title: string;
  readonly rationale: string;
  readonly citations: readonly EvidenceVM[];
  readonly approval: "draft" | "approved" | "rejected";
  readonly version: number;
}

export interface UploadAnalysisVM {
  readonly status: ViewStatus;
  readonly jobId: string | null;
  readonly state: AnalysisState;
  readonly progress: number;
  readonly files: readonly AnalysisFileVM[];
  readonly drafts: readonly AnalysisDraftVM[];
  readonly issue?: UiIssue;
}

export interface ExperienceNotesVM {
  readonly status: ViewStatus;
  readonly items: readonly ExperienceNoteVM[];
  readonly nextCursor: string | null;
  readonly total: number | null;
  readonly issue?: UiIssue;
}

export interface HandoverPreviewVM {
  readonly status: ViewStatus;
  readonly academicYear: number;
  readonly generatedFromVersion: number;
  readonly annualFlow: readonly TaskSummaryVM[];
  readonly incomplete: readonly TaskSummaryVM[];
  readonly evidence: readonly EvidenceVM[];
  readonly notes: readonly ExperienceNoteVM[];
  readonly issue?: UiIssue;
}

export interface NotificationVM {
  readonly id: string;
  readonly type: "official-due" | "recommended-start" | "new-document" | "evidence-updated" | "analysis-complete";
  readonly title: string;
  readonly occurredAt: string;
  readonly read: boolean;
  readonly target: string | null;
}

export interface NotificationCenterVM {
  readonly status: ViewStatus;
  readonly items: readonly NotificationVM[];
  readonly unread: number;
  readonly nextCursor: string | null;
  readonly issue?: UiIssue;
}

export interface CitationVM {
  readonly claimStart: number | null;
  readonly claimEnd: number | null;
  readonly evidenceId: string;
  readonly documentId: string;
  readonly page: string | null;
  readonly title?: string;
}

export interface AssistantVM {
  readonly status: ViewStatus;
  readonly answer: string;
  readonly citations: readonly CitationVM[];
  readonly grounding: "grounded" | "partial" | "unsupported";
  readonly requiresHumanReview: boolean;
  readonly issue?: UiIssue;
}

export interface ListQuery {
  readonly query?: string;
  readonly filter?: Readonly<Record<string, string>>;
  readonly sort?: string;
  readonly cursor?: string;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

export interface IdempotentMutation {
  readonly idempotencyKey: string;
  readonly signal?: AbortSignal;
}

export interface VersionedMutation extends IdempotentMutation {
  readonly expectedVersion: number;
}

export interface ChecklistMutation extends VersionedMutation {
  readonly taskId: string;
  readonly itemId: string;
  readonly complete: boolean;
}

export interface ExperienceNoteCreate extends VersionedMutation {
  readonly taskId: string;
  readonly academicYear: number;
  readonly text: string;
  readonly visibility: ExperienceNoteVM["visibility"];
}

export interface ExperienceNoteUpdate extends VersionedMutation {
  readonly taskId: string;
  readonly noteId: string;
  readonly text: string;
  readonly visibility: ExperienceNoteVM["visibility"];
}

export interface ExperienceNoteDelete extends VersionedMutation {
  readonly taskId: string;
  readonly noteId: string;
}

export interface UploadCandidate {
  readonly clientId: string;
  readonly name: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly lastModified: number;
}

export interface UploadPrepareRequest extends IdempotentMutation {
  readonly files: readonly UploadCandidate[];
}

export interface UploadTransferRequest extends IdempotentMutation {
  readonly uploadId: string;
  readonly clientFileId: string;
  readonly body: Blob;
  readonly onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}

export interface AnalysisJobMutation extends VersionedMutation {
  readonly jobId: string;
  readonly itemId?: string;
}

export interface AnalysisDraftReview extends VersionedMutation {
  readonly jobId: string;
  readonly draftId: string;
  readonly decision: "approve" | "reject";
  readonly title?: string;
  readonly rationale?: string;
}

export interface NotificationReadMutation extends VersionedMutation {
  readonly notificationId: string;
}

export interface AssistantQuery extends IdempotentMutation {
  readonly taskId: string;
  readonly question: string;
}

export interface TaskCreateMutation extends IdempotentMutation {
  readonly title: string;
  readonly startDate?: string;
  readonly dueDate?: string;
  readonly category?: string;
  readonly memo?: string;
}

/**
 * Capability interface only. A real implementation must bind every capability
 * to a confirmed OpenAPI operationId before it can issue network requests.
 */
export interface FrontendApiService {
  readonly contractStatus: ContractStatus;
  getSession(options?: { readonly signal?: AbortSignal }): Promise<SessionContextVM>;
  setActiveAssignment(assignmentId: string, mutation: VersionedMutation): Promise<SessionContextVM>;
  getHome(context: RequestContext, options?: { readonly signal?: AbortSignal }): Promise<HomeVM>;
  getAnnualMap(context: RequestContext, query: ListQuery): Promise<AnnualMapVM>;
  getTaskDetail(context: RequestContext, taskId: string, options?: { readonly signal?: AbortSignal }): Promise<TaskDetailVM>;
  updateChecklist(context: RequestContext, mutation: ChecklistMutation): Promise<TaskDetailVM>;
  listDocuments(context: RequestContext, query: ListQuery): Promise<DocumentListVM>;
  search(context: RequestContext, query: ListQuery): Promise<SearchVM>;
  listExperienceNotes(context: RequestContext, query: ListQuery): Promise<ExperienceNotesVM>;
  createExperienceNote(context: RequestContext, mutation: ExperienceNoteCreate): Promise<ExperienceNotesVM>;
  updateExperienceNote(context: RequestContext, mutation: ExperienceNoteUpdate): Promise<ExperienceNotesVM>;
  deleteExperienceNote(context: RequestContext, mutation: ExperienceNoteDelete): Promise<ExperienceNotesVM>;
  getHandoverPreview(context: RequestContext, academicYear: number, options?: { readonly signal?: AbortSignal }): Promise<HandoverPreviewVM>;
  prepareUpload(context: RequestContext, request: UploadPrepareRequest): Promise<UploadAnalysisVM>;
  transferUploadFile(context: RequestContext, request: UploadTransferRequest): Promise<UploadAnalysisVM>;
  createAnalysisJob(context: RequestContext, request: IdempotentMutation & { readonly uploadId: string }): Promise<UploadAnalysisVM>;
  getNotifications(context: RequestContext, query: ListQuery): Promise<NotificationCenterVM>;
  markNotificationRead(context: RequestContext, mutation: NotificationReadMutation): Promise<NotificationCenterVM>;
  markAllNotificationsRead(context: RequestContext, mutation: VersionedMutation): Promise<NotificationCenterVM>;
  getAnalysisJob(context: RequestContext, jobId: string, options?: { readonly signal?: AbortSignal }): Promise<UploadAnalysisVM>;
  cancelAnalysisJob(context: RequestContext, mutation: AnalysisJobMutation): Promise<UploadAnalysisVM>;
  retryAnalysisItem(context: RequestContext, mutation: AnalysisJobMutation & { readonly itemId: string }): Promise<UploadAnalysisVM>;
  reviewAnalysisDraft(context: RequestContext, mutation: AnalysisDraftReview): Promise<UploadAnalysisVM>;
  deleteAnalysisItem(context: RequestContext, mutation: AnalysisJobMutation & { readonly itemId: string }): Promise<UploadAnalysisVM>;
  queryAssistant(context: RequestContext, request: AssistantQuery): Promise<AssistantVM>;
  createTask(context: RequestContext, mutation: TaskCreateMutation): Promise<TaskSummaryVM>;
  logout(options?: { readonly signal?: AbortSignal }): Promise<void>;
}
