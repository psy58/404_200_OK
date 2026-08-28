"""문서 엔드포인트."""

from fastapi import APIRouter, Query

from ...models.common import ErrorResponse
from ...models.document import ChunkDetail, DocumentDetail
from ...models.statute import DocumentStatutesResponse, StatuteCitation
from ...services import document_service, statute_service

router = APIRouter()

NOT_FOUND = {404: {"model": ErrorResponse}}


@router.get(
    "/documents/{document_id}",
    response_model=DocumentDetail,
    responses=NOT_FOUND,
    summary="문서 정보 조회",
)
def get_document(
    document_id: str,
    include_content: bool = Query(
        default=False,
        description="본문 전체가 필요할 때만 true. 기본은 메타데이터만 돌려준다.",
    ),
) -> DocumentDetail:
    return document_service.get_document(document_id, include_content)


@router.get(
    "/documents/{document_id}/chunks/{chunk_id}",
    response_model=ChunkDetail,
    responses=NOT_FOUND,
    summary="문서 조각 조회",
)
def get_chunk(document_id: str, chunk_id: str) -> ChunkDetail:
    return document_service.get_chunk(document_id, chunk_id)


@router.get(
    "/documents/{document_id}/statutes",
    response_model=DocumentStatutesResponse,
    summary="이 문서가 인용한 근거 법령 (law.go.kr 링크 포함)",
)
def get_document_statutes(document_id: str) -> DocumentStatutesResponse:
    """문서가 없어도 404가 아니라 빈 목록이다.

    법령 인용이 없는 문서가 대부분(1,088건 중 66건만 인용)이라, 없는 것과
    문서가 없는 것을 구분해 프론트를 번거롭게 하지 않는다.
    """
    return DocumentStatutesResponse(
        document_id=document_id,
        items=[StatuteCitation(**c) for c in statute_service.citations_for(document_id)],
    )
