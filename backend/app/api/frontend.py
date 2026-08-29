"""React 프론트엔드용 엔드포인트.

프론트는 mock JSON을 fetch 해 zod로 검증한다. 여기의 응답은 그 mock과
같은 형태이므로, 프론트는 fetch 경로만 바꾸면(또는 vite proxy만 켜면)
화면·어댑터 수정 없이 실데이터를 받는다.

같은 응답을 두 경로로 내보낸다.

    /api/frontend/assignments          정식 경로
    /mocks/backend/assignments.json    프론트가 지금 fetch 하는 경로 그대로

뒤엣것 덕분에 vite proxy 에 재작성 규칙조차 필요 없고, 나중에 React 빌드를
이 서버가 함께 서빙해도 그대로 동작한다.

AI 질의(업무 도우미 패널)는 별도 계약인 POST /api/v1/query 를 쓴다.
docs/API.md 참고. task id가 곧 workflow_id 이므로 그대로 넘기면 된다.
"""

import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, UploadFile

from .. import settings
from ..errors import ApiError
from ..models import frontend as dto
from ..services import frontend_service, state_store, upload_ingest

router = APIRouter()
alias = APIRouter()  # /mocks/backend/*.json


def _register(
    path: str, name: str, handler, response_model, summary: str,
    exclude_none: bool = False,
) -> None:
    """같은 핸들러를 정식 경로와 mock 별칭 경로에 등록한다.

    exclude_none 주의: zod 의 .optional() 필드는 값이 없으면 **키 자체가
    없어야** 하고(null 을 보내면 검증 실패), .nullable() 필드는 반대로
    키가 반드시 있어야 한다. 그래서 응답마다 다르게 정한다.
    """
    options = {"response_model": response_model, "response_model_exclude_none": exclude_none}
    router.get(f"/{path}", summary=summary, **options)(handler)
    alias.get(f"/{path}{name}", include_in_schema=False, **options)(handler)


def get_assignments() -> dto.AssignmentsResponse:
    return frontend_service.assignments()


def get_tasks() -> dto.TasksResponse:
    return frontend_service.tasks()


def get_feed() -> dto.FeedResponse:
    return frontend_service.feed()


def get_documents() -> dto.DocumentsResponse:
    return frontend_service.documents()


def get_experience_notes() -> dto.ExperienceNotesResponse:
    return frontend_service.experience_notes()


def get_notifications() -> dto.NotificationsResponse:
    return frontend_service.notifications()


_register("assignments", ".json", get_assignments, dto.AssignmentsResponse, "담당 업무(실데이터)", exclude_none=True)
_register("tasks", ".json", get_tasks, dto.TasksResponse, "업무 목록(실데이터)")
_register("feed", ".json", get_feed, dto.FeedResponse, "접수 공문 피드(실데이터)")
_register("documents", ".json", get_documents, dto.DocumentsResponse, "문서함(실데이터)")
_register(
    "experience-notes", ".json", get_experience_notes, dto.ExperienceNotesResponse,
    "경험 노트(저장 기능 전까지 빈 목록)",
)
_register("notifications", ".json", get_notifications, dto.NotificationsResponse, "알림(실데이터)")


@router.get(
    "/task-details/{task_id}",
    response_model=dto.TaskDetail,
    response_model_exclude_none=True,  # guideline_change_notice 는 zod .optional()
    summary="업무 상세(실데이터)",
)
def get_task_detail(task_id: str) -> dto.TaskDetail:
    return frontend_service.task_detail(task_id)


@alias.get(
    "/task-details/{task_id}.json",
    response_model=dto.TaskDetail,
    response_model_exclude_none=True,
    include_in_schema=False,
)
def get_task_detail_alias(task_id: str) -> dto.TaskDetail:
    return frontend_service.task_detail(task_id)


# --- 저장(변경) ---------------------------------------------------------------
#
# 여기부터는 담당자가 화면에서 만든 상태다. 산출물과 달리 재생성할 수 없어
# data/user_state.json 에 남긴다 (state_store).


@router.post(
    "/assignments",
    response_model=dto.Assignment,
    summary="담당 업무(분장) 직접 추가 — data/user_state.json 에 남는다",
)
def create_assignment(request: dto.AssignmentCreateRequest) -> dto.Assignment:
    return frontend_service.create_custom_assignment(
        name=request.name, active_from=request.active_from, note=request.note
    )


@router.post(
    "/tasks",
    response_model=dto.Task,
    summary="업무 카드 직접 추가 — data/user_state.json 에 남는다",
)
def create_task(request: dto.TaskCreateRequest) -> dto.Task:
    return frontend_service.create_custom_task(
        title=request.title,
        start_date=request.start_date,
        due_date=request.due_date,
        category=request.category,
        memo=request.memo,
        assignment_id=request.assignment_id,
    )


