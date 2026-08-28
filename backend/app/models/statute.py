"""근거 법령 API의 응답 계약.

    GET /api/v1/documents/{document_id}/statutes
    GET /api/v1/statutes
"""

from pydantic import BaseModel, Field


class StatuteCitation(BaseModel):
    """문서가 인용한 법령 한 건. url 은 국가법령정보센터 한글주소다."""

    name: str = Field(examples=["개인정보 보호법"])
    article: str | None = Field(default=None, examples=["제15조"])
    display: str = Field(examples=["개인정보 보호법 제15조"])
    category: str = Field(description="법령 / 행정규칙 / 자치법규", examples=["법령"])
    url: str = Field(
        description="law.go.kr 링크. 실존 확인이 안 된 이름이면 통합검색 주소다.",
        examples=["https://www.law.go.kr/법령/개인정보 보호법/제15조"],
    )
    verified: bool | None = Field(
        default=None,
        description="law.go.kr 에서 실존을 확인했는가. 검증을 안 돌렸으면 null.",
    )


class DocumentStatutesResponse(BaseModel):
    document_id: str
    items: list[StatuteCitation]


class StatuteLedgerEntry(BaseModel):
    """법령 대장 한 줄 — 어느 법이 몇 번, 어느 문서에서 인용됐나."""

    name: str
    category: str | None = None
    count: int = Field(description="이 법령을 인용한 횟수(문서 단위)")
    articles: list[str] = Field(default_factory=list)
    documents: list[str] = Field(default_factory=list, description="인용한 document_id")
    verified: bool | None = None
    url: str


class StatutesResponse(BaseModel):
    law_count: int
    items: list[StatuteLedgerEntry]
