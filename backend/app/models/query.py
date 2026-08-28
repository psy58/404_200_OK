"""POST /api/v1/query 의 요청·응답 계약.

이 파일이 프론트엔드와 백엔드 사이의 첫 번째 계약이다.
구조화 정보(data)와 LLM이 만든 자연어 설명(message)을 분리해서 돌려준다.
프론트는 message를 말풍선에, data를 워크플로/문서 UI에 쓴다.
"""

from pydantic import BaseModel, ConfigDict, Field

from .common import DocumentResult, NextAction, StageRef, TimelineEntry, WorkflowRef


class QueryRequest(BaseModel):
    """사용자가 업무에 대해 묻는다."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "query": "과학대회 참가하려면 뭐부터 해야 하나요?",
                    "workflow_id": None,
                    "session_id": "sess_8f2c",
                }
            ]
        }
    )

    query: str = Field(
        min_length=1,
        max_length=1000,
        description="자연어 질문.",
    )
    workflow_id: str | None = Field(
        default=None,
        description=(
            "사용자가 이미 특정 업무 화면에 있을 때 그 업무를 알려준다. "
            "비워 두면 백엔드가 질문에서 업무를 추정한다."
        ),
    )
    session_id: str | None = Field(
        default=None,
        description="같은 대화의 이어지는 질문을 묶는 식별자. 첫 질문에서는 비워 둔다.",
    )


class QueryData(BaseModel):
    """LLM 문장이 아니라 애플리케이션 로직이 채우는 구조화 정보.

    업무를 특정하지 못했으면 workflow와 단계는 모두 null이고
    documents만 채워질 수 있다. 프론트는 모든 필드가 비어 있는 경우를
    반드시 처리해야 한다.
    """

    workflow: WorkflowRef | None = None
    current_stage: StageRef | None = None
    next_stage: StageRef | None = None
    next_actions: list[NextAction] = Field(default_factory=list)
    documents: list[DocumentResult] = Field(
        default_factory=list,
        description="답변 근거. 관련도 내림차순으로 정렬해서 보낸다.",
    )
    timeline: list[TimelineEntry] = Field(
        default_factory=list,
        description=(
            "이 질문과 관련된 문서를 시간순으로 늘어놓은 것. 날짜를 아는 문서가 앞에 오고 "
            "날짜를 모르는 문서가 뒤에 온다. 관련 문서가 하나뿐이면 비어 있을 수 있다."
        ),
    )


class QueryResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "query_id": "qry_01HZX3K9",
                    "message": (
                        "학생 선발이 완료되었으므로 다음 단계는 참가 신청입니다. "
                        "참가 신청서에는 학교장 결재가 필요합니다."
                    ),
                    "data": {
                        "workflow": {
                            "workflow_id": "science_competition",
                            "name": "과학대회 참가",
                        },
                        "current_stage": {"step_id": "2", "name": "학생 선발"},
                        "next_stage": {"step_id": "3", "name": "참가 신청"},
                        "next_actions": [
                            {
                                "step_id": "3",
                                "title": "참가 신청서 제출",
                                "description": "학생 명단을 첨부해 신청서를 제출합니다.",
                            },
                            {
                                "step_id": None,
                                "title": "보호자 동의서 수합",
                                "description": "개인정보 제공 동의서를 미리 받아 둡니다.",
                            },
                        ],
                        "documents": [
                            {
                                "document_id": "doc_2026_competition_guide",
                                "chunk_id": "chunk_0142",
                                "title": "2026 학생 교외대회 참가 지침",
                                "page": 12,
                                "snippet": "교외대회 참가 신청은 대회 개최일 30일 전까지...",
                                "relevance": 0.87,
                            }
                        ],
                    },
                }
            ]
        }
    )

    query_id: str = Field(
        description="이 응답의 식별자. 피드백·로그 추적에 쓴다.",
    )
    message: str = Field(
        description="사용자에게 그대로 보여줄 자연어 설명. LLM이 생성한다.",
    )
    data: QueryData = Field(
        description="화면 구성에 쓰는 구조화 정보. LLM이 자유롭게 만들지 않는다.",
    )
