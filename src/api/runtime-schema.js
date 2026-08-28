/**
 * Runtime validation for the project-local MOCK_ONLY transport.
 *
 * These schemas deliberately do not claim to be the backend wire contract. When
 * the service OpenAPI arrives, generated/Pydantic-aligned DTO validators replace
 * these parsers while the presentation view models stay stable.
 */

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DATE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const DATE_TIME_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-([0-2]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

const TASK_STATUS = new Set(["preparing", "in_progress", "complete", "scheduled"]);
const TASK_PRIORITY = new Set(["critical", "high", "normal", "low"]);
const EVIDENCE_SOURCE = new Set(["official", "school_case", "experience"]);
const EVIDENCE_STATE = new Set(["verified", "review_required", "stale", "conflicted", "missing"]);
const NOTE_VISIBILITY = new Set(["private", "handover", "school"]);
const NOTE_APPROVAL = new Set(["draft", "approved", "rejected", "review_required"]);
const ACTIVITY_TYPE = new Set(["started", "completed", "submitted", "notified", "changed"]);
const SEARCH_TYPE = new Set(["task", "document", "evidence", "experience"]);

export class ContractValidationError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "ContractValidationError";
    this.path = path;
    this.code = "MOCK_CONTRACT_INVALID";
  }
}

function fail(path, message) {
  throw new ContractValidationError(path, message);
}

function objectAt(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "object expected");
  }
  return value;
}

function exactKeys(value, path, allowed, required = allowed) {
  const keys = Object.keys(value);
  const extras = keys.filter((key) => !allowed.includes(key));
  if (extras.length) fail(path, `unexpected field(s): ${extras.join(", ")}`);
  const missing = required.filter((key) => !(key in value));
  if (missing.length) fail(path, `missing field(s): ${missing.join(", ")}`);
  return value;
}

function stringAt(value, path, { min = 1, max = 500 } = {}) {
  if (typeof value !== "string") fail(path, "string expected");
  if (value.length < min || value.length > max) fail(path, `length must be ${min}..${max}`);
  return value;
}

function nullableStringAt(value, path, options) {
  return value === null ? null : stringAt(value, path, options);
}

function idAt(value, path) {
  const id = stringAt(value, path, { min: 1, max: 128 });
  if (!ID_PATTERN.test(id)) fail(path, "stable id expected");
  return id;
}

function integerAt(value, path, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(path, `integer must be ${min}..${max}`);
  }
  return value;
}

function booleanAt(value, path) {
  if (typeof value !== "boolean") fail(path, "boolean expected");
  return value;
}

function enumAt(value, path, allowed) {
  if (!allowed.has(value)) fail(path, `unknown enum value: ${String(value)}`);
  return value;
}

function validCalendarDate(match) {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function dateAt(value, path) {
  const date = stringAt(value, path, { min: 10, max: 10 });
  const match = DATE_PATTERN.exec(date);
  if (!match || !validCalendarDate(match)) {
    fail(path, "YYYY-MM-DD date expected");
  }
  return date;
}

function nullableDateAt(value, path) {
  return value === null ? null : dateAt(value, path);
}

function dateTimeAt(value, path) {
  const dateTime = stringAt(value, path, { min: 20, max: 40 });
  const match = DATE_TIME_PATTERN.exec(dateTime);
  if (!match || !validCalendarDate(match) || Number.isNaN(Date.parse(dateTime))) {
    fail(path, "timezone-aware ISO 8601 date-time expected");
  }
  return dateTime;
}

function nullableDateTimeAt(value, path) {
  return value === null ? null : dateTimeAt(value, path);
}

function internalPathAt(value, path) {
  const target = stringAt(value, path, { min: 1, max: 500 });
  if (!target.startsWith("/") || target.startsWith("//") || target.includes("\\") || /[\u0000-\u001F\u007F]/.test(target)) {
    fail(path, "safe same-origin absolute path expected");
  }
  const parsed = new URL(target, "https://gam.invalid");
  if (parsed.origin !== "https://gam.invalid" || parsed.username || parsed.password) {
    fail(path, "cross-origin target is not allowed");
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function arrayAt(value, path, parser, { max = 500 } = {}) {
  if (!Array.isArray(value)) fail(path, "array expected");
  if (value.length > max) fail(path, `array exceeds ${max} items`);
  return value.map((item, index) => parser(item, `${path}[${index}]`));
}

function assertUnique(items, path, key) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item[key])) fail(path, `duplicate ${key}: ${item[key]}`);
    seen.add(item[key]);
  }
  return items;
}

