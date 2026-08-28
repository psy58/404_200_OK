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

from fastapi import APIRouter

from ..models import frontend as dto
from ..services import frontend_service

router = APIRouter()
alias = APIRouter()  # /mocks/backend/*.json


def _register(path: str, name: str, handler, response_model, summary: str) -> None:
    router.get(f"/{path}", response_model=response_model, summary=summary)(handler)
    alias.get(f"/{path}{name}", response_model=response_model, include_in_schema=False)(
        handler
    )


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


_register("assignments", ".json", get_assignments, dto.AssignmentsResponse, "담당 업무(실데이터)")
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
    summary="업무 상세(실데이터)",
)
def get_task_detail(task_id: str) -> dto.TaskDetail:
    return frontend_service.task_detail(task_id)


@alias.get(
    "/task-details/{task_id}.json",
    response_model=dto.TaskDetail,
    include_in_schema=False,
)
def get_task_detail_alias(task_id: str) -> dto.TaskDetail:
    return frontend_service.task_detail(task_id)