@router.post(
    "/task-details/{task_id}/checklist/{item_id}",
    response_model=dto.TaskDetail,
    response_model_exclude_none=True,
    summary="체크리스트 확인/해제 — 저장 후 갱신된 상세를 돌려준다",
)
def toggle_checklist(
    task_id: str, item_id: str, request: dto.ChecklistToggleRequest
) -> dto.TaskDetail:
    # 존재 확인을 먼저 한다. 없는 업무에 상태만 쌓이는 것을 막는다.
    detail = frontend_service.task_detail(task_id)
    if not any(item.id == item_id for item in detail.checklist):
        from ..errors import not_found

        raise not_found("checklist_item_not_found", f"항목 '{item_id}'가 없습니다.")

    state_store.set_checklist_item(task_id, item_id, request.done)
    return frontend_service.task_detail(task_id)


@router.post(
    "/experience-notes",
    response_model=dto.ExperienceNote,
    summary="경험 노트 저장",
)
def create_note(request: dto.NoteCreateRequest) -> dto.ExperienceNote:
    return frontend_service.add_experience_note(
        request.task_id, request.visibility, request.body
    )


@router.post(
    "/notifications/read",
    response_model=dto.NotificationsReadResponse,
    summary="알림 읽음 처리 (ids 비우면 전부)",
)
def mark_notifications_read(
    request: dto.NotificationsReadRequest,
) -> dto.NotificationsReadResponse:
    ids = request.ids
    if request.all or not ids:
        ids = [item.id for item in frontend_service.notifications().items]
    return dto.NotificationsReadResponse(
        marked=state_store.mark_notifications_read(ids)
    )


UPLOAD_DIR = settings.DATA_DIR / "uploads"
UPLOAD_NOTE = upload_ingest.STATUS_NOTE["received"]
ALLOWED_UPLOAD_SUFFIXES = {
    ".pdf", ".hwp", ".hwpx", ".xlsx", ".xls", ".pptx", ".docx",
    ".html", ".htm", ".txt", ".md", ".csv", ".zip",
}


def _safe_filename(name: str) -> str:
    """경로 조작을 막는다. 이름의 글자만 남긴다."""
    cleaned = re.sub(r"[^\w가-힣.() \-]", "_", Path(name or "파일").name)
    return cleaned or "파일"


@router.post(
    "/uploads",
    response_model=dto.UploadRecord,
    summary="문서 업로드 — markitdown 변환 → LangChain 분할 → (키 있으면) 색인",
)
async def upload_file(file: UploadFile, background: BackgroundTasks) -> dto.UploadRecord:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = _safe_filename(file.filename or "")
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_UPLOAD_SUFFIXES:
        raise ApiError(
            415,
            "upload_type_not_allowed",
            "지원하지 않는 파일 형식입니다. PDF, HWP/HWPX, Office 문서 또는 텍스트 파일을 사용하세요.",
        )

    content = await file.read(settings.MAX_UPLOAD_BYTES + 1)
    await file.close()
    if len(content) > settings.MAX_UPLOAD_BYTES:
        limit_mb = settings.MAX_UPLOAD_BYTES // (1024 * 1024)
        raise ApiError(
            413,
            "upload_too_large",
            f"파일은 {limit_mb}MB 이하만 업로드할 수 있습니다.",
        )

    record = state_store.add_upload(
        {
            "filename": filename,
            "size": len(content),
            "uploaded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "status": "received",
            "note": UPLOAD_NOTE,
        }
    )
    # 같은 이름이 또 와도 덮어쓰지 않도록 id를 앞에 붙인다
    saved = UPLOAD_DIR / f"{record['id']}_{filename}"
    saved.write_bytes(content)

    # 변환(1~2초)과 색인(OpenAI, 수 초)이 요청을 잡아 두지 않게 배경으로 돌린다.
    background.add_task(
        upload_ingest.process_upload, record["id"], saved, Path(filename).stem
    )
    return dto.UploadRecord(**record)


@router.get("/uploads", response_model=dto.UploadsResponse, summary="업로드 기록과 처리 상태")
def list_uploads() -> dto.UploadsResponse:
    items = []
    for row in state_store.uploads():
        payload = dict(row)
        payload.setdefault("note", upload_ingest.STATUS_NOTE.get(payload.get("status", "received"), ""))
        items.append(dto.UploadRecord(**payload))
    return dto.UploadsResponse(items=items)