function parseContext(value, path) {
  const object = exactKeys(objectAt(value, path), path, ["user_id", "school_id", "assignment_id", "session_epoch"]);
  return {
    user_id: idAt(object.user_id, `${path}.user_id`),
    school_id: idAt(object.school_id, `${path}.school_id`),
    assignment_id: idAt(object.assignment_id, `${path}.assignment_id`),
    session_epoch: idAt(object.session_epoch, `${path}.session_epoch`),
  };
}

function parseDateTriple(value, path) {
  const object = exactKeys(objectAt(value, path), path, ["recommended_start", "official_due", "previous_actual", "due_in_days"]);
  return {
    recommended_start: dateAt(object.recommended_start, `${path}.recommended_start`),
    official_due: dateAt(object.official_due, `${path}.official_due`),
    previous_actual: dateAt(object.previous_actual, `${path}.previous_actual`),
    due_in_days: integerAt(object.due_in_days, `${path}.due_in_days`, { min: -3660, max: 3660 }),
  };
}

export function parseTaskSummaryDto(value, path = "task") {
  const keys = [
    "id", "series_id", "title", "next_action", "category", "status", "priority",
    "dates", "checklist_done", "checklist_total", "evidence_state", "version",
  ];
  const object = exactKeys(objectAt(value, path), path, keys);
  const done = integerAt(object.checklist_done, `${path}.checklist_done`, { max: 10000 });
  const total = integerAt(object.checklist_total, `${path}.checklist_total`, { max: 10000 });
  if (done > total) fail(path, "checklist_done cannot exceed checklist_total");
  return {
    id: idAt(object.id, `${path}.id`),
    series_id: idAt(object.series_id, `${path}.series_id`),
    title: stringAt(object.title, `${path}.title`, { max: 200 }),
    next_action: stringAt(object.next_action, `${path}.next_action`, { max: 300 }),
    category: stringAt(object.category, `${path}.category`, { max: 80 }),
    status: enumAt(object.status, `${path}.status`, TASK_STATUS),
    priority: enumAt(object.priority, `${path}.priority`, TASK_PRIORITY),
    dates: parseDateTriple(object.dates, `${path}.dates`),
    checklist_done: done,
    checklist_total: total,
    evidence_state: enumAt(object.evidence_state, `${path}.evidence_state`, EVIDENCE_STATE),
    version: integerAt(object.version, `${path}.version`, { min: 1 }),
  };
}

function parseAssignment(value, path) {
  const object = exactKeys(objectAt(value, path), path, ["id", "name", "description", "task_count", "active"]);
  return {
    id: idAt(object.id, `${path}.id`),
    name: stringAt(object.name, `${path}.name`, { max: 100 }),
    description: stringAt(object.description, `${path}.description`, { min: 0, max: 200 }),
    task_count: integerAt(object.task_count, `${path}.task_count`, { max: 10000 }),
    active: booleanAt(object.active, `${path}.active`),
  };
}

