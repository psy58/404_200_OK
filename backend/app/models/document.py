"""문서 조회 API의 응답 계약.

    GET /api/v1/documents/{document_id}
    GET /api/v1/documents/{document_id}/chunks/{chunk_id}
"""

from datetime import date
from enum import Enum

from pydantic import BaseModel, Field


class SourceType(str, Enum):
    """원본 파일 종류. 프론트가 아이콘을 고르는 데 쓴다."""

    HWPX = "hwpx"
    HWP = "hwp"
    PDF = "pdf"
    XLSX = "xlsx"
    OTHER = "other"


class DocumentDetail(BaseModel):
    """문서 제목과 원문 보기 링크를 그리는 데 필요한 정보."""

    document_id: str = Field(examples=["doc_2026_competition_guide"])
    title: str = Field(examples=["2026 학생 교외대회 참가 지침"])
    source_type: SourceType
    doc_number: str | None = Field(
        default=None,
        description="공문서 번호. 학교 문서가 아니면 null.",
        examples=["숭의여자고등학교-10129"],
    )
    issued_on: date | None = Field(default=None, description="생산 또는 접수 일자.")
    page_count: int | None = Field(default=None, ge=1, examples=[24])
    chunk_count: int = Field(ge=0, examples=[87])
    original_url: str | None = Field(
        default=None,
        description="원본 파일을 받을 수 있는 경로. 없으면 null.",
    )
    content: str | None = Field(
        default=None,
        description=(
            "문서 전체를 Markdown으로 변환한 본문. "
            "기본은 null이며 include_content=true 로 요청할 때만 채워진다."
        ),
    )


class ChunkDetail(BaseModel):
    """근거로 인용된 조각 하나. 앞뒤 조각으로 이동할 수 있다."""

    document_id: str
    chunk_id: str = Field(examples=["chunk_0142"])
    title: str = Field(
        description="편의를 위해 문서 제목을 함께 보낸다.",
        examples=["2026 학생 교외대회 참가 지침"],
    )
    page: int | None = Field(default=None, ge=1, examples=[12])
    content: str = Field(description="조각 본문(Markdown).")
    prev_chunk_id: str | None = None
    next_chunk_id: str | None = None
