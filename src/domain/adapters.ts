/**
 * Raw DTO (snake_case, validated) -> frontend domain (camelCase).
 * This is the one place field-name/shape translation happens, so screens
 * never see backend wire format and a real backend swap only touches here.
 */
import type {
  RawAssistantAnswer,
  RawAssignment,
  RawDocument,
  RawExperienceNote,
  RawFeedItem,
  RawNotification,
  RawTask,
  RawTaskDetail,
} from "./raw-schemas";
import type {
  AssistantAnswer,
  Assignment,
  ChecklistItem,
  DocumentItem,
  EvidenceLink,
  ExperienceNote,
  FeedItem,
  FormRef,
  AppNotification,
  TaskDetail,
  TaskInstance,
  TimelineEvent,
} from "./types";

export function adaptAssignment(raw: RawAssignment): Assignment {
  return {
    id: raw.id,
    name: raw.name,
    activeFrom: raw.active_from,
    status: raw.status,
    note: raw.note,
    taskCount: raw.task_count,
  };
}

export function adaptTask(raw: RawTask): TaskInstance {
  return {
    id: raw.id,
    assignmentId: raw.assignment_id,
    title: raw.title,
    category: raw.category,
    status: raw.status,
    recommendedStartDate: raw.recommended_start_date,
    officialDueDate: raw.official_due_date,
    previousActualDate: raw.previous_actual_date,
    checklistDone: raw.checklist_done,
    checklistTotal: raw.checklist_total,
    timelineMonthStart: raw.timeline_month_start,
    timelineMonthEnd: raw.timeline_month_end,
    rationale: raw.rationale,
  };
}

export function adaptFeedItem(raw: RawFeedItem): FeedItem {
  return {
    id: raw.id,
    title: raw.title,
    issuer: raw.issuer,
    receivedAt: raw.received_at,
    hint: raw.hint,
    relatedTaskId: raw.related_task_id,
  };
}

export function adaptDocument(raw: RawDocument): DocumentItem {
  return {
    id: raw.id,
    title: raw.title,
    documentNumber: raw.document_number,
    sourceType: raw.source_type,
    relatedTaskTitle: raw.related_task_title,
    issuedAt: raw.issued_at,
    analysisStatus: raw.analysis_status,
    verificationStatus: raw.verification_status,
  };
}

export function adaptExperienceNote(raw: RawExperienceNote): ExperienceNote {
  return {
    id: raw.id,
    taskId: raw.task_id,
    taskTitle: raw.task_title,
    academicYear: raw.academic_year,
    authorDisplay: raw.author_display,
    isMine: raw.is_mine,
    visibility: raw.visibility,
    body: raw.body,
  };
}

export function adaptNotification(raw: RawNotification): AppNotification {
  return {
    id: raw.id,
    title: raw.title,
    message: raw.message,
    kind: raw.kind,
    isNew: raw.is_new,
    relatedTaskId: raw.related_task_id,
  };
}

function adaptChecklistItem(raw: RawTaskDetail["checklist"][number]): ChecklistItem {
  return { id: raw.id, text: raw.text, note: raw.note, done: raw.done };
}
function adaptEvidenceLink(raw: RawTaskDetail["evidence_chain"][number]): EvidenceLink {
  return { level: raw.level, title: raw.title, detail: raw.detail, sourceType: raw.source_type };
}
function adaptTimelineEvent(raw: RawTaskDetail["previous_timeline"][number]): TimelineEvent {
  return { date: raw.date, event: raw.event };
}
function adaptFormRef(raw: RawTaskDetail["related_forms"][number]): FormRef {
  return { id: raw.id, title: raw.title, meta: raw.meta };
}

export function adaptTaskDetail(raw: RawTaskDetail): TaskDetail {
  return {
    taskId: raw.task_id,
    checklist: raw.checklist.map(adaptChecklistItem),
    evidenceChain: raw.evidence_chain.map(adaptEvidenceLink),
    previousTimeline: raw.previous_timeline.map(adaptTimelineEvent),
    relatedForms: raw.related_forms.map(adaptFormRef),
    guidelineChangeNotice: raw.guideline_change_notice,
  };
}

export function adaptAssistantAnswer(raw: RawAssistantAnswer): AssistantAnswer {
  return {
    queryId: raw.query_id,
    message: raw.message,
    sources: raw.data.documents.map((d) => ({
      documentId: d.document_id,
      chunkId: d.chunk_id,
      title: d.title,
      page: d.page,
      snippet: d.snippet,
      relevance: d.relevance,
    })),
    timeline: raw.data.timeline.map((t) => ({
      title: t.title,
      date: t.date,
      kind: t.kind,
      audience: t.audience,
    })),
  };
}
