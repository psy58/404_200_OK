"""여러 API가 함께 쓰는 업무 도메인 타입.

여기에 있는 이름은 모두 업무 담당자가 쓰는 말(업무, 단계, 문서)이다.
검색기 종류나 LangGraph State 같은 내부 구현 용어는 올라오지 않는다.
"""

import datetime
from enum import Enum

from pydantic import BaseModel, Field


class StepStatus(str, Enum):
    """워크플로 한 단계의 진행 상태."""

    COMPLETED = "completed"
    CURRENT = "current"
    PENDING = "pending"


class WorkflowRef(BaseModel):
    """질문이 어떤 업무에 해당하는지 가리키는 최소 정보.

    상세 단계 목록이 필요하면 프론트는 GET /api/v1/workflows/{workflow_id}를
    따로 호출한다. 질의 응답에 전체 워크플로를 실어 보내지 않는다.
    """

    workflow_id: str = Field(examples=["science_competition"])
    name: str = Field(examples=["과학대회 참가"])


class StageRef(BaseModel):
    """워크플로 안의 한 단계를 가리킨다."""

    step_id: str = Field(examples=["3"])
    name: str = Field(examples=["참가 신청"])


class NextAction(BaseModel):
    """사용자가 다음에 할 일 하나.

    step_id가 있으면 프론트는 그 항목에 '완료' 버튼을 붙여
    POST /api/v1/workflows/{workflow_id}/steps/{step_id}/complete 를 호출할 수 있다.
    워크플로에 등록되지 않은 안내성 할 일은 step_id가 null이다.
    """

    step_id: str | None = Field(default=None, examples=["3"])
    title: str = Field(examples=["참가 신청서 제출"])
    description: str | None = Field(
        default=None,
        examples=["대회 운영 계획서와 학생 명단을 첨부해 신청서를 제출합니다."],
    )


class DocumentResult(BaseModel):
    """답변의 근거가 된 문서 조각.

    document_id와 chunk_id는 그대로 문서 조회 API의 경로에 쓰인다.
    GET /api/v1/documents/{document_id}
    GET /api/v1/documents/{document_id}/chunks/{chunk_id}
    """

    document_id: str = Field(examples=["doc_2026_competition_guide"])
    chunk_id: str | None = Field(default=None, examples=["chunk_0142"])
    title: str = Field(examples=["2026 학생 교외대회 참가 지침"])
    page: int | None = Field(default=None, ge=1, examples=[12])
    snippet: str | None = Field(
        default=None,
        description="원문 미리보기. 화면에 그대로 보여줄 수 있는 길이로 잘라서 보낸다.",
        examples=["교외대회 참가 신청은 대회 개최일 30일 전까지 학교장 결재를 거쳐..."],
    )
    relevance: float = Field(ge=0.0, le=1.0, examples=[0.87])


class TimelineEntry(BaseModel):
    """한 사업이 시간순으로 어떻게 진행됐는지 보여 주는 한 줄.

    검색으로 찾은 문서와 그것에 이어진 문서를 날짜순으로 늘어놓은 것이다.
    담당자가 "지금 어디쯤인지"를 알려면 조각 몇 개가 아니라 이 흐름이 필요하다.
    """

    document_id: str = Field(examples=["doc_ea3ff8c315"])
    title: str = Field(examples=["2025년 AI 중심학교 운영 계획서"])
    date: datetime.date | None = Field(
        default=None,
        description="결재일이 있으면 결재일, 없으면 시행일이나 접수일.",
        examples=["2025-09-19"],
    )
    kind: str = Field(
        description="문서 종류. 계획 / 지침 / 안내·공모 / 결과보고 / 지출·정산 / 회의",
        examples=["계획"],
    )
    direction: str | None = Field(
        default=None,
        description="drafted(우리가 기안) / received(받은 공문)",
        examples=["drafted"],
    )
    audience: str | None = Field(
        default=None,
        description=(
            "교육청 제출 / 내부 진행 / 교육청 수신. "
            "담당자가 '이걸 밖에 내야 하나'를 바로 알 수 있게 나눈 것이다."
        ),
        examples=["내부 진행"],
    )
    doc_number: str | None = Field(default=None, examples=["숭의여자고등학교-11975"])


class ErrorDetail(BaseModel):
    code: str = Field(
        description="프론트가 분기에 쓰는 코드. 사람이 읽는 문구는 message를 쓴다.",
        examples=["workflow_not_found"],
    )
    message: str = Field(examples=["요청한 업무를 찾을 수 없습니다."])
    details: list[dict[str, str]] | None = Field(
        default=None,
        description="검증 실패(422)일 때 어떤 필드가 왜 틀렸는지.",
        examples=[[{"field": "body.query", "reason": "String should have at least 1 character"}]],
    )


class ErrorResponse(BaseModel):
    """4xx/5xx 응답의 공통 형태. 프론트는 error.code로 분기한다."""

    error: ErrorDetail
