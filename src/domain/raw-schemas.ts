/**
 * Backend DTO shape (as if from a real service OpenAPI) — snake_case.
 * These schemas are the runtime validation boundary: mock JSON (or a future
 * real API response) must pass this before it is trusted anywhere else in
 * the app. See docs/requirements-traceability-design.md §5 for the
 * "Backend DTO -> runtime schema -> adapter -> frontend domain" boundary
 * this project must keep even without a real backend.
 */
import { z } from "zod";

export const RawSchoolSchema = z.object({
  id: z.string(),
  name: z.string(),
  academic_year: z.number(),
});

export const RawAssignmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  active_from: z.string(),
  status: z.enum(["server_allowed", "proposed_by_school"]),
  note: z.string().optional(),
  task_count: z.number(),
});

export const RawAssignmentsResponseSchema = z.object({
  school: RawSchoolSchema,
  items: z.array(RawAssignmentSchema),
});

export const RawTaskStatusSchema = z.enum(["in_progress", "upcoming", "planned", "complete"]);

export const RawTaskSchema = z.object({
  id: z.string(),
  assignment_id: z.string(),
  title: z.string(),
  category: z.string(),
  status: RawTaskStatusSchema,
  recommended_start_date: z.string(),
  official_due_date: z.string(),
  previous_actual_date: z.string(),
  checklist_done: z.number(),
  checklist_total: z.number(),
  timeline_month_start: z.number(),
  timeline_month_end: z.number(),
  rationale: z.string(),
});

export const RawTasksResponseSchema = z.object({
  items: z.array(RawTaskSchema),
});

export const RawFeedItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  issuer: z.string(),
  received_at: z.string(),
  hint: z.string(),
  related_task_id: z.string().nullable(),
});
export const RawFeedResponseSchema = z.object({ items: z.array(RawFeedItemSchema) });

export const RawSourceTypeSchema = z.enum(["official", "school_case"]);
export const RawAnalysisStatusSchema = z.enum(["complete", "pending", "partial"]);
export const RawVerificationStatusSchema = z.enum(["verified", "needs_review", "none"]);

export const RawDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  document_number: z.string(),
  source_type: RawSourceTypeSchema,
  related_task_title: z.string(),
  issued_at: z.string(),
  analysis_status: RawAnalysisStatusSchema,
  verification_status: RawVerificationStatusSchema,
});
export const RawDocumentsResponseSchema = z.object({ items: z.array(RawDocumentSchema) });

export const RawNoteVisibilitySchema = z.enum(["private", "handover", "organization"]);
export const RawExperienceNoteSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  task_title: z.string(),
  academic_year: z.number(),
  author_display: z.string(),
  is_mine: z.boolean(),
  visibility: RawNoteVisibilitySchema,
  body: z.string(),
});
export const RawExperienceNotesResponseSchema = z.object({ items: z.array(RawExperienceNoteSchema) });

export const RawNotificationKindSchema = z.enum(["due", "prep", "doc", "evidence_update", "analysis_complete"]);
export const RawNotificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  message: z.string(),
  kind: RawNotificationKindSchema,
  is_new: z.boolean(),
  related_task_id: z.string().nullable(),
});
export const RawNotificationsResponseSchema = z.object({ items: z.array(RawNotificationSchema) });

export const RawChecklistItemSchema = z.object({
  id: z.string(),
  text: z.string(),
  note: z.string(),
  done: z.boolean(),
});

export const RawEvidenceLinkSchema = z.object({
  level: z.string(),
  title: z.string(),
  detail: z.string(),
  source_type: RawSourceTypeSchema,
  // 근거 법령의 law.go.kr 한글주소처럼 바깥으로 여는 링크.
  // optional: 백엔드는 값이 없으면 키를 아예 보내지 않는다 (null 아님).
  url: z.string().optional(),
});

export const RawTimelineEventSchema = z.object({
  date: z.string(),
  event: z.string(),
});

export const RawFormRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  meta: z.string(),
});

export const RawTaskDetailSchema = z.object({
  task_id: z.string(),
  checklist: z.array(RawChecklistItemSchema),
  evidence_chain: z.array(RawEvidenceLinkSchema),
  previous_timeline: z.array(RawTimelineEventSchema),
  related_forms: z.array(RawFormRefSchema),
  guideline_change_notice: z.string().optional(),
});

/**
 * F14 업무 도우미 — 백엔드 POST /api/v1/query 응답 중 패널이 쓰는 부분.
 * 전체 계약은 docs/API.md. zod 는 모르는 키를 조용히 버리므로 여기 없는
 * 필드(workflow, next_actions 등)는 무시된다.
 */
export const RawAssistantSourceSchema = z.object({
  document_id: z.string(),
  chunk_id: z.string().nullable(),
  title: z.string(),
  page: z.number().nullable(),
  snippet: z.string().nullable(),
  relevance: z.number(),
});
export const RawAssistantTimelineSchema = z.object({
  title: z.string(),
  date: z.string().nullable(),
  kind: z.string(),
  audience: z.string().nullable(),
});
export const RawAssistantAnswerSchema = z.object({
  query_id: z.string(),
  message: z.string(),
  data: z.object({
    documents: z.array(RawAssistantSourceSchema),
    timeline: z.array(RawAssistantTimelineSchema),
  }),
});

/** 저장(변경) 응답들 — docs/BACKEND_INTEGRATION.md */
export const RawNotificationsReadSchema = z.object({ marked: z.number() });
export const RawUploadRecordSchema = z.object({
  id: z.string(),
  filename: z.string(),
  size: z.number(),
  uploaded_at: z.string(),
  status: z.literal("received"),
  note: z.string(),
});

export type RawUploadRecord = z.infer<typeof RawUploadRecordSchema>;
export type RawAssistantAnswer = z.infer<typeof RawAssistantAnswerSchema>;
export type RawTaskDetail = z.infer<typeof RawTaskDetailSchema>;
export type RawTask = z.infer<typeof RawTaskSchema>;
export type RawAssignment = z.infer<typeof RawAssignmentSchema>;
export type RawDocument = z.infer<typeof RawDocumentSchema>;
export type RawExperienceNote = z.infer<typeof RawExperienceNoteSchema>;
export type RawNotification = z.infer<typeof RawNotificationSchema>;
export type RawFeedItem = z.infer<typeof RawFeedItemSchema>;
