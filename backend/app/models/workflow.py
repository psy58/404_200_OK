"""워크플로 관련 API의 요청·응답 계약.

    GET  /api/v1/workflows
    GET  /api/v1/workflows/{workflow_id}
    POST /api/v1/workflows/{workflow_id}/steps/{step_id}/complete
    POST /api/v1/workflows/{workflow_id}/feedback
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from .common import StepStatus


class WorkflowSummary(BaseModel):
    """목록 화면에 쓰는 요약. 단계 목록은 담지 않는다."""

    workflow_id: str = Field(examples=["science_competition"])
    name: str = Field(examples=["과학대회 참가"])
    description: str | None = Field(
        default=None, examples=["교외 과학대회에 학생을 참가시키는 업무"]
    )
    step_count: int = Field(ge=0, examples=[5])
    completed_step_count: int = Field(ge=0, examples=[2])
    current_step: str | None = Field(
        default=None,
        description="진행 중인 단계 이름. 시작 전이거나 모두 끝났으면 null.",
        examples=["참가 신청"],
    )


class WorkflowListResponse(BaseModel):
    workflows: list[WorkflowSummary]
    total: int = Field(ge=0)


class WorkflowStep(BaseModel):
    """워크플로의 한 단계."""

    step_id: str = Field(examples=["3"])
    name: str = Field(examples=["참가 신청"])
    status: StepStatus
    description: str | None = Field(
        default=None, examples=["학생 명단을 첨부해 참가 신청서를 제출한다."]
    )
    completed_at: datetime | None = Field(
        default=None,
        description="완료 처리된 시각. status가 completed일 때만 값이 있다.",
    )
    document_ids: list[str] = Field(
        default_factory=list,
        description="이 단계에서 참고하거나 작성하는 문서.",
    )


class WorkflowDetail(BaseModel):
    """업무 흐름 시각화에 필요한 전부.

    steps는 진행 순서대로 정렬해서 보낸다. 프론트가 다시 정렬하지 않아도 된다.
    """

    workflow_id: str
    name: str
    description: str | None = None
    steps: list[WorkflowStep]
    updated_at: datetime | None = None


class StepCompleteRequest(BaseModel):
    """단계 완료 처리.

    completed를 false로 보내면 완료를 되돌린다. 잘못 누른 경우를 위해
    되돌리기도 같은 엔드포인트로 처리한다.
    """

    completed: bool = Field(default=True)
    note: str | None = Field(
        default=None,
        max_length=500,
        description="담당자가 남기는 메모. 업무 Trace에 함께 기록된다.",
    )


class FeedbackType(str, Enum):
    """실제 업무가 등록된 워크플로와 다를 때, 어떻게 다른지."""

    MISSING_STEP = "missing_step"
    UNNECESSARY_STEP = "unnecessary_step"
    WRONG_ORDER = "wrong_order"
    WRONG_DOCUMENT = "wrong_document"
    OTHER = "other"


class FeedbackRequest(BaseModel):
    type: FeedbackType
    after_step_id: str | None = Field(
        default=None,
        description=(
            "기준이 되는 단계. 이 단계 다음에 차이가 있다는 뜻이다. "
            "null이면 워크플로 맨 앞을 가리킨다."
        ),
        examples=["2"],
    )
    suggested_step_name: str | None = Field(
        default=None,
        max_length=100,
        description="missing_step일 때 실제로 했던 일의 이름.",
        examples=["개인정보 동의"],
    )
    description: str = Field(
        min_length=1,
        max_length=1000,
        description="담당자가 직접 쓴 설명. 이후 워크플로 개선 검토에 쓴다.",
    )
    query_id: str | None = Field(
        default=None,
        description="이 피드백을 유발한 /query 응답이 있으면 그 식별자.",
    )


class WorkflowDiff(BaseModel):
    """등록된 흐름과 담당자가 말한 실제 흐름의 차이.

    프론트는 두 배열을 나란히 놓아 예상 / 실제로 보여줄 수 있다.
    """

    expected: list[str] = Field(examples=[["학생 선발", "참가 신청"]])
    reported: list[str] = Field(examples=[["학생 선발", "개인정보 동의", "참가 신청"]])


class FeedbackResponse(BaseModel):
    feedback_id: str = Field(examples=["fb_01HZX4A2"])
    workflow_id: str
    type: FeedbackType
    diff: WorkflowDiff
    message: str = Field(
        description="담당자에게 보여줄 접수 확인 문구.",
        examples=["의견이 접수되었습니다. 워크플로 개선 검토에 반영됩니다."],
    )
