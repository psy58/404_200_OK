"""워크플로 엔드포인트."""

from fastapi import APIRouter, Path

from ...models.common import ErrorResponse
from ...models.workflow import (
    FeedbackRequest,
    FeedbackResponse,
    StepCompleteRequest,
    WorkflowDetail,
    WorkflowListResponse,
)
from ...services import workflow_service

router = APIRouter()

NOT_FOUND = {404: {"model": ErrorResponse}}


@router.get(
    "/workflows",
    response_model=WorkflowListResponse,
    summary="등록된 업무 목록",
)
def list_workflows() -> WorkflowListResponse:
    return workflow_service.list_workflows()


@router.get(
    "/workflows/{workflow_id}",
    response_model=WorkflowDetail,
    responses=NOT_FOUND,
    summary="업무 흐름 조회",
)
def get_workflow(workflow_id: str = Path(examples=["science_competition"])) -> WorkflowDetail:
    return workflow_service.get_workflow(workflow_id)


@router.post(
    "/workflows/{workflow_id}/steps/{step_id}/complete",
    response_model=WorkflowDetail,
    responses=NOT_FOUND,
    summary="단계 완료 처리",
    description=(
        "완료 처리한 뒤 갱신된 업무 흐름 전체를 돌려준다. "
        "프론트는 응답으로 화면을 그대로 다시 그리면 되고, 따로 조회하지 않아도 된다."
    ),
)
def complete_step(
    workflow_id: str,
    step_id: str,
    request: StepCompleteRequest,
) -> WorkflowDetail:
    return workflow_service.complete_step(workflow_id, step_id, request)


@router.post(
    "/workflows/{workflow_id}/feedback",
    response_model=FeedbackResponse,
    responses=NOT_FOUND,
    summary="실제 업무가 등록된 흐름과 다를 때 알린다",
)
def post_feedback(workflow_id: str, request: FeedbackRequest) -> FeedbackResponse:
    return workflow_service.add_feedback(workflow_id, request)
