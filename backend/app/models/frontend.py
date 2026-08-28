"""프론트엔드(React)가 기다리는 응답 형태.

프론트 저장소의 src/domain/raw-schemas.ts (zod)와 1:1이다. 프론트는 응답을
zod로 검증한 뒤에만 신뢰하므로, 여기서 필드 하나만 어긋나도 화면이
ContractIssue 로 죽는다. 필드 이름·필수 여부·enum 값을 그쪽 파일과 똑같이
유지한다. 바꿀 일이 생기면 양쪽을 같은 PR에서 바꾼다.

우리 계약(/api/v1/*)과 별개의 어댑터 층이다. 내부 모델을 바꾸지 않고
프론트가 이미 만들어 둔 화면(zod → adapter → UI)에 실데이터를 흘려 넣는다.
"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

# --- 담당 업무(assignment) ---------------------------------------------------


class School(BaseModel):
    id: str
    name: str
    academic_year: int


class Assignment(BaseModel):
    id: str
    name: str
    active_from: str
    status: Literal["server_allowed", "proposed_by_school"]
    note: str | None = None
    task_count: int


class AssignmentsResponse(BaseModel):
    school: School
    items: list[Assignment]


# --- 업무(task) --------------------------------------------------------------

TaskStatus = Literal["in_progress", "upcoming", "planned", "complete"]


class Task(BaseModel):
    id: str
    assignment_id: str
    title: str
    category: str
    status: TaskStatus
    recommended_start_date: str
    official_due_date: str
    previous_actual_date: str
    checklist_done: int
    checklist_total: int
    # 3월 시작 학년도 축의 0-기반 인덱스. 8월이면 5다.
    timeline_month_start: int
    timeline_month_end: int
    rationale: str


class TasksResponse(BaseModel):
    items: list[Task]


# --- 업무 상세 ---------------------------------------------------------------

SourceType = Literal["official", "school_case"]


class ChecklistItem(BaseModel):
    id: str
    text: str
    note: str
    done: bool


class EvidenceLink(BaseModel):
    level: str
    title: str
    detail: str
    source_type: SourceType
    # law.go.kr 같은 바깥 링크. zod 는 .optional() 이므로 값이 없으면
    # 키를 아예 빼서 보낸다 (task-details 라우트의 exclude_none).
    url: str | None = None


class TimelineEvent(BaseModel):
    date: str
    event: str


class FormRef(BaseModel):
    id: str
    title: str
    meta: str


class TaskDetail(BaseModel):
    task_id: str
    checklist: list[ChecklistItem]
    evidence_chain: list[EvidenceLink]
    previous_timeline: list[TimelineEvent]
    related_forms: list[FormRef]
    guideline_change_notice: str | None = None


# --- 접수 피드 ---------------------------------------------------------------


class FeedItem(BaseModel):
    id: str
    title: str
    issuer: str
    received_at: str
    hint: str
    related_task_id: str | None


class FeedResponse(BaseModel):
    items: list[FeedItem]


# --- 문서함 ------------------------------------------------------------------


class DocumentRow(BaseModel):
    id: str
    title: str
    document_number: str
    source_type: SourceType
    related_task_title: str
    issued_at: str
    analysis_status: Literal["complete", "pending", "partial"]
    verification_status: Literal["verified", "needs_review", "none"]


class DocumentsResponse(BaseModel):
    items: list[DocumentRow]


# --- 경험 노트 ---------------------------------------------------------------


class ExperienceNote(BaseModel):
    id: str
    task_id: str
    task_title: str
    academic_year: int
    author_display: str
    is_mine: bool
    visibility: Literal["private", "handover", "organization"]
    body: str


class ExperienceNotesResponse(BaseModel):
    items: list[ExperienceNote]


# --- 알림 --------------------------------------------------------------------


class Notification(BaseModel):
    id: str
    title: str
    message: str
    kind: Literal["due", "prep", "doc", "evidence_update", "analysis_complete"]
    is_new: bool
    related_task_id: str | None


class NotificationsResponse(BaseModel):
    items: list[Notification]


# --- 저장(변경) 요청·응답 ------------------------------------------------------


class AssignmentCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)

    @field_validator("name", mode="before")
    @classmethod
    def _strip_name(cls, value):
        # 공백만 있는 이름이 min_length 를 통과하지 못하게 먼저 다듬는다
        return value.strip() if isinstance(value, str) else value
    active_from: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    note: str | None = Field(default=None, max_length=100)


class TaskCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)

    @field_validator("title", mode="before")
    @classmethod
    def _strip_title(cls, value):
        return value.strip() if isinstance(value, str) else value
    assignment_id: str | None = Field(default=None, max_length=40)
    start_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    due_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    category: str | None = Field(default=None, max_length=20)
    memo: str | None = Field(default=None, max_length=500)


class ChecklistToggleRequest(BaseModel):
    done: bool


class NoteCreateRequest(BaseModel):
    task_id: str | None = None
    visibility: Literal["private", "handover", "organization"] = "private"
    body: str = Field(min_length=1, max_length=4000)


class NotificationsReadRequest(BaseModel):
    """비우면(또는 all=true) 전부 읽음."""

    ids: list[str] = Field(default_factory=list)
    all: bool = False


class NotificationsReadResponse(BaseModel):
    marked: int


class UploadRecord(BaseModel):
    id: str
    filename: str
    size: int
    uploaded_at: str
    # received: 저장만 됨 / analyzed: 변환·분할 끝(문서함 반영) /
    # indexed: 검색까지 반영 / failed: 실패(사유는 note)
    status: Literal["received", "analyzed", "indexed", "failed"] = "received"
    note: str = Field(description="지금 이 파일이 어느 단계인지에 대한 정직한 설명.")
    document_id: str | None = None
    chunk_count: int | None = None


class UploadsResponse(BaseModel):
    items: list[UploadRecord]