export function parseContractDto(value, path = "contract") {
  const keys = ["schema_version", "contract_status", "generated_at", "execution_boundary", "session"];
  const object = exactKeys(objectAt(value, path), path, keys);
  const boundary = exactKeys(objectAt(object.execution_boundary, `${path}.execution_boundary`), `${path}.execution_boundary`, ["mode", "persistence", "label"]);
  const session = exactKeys(objectAt(object.session, `${path}.session`), `${path}.session`, ["user", "school", "assignments", "active_assignment_id", "session_epoch", "version"]);
  const user = exactKeys(objectAt(session.user, `${path}.session.user`), `${path}.session.user`, ["id", "display_name", "role_label"]);
  const school = exactKeys(objectAt(session.school, `${path}.session.school`), `${path}.session.school`, ["id", "name"]);
  const assignments = assertUnique(arrayAt(session.assignments, `${path}.session.assignments`, parseAssignment, { max: 100 }), `${path}.session.assignments`, "id");
  const activeId = idAt(session.active_assignment_id, `${path}.session.active_assignment_id`);
  if (!assignments.some((assignment) => assignment.id === activeId && assignment.active)) {
    fail(`${path}.session.active_assignment_id`, "must identify the active allowed assignment");
  }
  return {
    schema_version: stringAt(object.schema_version, `${path}.schema_version`, { max: 80 }),
    contract_status: enumAt(object.contract_status, `${path}.contract_status`, new Set(["MOCK_ONLY"])),
    generated_at: dateTimeAt(object.generated_at, `${path}.generated_at`),
    execution_boundary: {
      mode: enumAt(boundary.mode, `${path}.execution_boundary.mode`, new Set(["mock"])),
      persistence: enumAt(boundary.persistence, `${path}.execution_boundary.persistence`, new Set(["session_only"])),
      label: stringAt(boundary.label, `${path}.execution_boundary.label`, { max: 120 }),
    },
    session: {
      user: {
        id: idAt(user.id, `${path}.session.user.id`),
        display_name: stringAt(user.display_name, `${path}.session.user.display_name`, { max: 100 }),
        role_label: stringAt(user.role_label, `${path}.session.user.role_label`, { max: 100 }),
      },
      school: {
        id: idAt(school.id, `${path}.session.school.id`),
        name: stringAt(school.name, `${path}.session.school.name`, { max: 120 }),
      },
      assignments,
      active_assignment_id: activeId,
      session_epoch: idAt(session.session_epoch, `${path}.session.session_epoch`),
      version: integerAt(session.version, `${path}.session.version`, { min: 1 }),
    },
  };
}

function parseSummaryLink(value, path) {
  const object = exactKeys(objectAt(value, path), path, ["id", "label", "count", "as_of", "target", "query"]);
  const query = objectAt(object.query, `${path}.query`);
  for (const [key, item] of Object.entries(query)) {
    stringAt(key, `${path}.query key`, { max: 80 });
    stringAt(item, `${path}.query.${key}`, { min: 0, max: 200 });
  }
  return {
    id: enumAt(object.id, `${path}.id`, new Set(["urgent", "preparing", "new_documents", "completed"])),
    label: stringAt(object.label, `${path}.label`, { max: 100 }),
    count: object.count === null ? null : integerAt(object.count, `${path}.count`, { max: 1000000 }),
    as_of: dateTimeAt(object.as_of, `${path}.as_of`),
    target: internalPathAt(object.target, `${path}.target`),
    query,
  };
}

export function parseHomeDto(value, path = "home") {
  const keys = ["schema_version", "contract_status", "generated_at", "context", "primary_task", "urgent", "this_month", "next_thirty_days", "summary_links"];
  const object = exactKeys(objectAt(value, path), path, keys);
  const urgent = assertUnique(arrayAt(object.urgent, `${path}.urgent`, parseTaskSummaryDto, { max: 20 }), `${path}.urgent`, "id");
  const thisMonth = assertUnique(arrayAt(object.this_month, `${path}.this_month`, parseTaskSummaryDto, { max: 100 }), `${path}.this_month`, "id");
  const nextThirtyDays = assertUnique(arrayAt(object.next_thirty_days, `${path}.next_thirty_days`, parseTaskSummaryDto, { max: 100 }), `${path}.next_thirty_days`, "id");
  const primaryTask = object.primary_task === null ? null : parseTaskSummaryDto(object.primary_task, `${path}.primary_task`);
  if (primaryTask && !urgent.some((task) => task.id === primaryTask.id)) {
    fail(`${path}.primary_task`, "primary task must also be present in urgent tasks");
  }
  return {
    schema_version: stringAt(object.schema_version, `${path}.schema_version`, { max: 80 }),
    contract_status: enumAt(object.contract_status, `${path}.contract_status`, new Set(["MOCK_ONLY"])),
    generated_at: dateTimeAt(object.generated_at, `${path}.generated_at`),
    context: parseContext(object.context, `${path}.context`),
    primary_task: primaryTask,
    urgent,
    this_month: thisMonth,
    next_thirty_days: nextThirtyDays,
    summary_links: assertUnique(arrayAt(object.summary_links, `${path}.summary_links`, parseSummaryLink, { max: 10 }), `${path}.summary_links`, "id"),
  };
}

