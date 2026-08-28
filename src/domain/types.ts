/**
 * Frontend domain model — camelCase, UI-facing. Never constructed directly
 * from raw JSON; always produced by domain/adapters.ts after the V2 runtime
 * boundary has validated and normalized the network/mock DTO.
 */

export type TaskStatus = "in_progress" | "upcoming" | "planned" | "complete";
export type SourceType = "official" | "school_case" | "experience";
export type AnalysisStatus = "complete" | "pending" | "partial";
export type VerificationStatus = "verified" | "needs_review" | "none";
export type NoteVisibility = "private" | "handover" | "organization";
export type NotificationKind = "due" | "prep" | "doc" | "evidence_update" | "analysis_complete";
export type AssignmentStatus = "server_allowed" | "proposed_by_school";

export interface School {
  id: string;
  name: string;
  academicYear: number;
}

export interface Assignment {
  id: string;
  name: string;
  activeFrom: string;
  status: AssignmentStatus;
  note?: string;
  taskCount: number;
}

export interface TaskInstance {
  id: string;
  assignmentId: string;
  title: string;
  category: string;
  status: TaskStatus;
  recommendedStartDate: string;
  officialDueDate: string;
  previousActualDate: string;
  checklistDone: number;
  checklistTotal: number;
  timelineMonthStart: number;
  timelineMonthEnd: number;
  rationale: string;
  nextAction: string;
  version: number;
}

export interface FeedItem {
  id: string;
  title: string;
  issuer: string;
  receivedAt: string;
  hint: string;
  relatedTaskId: string | null;
}

export interface DocumentItem {
  id: string;
  title: string;
  documentNumber: string;
  sourceType: Exclude<SourceType, "experience">;
  relatedTaskTitle: string;
  relatedTaskId: string | null;
  issuedAt: string;
  analysisStatus: AnalysisStatus;
  verificationStatus: VerificationStatus;
}

export interface ExperienceNote {
  id: string;
  taskId: string;
  taskTitle: string;
  academicYear: number;
  authorDisplay: string;
  isMine: boolean;
  visibility: NoteVisibility;
  body: string;
  version: number;
  approval: "draft" | "approved" | "rejected" | "review-required";
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  kind: NotificationKind;
  isNew: boolean;
  relatedTaskId: string | null;
}

export interface ChecklistItem {
  id: string;
  text: string;
  note: string;
  done: boolean;
  version: number;
}

export interface EvidenceLink {
  level: string;
  title: string;
  detail: string;
  sourceType: Exclude<SourceType, "experience">;
}

export interface TimelineEvent {
  date: string;
  event: string;
}

export interface FormRef {
  id: string;
  title: string;
  meta: string;
}

export interface TaskDetail {
  taskId: string;
  version: number;
  checklist: ChecklistItem[];
  evidenceChain: EvidenceLink[];
  previousTimeline: TimelineEvent[];
  relatedForms: FormRef[];
  guidelineChangeNotice?: string;
}

export interface SearchResult {
  id: string;
  type: "task" | "document" | "evidence" | "experience";
  title: string;
  description: string;
  target: string;
}

export interface HandoverPreview {
  academicYear: number;
  version: number;
  annualFlow: TaskInstance[];
  incomplete: TaskInstance[];
  evidence: { id: string; title: string; documentNumber: string }[];
  notes: ExperienceNote[];
}

/** Common screen state per docs/03 §8.2, §11 — every P0 screen implements this. */
export type ViewStatus =
  | "loading"
  | "ready"
  | "empty"
  | "no-result"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "server-error";

/** Non-2xx failure shape a UI can render without leaking raw HTTP detail. */
export interface UiIssue {
  code: string;
  title: string;
  userMessage: string;
  retryable: boolean;
}
