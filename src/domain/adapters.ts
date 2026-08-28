/**
 * UI_API_BOUNDARY_V2 view models -> final design domain model.
 * Network DTO casing and enum handling stay in src/api/adapters.js; this layer
 * adapts only the stable V2 presentation boundary to the approved UI shape.
 */
import type {
  AssignmentSummaryVM,
  DocumentRowVM,
  EvidenceVM,
  ExperienceNoteVM,
  HandoverPreviewVM,
  NotificationVM,
  RequestContext,
  SchoolSummaryVM,
  SearchResultVM,
  TaskDetailVM,
  TaskSummaryVM,
} from "@/api/ui-api-boundary-v2";
import type {
  AppNotification,
  Assignment,
  DocumentItem,
  ExperienceNote,
  HandoverPreview,
  School,
  SearchResult,
  TaskDetail,
  TaskInstance,
} from "./types";

const TASK_STATUS = {
  "in-progress": "in_progress",
  preparing: "upcoming",
  scheduled: "planned",
  complete: "complete",
} as const;

function schoolYear(now = new Date()): number {
  return now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
}

function academicMonthIndex(date: string): number {
  const month = Number(date.slice(5, 7));
  return month >= 3 ? month - 3 : month + 9;
}

export function adaptSchool(vm: SchoolSummaryVM): School {
  return { id: vm.id, name: vm.name, academicYear: schoolYear() };
}

export function adaptAssignment(vm: AssignmentSummaryVM): Assignment {
  return {
    id: vm.id,
    name: vm.name,
    activeFrom: vm.active ? "현재 선택" : "서버 허용",
    status: "server_allowed",
    note: vm.description,
    taskCount: vm.taskCount,
  };
}

export function adaptTask(vm: TaskSummaryVM, context: RequestContext): TaskInstance {
  return {
    id: vm.id,
    assignmentId: context.assignmentId,
    title: vm.title,
    category: vm.category,
    status: TASK_STATUS[vm.status],
    recommendedStartDate: vm.dates.recommendedStart,
    officialDueDate: vm.dates.officialDue,
    previousActualDate: vm.dates.previousActual,
    checklistDone: vm.checklistDone,
    checklistTotal: vm.checklistTotal,
    timelineMonthStart: academicMonthIndex(vm.dates.recommendedStart),
    timelineMonthEnd: academicMonthIndex(vm.dates.officialDue),
    rationale: vm.nextAction,
    nextAction: vm.nextAction,
    version: vm.version,
  };
}

export function adaptDocument(vm: DocumentRowVM): DocumentItem {
  const analysisStatus = vm.analysisState === "complete"
    ? "complete"
    : vm.analysisState === "partial" || vm.analysisState === "review-required"
      ? "partial"
      : "pending";
  const verificationStatus = vm.evidenceState === "verified"
    ? "verified"
    : vm.evidenceState === "missing"
      ? "none"
      : "needs_review";
  return {
    id: vm.id,
    title: vm.title,
    documentNumber: vm.documentNumber,
    sourceType: vm.source === "school-case" ? "school_case" : "official",
    relatedTaskTitle: vm.relatedTaskTitle ?? "연결된 업무 없음",
    relatedTaskId: vm.relatedTaskId,
    issuedAt: vm.date,
    analysisStatus,
    verificationStatus,
  };
}

export function adaptExperienceNote(
  vm: ExperienceNoteVM,
  taskTitles: ReadonlyMap<string, string>,
  currentUserLabel: string,
): ExperienceNote {
  return {
    id: vm.id,
    taskId: vm.taskId,
    taskTitle: taskTitles.get(vm.taskId) ?? "관련 업무",
    academicYear: vm.academicYear,
    authorDisplay: vm.authorLabel,
    isMine: vm.authorLabel === currentUserLabel || vm.authorLabel === "현재 담당자",
    visibility: vm.visibility === "school" ? "organization" : vm.visibility,
    body: vm.text,
    version: vm.version,
    approval: vm.approval,
  };
}

function adaptEvidence(vm: EvidenceVM) {
  return {
    level: vm.source === "official" ? "공식 근거" : "학교사례",
    title: vm.title,
    detail: vm.rationale,
    sourceType: vm.source === "school-case" ? "school_case" as const : "official" as const,
    documentNumber: vm.documentNumber,
    issuer: vm.issuer,
    issuedAt: vm.issuedAt,
    pageRange: vm.pageRange,
    versionLabel: vm.versionLabel,
    verifiedAt: vm.verifiedAt,
    verifiedBy: vm.verifiedBy,
    verificationState: vm.state === "review-required" ? "review-required" as const : vm.state,
    originalAvailable: vm.originalAvailable,
  };
}

export function adaptTaskDetail(vm: TaskDetailVM, context: RequestContext): TaskDetail | null {
  if (!vm.task) return null;
  const staleEvidence = vm.evidence.find((item) => item.state !== "verified");
  return {
    taskId: vm.task.id,
    task: adaptTask(vm.task, context),
    version: vm.task.version,
    checklist: vm.checklist.map((item) => ({
      id: item.id,
      text: item.label,
      note: item.note ?? "",
      done: item.complete,
      version: item.version,
    })),
    evidenceChain: vm.evidence.filter((item) => item.source !== "experience").map(adaptEvidence),
    previousTimeline: vm.previousActivities.map((item) => ({ date: item.occurredAt.slice(0, 10), event: item.label })),
    relatedForms: [],
    guidelineChangeNotice: staleEvidence
      ? `“${staleEvidence.title}” 근거는 ${staleEvidence.state === "stale" ? "재검증" : "담당자 검토"}이 필요합니다.`
      : undefined,
  };
}

const NOTIFICATION_KIND = {
  "official-due": "due",
  "recommended-start": "prep",
  "new-document": "doc",
  "evidence-updated": "evidence_update",
  "analysis-complete": "analysis_complete",
} as const;

export function adaptNotification(vm: NotificationVM): AppNotification {
  const taskMatch = vm.target?.match(/^\/tasks\/([^/?#]+)/);
  return {
    id: vm.id,
    title: vm.title,
    message: vm.occurredAt,
    kind: NOTIFICATION_KIND[vm.type],
    isNew: !vm.read,
    relatedTaskId: taskMatch?.[1] ?? null,
  };
}

export function adaptSearchResult(vm: SearchResultVM): SearchResult {
  const normalized = vm.target.startsWith("/documents") ? vm.target.replace("/documents", "/docs") : vm.target;
  const target = normalized.startsWith("/") && !normalized.startsWith("//") && !normalized.includes("\\")
    ? normalized
    : "/home";
  return { id: vm.id, type: vm.type, title: vm.title, description: vm.description, target };
}

export function adaptHandover(vm: HandoverPreviewVM, context: RequestContext): HandoverPreview {
  const taskTitles = new Map(vm.annualFlow.map((task) => [task.id, task.title]));
  return {
    academicYear: vm.academicYear,
    version: vm.generatedFromVersion,
    annualFlow: vm.annualFlow.map((task) => adaptTask(task, context)),
    incomplete: vm.incomplete.map((task) => adaptTask(task, context)),
    evidence: vm.evidence.filter((item) => item.source !== "experience").map((item) => ({
      id: item.documentId ?? item.id,
      title: item.title,
      documentNumber: item.documentNumber ?? "문서번호 없음",
    })),
    notes: vm.notes.map((note) => adaptExperienceNote(note, taskTitles, "")),
  };
}