function parseChecklistItem(value, path) {
  const object = exactKeys(objectAt(value, path), path, ["id", "label", "note", "complete", "order", "version"]);
  return {
    id: idAt(object.id, `${path}.id`),
    label: stringAt(object.label, `${path}.label`, { max: 300 }),
    note: nullableStringAt(object.note, `${path}.note`, { min: 0, max: 500 }),
    complete: booleanAt(object.complete, `${path}.complete`),
    order: integerAt(object.order, `${path}.order`, { min: 1, max: 10000 }),
    version: integerAt(object.version, `${path}.version`, { min: 1 }),
  };
}

function parseEvidence(value, path) {
  const keys = ["id", "document_id", "source", "title", "document_number", "issuer", "issued_at", "effective_at", "page_range", "version_label", "verified_at", "verified_by", "state", "rationale", "original_available"];
  const object = exactKeys(objectAt(value, path), path, keys);
  return {
    id: idAt(object.id, `${path}.id`),
    document_id: object.document_id === null ? null : idAt(object.document_id, `${path}.document_id`),
    source: enumAt(object.source, `${path}.source`, EVIDENCE_SOURCE),
    title: stringAt(object.title, `${path}.title`, { max: 300 }),
    document_number: nullableStringAt(object.document_number, `${path}.document_number`, { min: 0, max: 200 }),
    issuer: nullableStringAt(object.issuer, `${path}.issuer`, { min: 0, max: 200 }),
    issued_at: nullableDateAt(object.issued_at, `${path}.issued_at`),
    effective_at: nullableDateAt(object.effective_at, `${path}.effective_at`),
    page_range: nullableStringAt(object.page_range, `${path}.page_range`, { min: 0, max: 80 }),
    version_label: nullableStringAt(object.version_label, `${path}.version_label`, { min: 0, max: 100 }),
    verified_at: nullableDateTimeAt(object.verified_at, `${path}.verified_at`),
    verified_by: nullableStringAt(object.verified_by, `${path}.verified_by`, { min: 0, max: 100 }),
    state: enumAt(object.state, `${path}.state`, EVIDENCE_STATE),
    rationale: stringAt(object.rationale, `${path}.rationale`, { max: 500 }),
    original_available: booleanAt(object.original_available, `${path}.original_available`),
  };
}

function parseActivity(value, path) {
  const object = exactKeys(objectAt(value, path), path, ["id", "type", "occurred_at", "label"]);
  return {
    id: idAt(object.id, `${path}.id`),
    type: enumAt(object.type, `${path}.type`, ACTIVITY_TYPE),
    occurred_at: dateTimeAt(object.occurred_at, `${path}.occurred_at`),
    label: stringAt(object.label, `${path}.label`, { max: 300 }),
  };
}

function parseExperienceNote(value, path) {
  const object = exactKeys(objectAt(value, path), path, ["id", "task_id", "academic_year", "text", "author_label", "visibility", "approval", "reviewed_at", "version"]);
  return {
    id: idAt(object.id, `${path}.id`),
    task_id: idAt(object.task_id, `${path}.task_id`),
    academic_year: integerAt(object.academic_year, `${path}.academic_year`, { min: 2000, max: 2200 }),
    text: stringAt(object.text, `${path}.text`, { max: 1000 }),
    author_label: stringAt(object.author_label, `${path}.author_label`, { max: 100 }),
    visibility: enumAt(object.visibility, `${path}.visibility`, NOTE_VISIBILITY),
    approval: enumAt(object.approval, `${path}.approval`, NOTE_APPROVAL),
    reviewed_at: nullableDateTimeAt(object.reviewed_at, `${path}.reviewed_at`),
    version: integerAt(object.version, `${path}.version`, { min: 1 }),
  };
}

export function parseTaskDetailDto(value, path = "task_detail") {
  const object = exactKeys(objectAt(value, path), path, ["schema_version", "contract_status", "context", "task", "checklist", "evidence", "previous_activities", "experience_notes"]);
  const task = parseTaskSummaryDto(object.task, `${path}.task`);
  const checklist = assertUnique(arrayAt(object.checklist, `${path}.checklist`, parseChecklistItem, { max: 500 }), `${path}.checklist`, "id");
  const orders = new Set(checklist.map((item) => item.order));
  if (orders.size !== checklist.length) fail(`${path}.checklist`, "duplicate checklist order");
  if (checklist.some((item) => item.version !== task.version)) fail(`${path}.checklist`, "item version must match task version in mock snapshot");
  return {
    schema_version: stringAt(object.schema_version, `${path}.schema_version`, { max: 80 }),
    contract_status: enumAt(object.contract_status, `${path}.contract_status`, new Set(["MOCK_ONLY"])),
    context: parseContext(object.context, `${path}.context`),
    task,
    checklist,
    evidence: assertUnique(arrayAt(object.evidence, `${path}.evidence`, parseEvidence, { max: 500 }), `${path}.evidence`, "id"),
    previous_activities: assertUnique(arrayAt(object.previous_activities, `${path}.previous_activities`, parseActivity, { max: 1000 }), `${path}.previous_activities`, "id"),
    experience_notes: assertUnique(arrayAt(object.experience_notes, `${path}.experience_notes`, parseExperienceNote, { max: 500 }), `${path}.experience_notes`, "id"),
  };
}

