import type { Assignment, DocumentItem, FeedItem, TaskInstance } from "@/domain/types";

export const HAKMATONG_ID = "hakmatong";
const CUSTOM_DUTIES_KEY = "gam-custom-tasks";
const DRAFT_KEY = "gam-new-duty-draft";

export interface NewDutyDraft { name: string; assignedYear: number; assignedMonth: number }

export function normalizeDutyName(name: string) {
  const compact = name.trim().replace(/\s+/g, "");
  return compact === "학생맞춤통합지원" || compact === "학생맞춤형통합지원" || compact === "학맞통" ? "학생맞춤통합지원" : name.trim();
}

export function readDraft(): NewDutyDraft | null {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as NewDutyDraft | null; } catch { return null; }
}
export function saveDraft(draft: NewDutyDraft) { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }
export function clearDraft() { sessionStorage.removeItem(DRAFT_KEY); }

export function readCustomDuties(): Assignment[] {
  try {
    const items = JSON.parse(localStorage.getItem(CUSTOM_DUTIES_KEY) ?? "[]");
    return Array.isArray(items) ? items : [];
  } catch { return []; }
}
export function createHakmatongDuty(draft: NewDutyDraft): Assignment | null {
  if (normalizeDutyName(draft.name) !== "학생맞춤통합지원" || draft.assignedYear !== 2026 || draft.assignedMonth !== 8) return null;
  const duties = readCustomDuties();
  const existing = duties.find((duty) => duty.id === HAKMATONG_ID);
  if (existing) return existing;
  const duty: Assignment = { id: HAKMATONG_ID, name: "학생맞춤통합지원", activeFrom: "2026-08-01", status: "proposed_by_school", note: "8월부터 새로 담당", taskCount: 3 };
  localStorage.setItem(CUSTOM_DUTIES_KEY, JSON.stringify([...duties, duty]));
  return duty;
}

export function getHakmatongTasks(): TaskInstance[] {
  if (!readCustomDuties().some((duty) => duty.id === HAKMATONG_ID)) return [];
  return [
    { id:"hak-task-01", assignmentId:HAKMATONG_ID, title:"교내 학생맞춤통합지원 체계 확인", category:"학생맞춤통합지원", status:"in_progress", recommendedStartDate:"2026-08-18", officialDueDate:"2026-08-31", previousActualDate:"2025-08-28", checklistDone:0, checklistTotal:3, timelineMonthStart:5, timelineMonthEnd:5, rationale:"8월부터 새로 맡은 업무예요. 기존 지원 체계와 담당자부터 확인하세요." },
    { id:"hak-task-02", assignmentId:HAKMATONG_ID, title:"2학기 지원대상 학생 현황 확인", category:"학생맞춤통합지원", status:"upcoming", recommendedStartDate:"2026-08-25", officialDueDate:"2026-09-04", previousActualDate:"2025-09-02", checklistDone:0, checklistTotal:3, timelineMonthStart:5, timelineMonthEnd:6, rationale:"현재 지원 중인 학생 현황을 먼저 파악하세요." },
    { id:"hak-task-03", assignmentId:HAKMATONG_ID, title:"교내 사례회의 일정 조율", category:"학생맞춤통합지원", status:"upcoming", recommendedStartDate:"2026-09-01", officialDueDate:"2026-09-11", previousActualDate:"2025-09-09", checklistDone:0, checklistTotal:3, timelineMonthStart:6, timelineMonthEnd:6, rationale:"관련 담당자와 사례회의 일정을 조율하세요." },
  ];
}
export function hasHakmatongDemo() { return readCustomDuties().some((duty) => duty.id === HAKMATONG_ID); }
export function getHakmatongDocuments(): DocumentItem[] { if (!hasHakmatongDemo()) return []; return [
  {id:"doc-hak-01",title:"2026 학생맞춤통합지원 운영 안내",documentNumber:"서울특별시교육청",sourceType:"official",relatedTaskTitle:"학생맞춤통합지원",issuedAt:"2026-07-24",analysisStatus:"complete",verificationStatus:"verified"},
  {id:"doc-hak-02",title:"2026 학생맞춤통합지원 업무 매뉴얼",documentNumber:"교육부",sourceType:"official",relatedTaskTitle:"학생맞춤통합지원",issuedAt:"2026-08-02",analysisStatus:"complete",verificationStatus:"verified"},
  {id:"doc-hak-school-01",title:"2025 학생지원 사례회의 운영계획",documentNumber:"한빛중 내부결재",sourceType:"school_case",relatedTaskTitle:"학생맞춤통합지원",issuedAt:"2025-08-15",analysisStatus:"complete",verificationStatus:"verified"},
]; }
export function getHakmatongFeed(): FeedItem[] { if (!hasHakmatongDemo()) return []; return [
  {id:"doc-hak-notice-01",title:"2026 2학기 학생맞춤통합지원 추진 안내",issuer:"서울특별시교육청",receivedAt:"2026-08-18",hint:"2학기 지원대상 학생 현황 확인 및 지원체계 점검",relatedTaskId:"hak-task-01"},
  {id:"doc-hak-notice-02",title:"학생맞춤통합지원 운영 현황 제출 안내",issuer:"한빛교육지원청",receivedAt:"2026-08-25",hint:"9월 5일까지 교내 지원체계 현황 제출",relatedTaskId:"hak-task-02"},
]; }
