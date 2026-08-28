/**
 * MOCK_ONLY DTO -> UI_API_BOUNDARY_V2 view-model adapters.
 *
 * This is the single casing/enum translation point. Presentation code must not
 * consume snake_case transport payloads directly.
 */

const taskStatus = Object.freeze({
  preparing: "preparing",
  in_progress: "in-progress",
  complete: "complete",
  scheduled: "scheduled",
});

const evidenceSource = Object.freeze({
  official: "official",
  school_case: "school-case",
  experience: "experience",
});

const evidenceState = Object.freeze({
  verified: "verified",
  review_required: "review-required",
  stale: "stale",
  conflicted: "conflicted",
  missing: "missing",
});

export function adaptTaskSummary(dto) {
  return Object.freeze({
    id: dto.id,
    seriesId: dto.series_id,
    title: dto.title,
    nextAction: dto.next_action,
    category: dto.category,
    status: taskStatus[dto.status],
    priority: dto.priority,
    dates: Object.freeze({
      recommendedStart: dto.dates.recommended_start,
      officialDue: dto.dates.official_due,
      previousActual: dto.dates.previous_actual,
      dueInDays: dto.dates.due_in_days,
    }),
    checklistDone: dto.checklist_done,
    checklistTotal: dto.checklist_total,
    evidenceState: evidenceState[dto.evidence_state],
    version: dto.version,
  });
}

function adaptContext(dto) {
  return Object.freeze({
    userId: dto.user_id,
    schoolId: dto.school_id,
    assignmentId: dto.assignment_id,
    sessionEpoch: dto.session_epoch,
  });
}

export function adaptSession(dto) {
  return Object.freeze({
    status: "ready",
    version: dto.session.version,
    user: Object.freeze({
      id: dto.session.user.id,
      displayName: dto.session.user.display_name,
      roleLabel: dto.session.user.role_label,
    }),
    school: Object.freeze({ id: dto.session.school.id, name: dto.session.school.name }),
    assignments: Object.freeze(dto.session.assignments.map((assignment) => Object.freeze({
      id: assignment.id,
      name: assignment.name,
      description: assignment.description,
      taskCount: assignment.task_count,
      active: assignment.active,
    }))),
    activeAssignmentId: dto.session.active_assignment_id,
    context: Object.freeze({
      userId: dto.session.user.id,
      schoolId: dto.session.school.id,
      assignmentId: dto.session.active_assignment_id,
      sessionEpoch: dto.session.session_epoch,
    }),
    boundary: Object.freeze({
      mode: "mock",
      contractStatus: "MOCK_ONLY",
      contractRevision: dto.schema_version,
      persistence: "session-only",
      label: dto.execution_boundary.label,
    }),
  });
}

export function adaptHome(dto) {
  return Object.freeze({
    status: dto.primary_task === null && dto.urgent.length === 0 ? "empty" : "ready",
    generatedAt: dto.generated_at,
    context: adaptContext(dto.context),
    primaryTask: dto.primary_task === null ? null : adaptTaskSummary(dto.primary_task),
    urgent: Object.freeze(dto.urgent.map(adaptTaskSummary)),
    thisMonth: Object.freeze(dto.this_month.map(adaptTaskSummary)),
    nextThirtyDays: Object.freeze(dto.next_thirty_days.map(adaptTaskSummary)),
    summaries: Object.freeze(dto.summary_links.map((summary) => Object.freeze({
      id: summary.id.replaceAll("_", "-"),
      label: summary.label,
      count: summary.count,
      asOf: summary.as_of,
      target: summary.target,
      query: Object.freeze({ ...summary.query }),
    }))),
  });
}

function adaptEvidence(dto) {
  return Object.freeze({
    id: dto.id,
    documentId: dto.document_id,
    source: evidenceSource[dto.source],
    title: dto.title,
    documentNumber: dto.document_number,
    issuer: dto.issuer,
    issuedAt: dto.issued_at,
    effectiveAt: dto.effective_at,
    pageRange: dto.page_range,
    versionLabel: dto.version_label,
    verifiedAt: dto.verified_at,
    verifiedBy: dto.verified_by,
    state: evidenceState[dto.state],
    rationale: dto.rationale,
    originalAvailable: dto.original_available,
  });
}

export function adaptTaskDetail(dto) {
  return Object.freeze({
    status: "ready",
    task: adaptTaskSummary(dto.task),
    checklist: Object.freeze(dto.checklist.map((item) => Object.freeze({
      id: item.id,
      label: item.label,
      note: item.note,
      complete: item.complete,
      order: item.order,
      version: item.version,
    }))),
    evidence: Object.freeze(dto.evidence.map(adaptEvidence)),
    previousActivities: Object.freeze(dto.previous_activities.map((activity) => Object.freeze({
      id: activity.id,
      type: activity.type,
      occurredAt: activity.occurred_at,
      label: activity.label,
    }))),
    experienceNotes: Object.freeze(dto.experience_notes.map((note) => Object.freeze({
      id: note.id,
      taskId: note.task_id,
      academicYear: note.academic_year,
      text: note.text,
      authorLabel: note.author_label,
      visibility: note.visibility,
      approval: note.approval.replaceAll("_", "-"),
      reviewedAt: note.reviewed_at,
      version: note.version,
    }))),
  });
}

export function adaptSearch(dto) {
  return Object.freeze({
    status: dto.items.length === 0 ? "no-result" : "ready",
    query: dto.query,
    items: Object.freeze(dto.items.map((item) => Object.freeze({
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      source: item.source === null ? null : evidenceSource[item.source],
      target: item.target,
    }))),
    nextCursor: dto.next_cursor,
    total: dto.total,
  });
}