function parseSearchItem(value, path) {
  const object = exactKeys(objectAt(value, path), path, ["id", "type", "title", "description", "source", "target"]);
  return {
    id: idAt(object.id, `${path}.id`),
    type: enumAt(object.type, `${path}.type`, SEARCH_TYPE),
    title: stringAt(object.title, `${path}.title`, { max: 300 }),
    description: stringAt(object.description, `${path}.description`, { min: 0, max: 500 }),
    source: object.source === null ? null : enumAt(object.source, `${path}.source`, EVIDENCE_SOURCE),
    target: internalPathAt(object.target, `${path}.target`),
  };
}

export function parseSearchDto(value, path = "search") {
  const object = exactKeys(objectAt(value, path), path, ["schema_version", "contract_status", "context", "query", "items", "next_cursor", "total"]);
  return {
    schema_version: stringAt(object.schema_version, `${path}.schema_version`, { max: 80 }),
    contract_status: enumAt(object.contract_status, `${path}.contract_status`, new Set(["MOCK_ONLY"])),
    context: parseContext(object.context, `${path}.context`),
    query: stringAt(object.query, `${path}.query`, { min: 0, max: 200 }),
    items: assertUnique(arrayAt(object.items, `${path}.items`, parseSearchItem, { max: 500 }), `${path}.items`, "id"),
    next_cursor: nullableStringAt(object.next_cursor, `${path}.next_cursor`, { min: 1, max: 500 }),
    total: object.total === null ? null : integerAt(object.total, `${path}.total`, { max: 10000000 }),
  };
}

export function parseProblemDetails(value, path = "problem") {
  const allowed = ["type", "title", "status", "detail", "instance", "code", "trace_id", "retry_after", "field_errors"];
  const required = ["type", "title", "status", "detail", "code", "trace_id"];
  const object = exactKeys(objectAt(value, path), path, allowed, required);
  const fieldErrors = object.field_errors === undefined ? undefined : arrayAt(object.field_errors, `${path}.field_errors`, (item, itemPath) => {
    const field = exactKeys(objectAt(item, itemPath), itemPath, ["field", "message"]);
    return {
      field: stringAt(field.field, `${itemPath}.field`, { max: 200 }),
      message: stringAt(field.message, `${itemPath}.message`, { max: 500 }),
    };
  }, { max: 100 });
  return {
    type: stringAt(object.type, `${path}.type`, { max: 500 }),
    title: stringAt(object.title, `${path}.title`, { max: 200 }),
    status: integerAt(object.status, `${path}.status`, { min: 400, max: 599 }),
    detail: stringAt(object.detail, `${path}.detail`, { max: 1000 }),
    instance: object.instance === undefined ? undefined : stringAt(object.instance, `${path}.instance`, { max: 500 }),
    code: stringAt(object.code, `${path}.code`, { max: 100 }),
    trace_id: stringAt(object.trace_id, `${path}.trace_id`, { max: 100 }),
    retry_after: object.retry_after === undefined ? undefined : stringAt(object.retry_after, `${path}.retry_after`, { max: 100 }),
    field_errors: fieldErrors,
  };
}

export function parseProblemCatalog(value, path = "problems") {
  const object = exactKeys(objectAt(value, path), path, ["schema_version", "contract_status", "items"]);
  return {
    schema_version: stringAt(object.schema_version, `${path}.schema_version`, { max: 80 }),
    contract_status: enumAt(object.contract_status, `${path}.contract_status`, new Set(["MOCK_ONLY"])),
    items: arrayAt(object.items, `${path}.items`, parseProblemDetails, { max: 100 }),
  };
}
