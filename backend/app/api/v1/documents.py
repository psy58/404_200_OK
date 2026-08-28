"""문서 엔드포인트."""

from fastapi import APIRouter, Query

from ...models.common import ErrorResponse
from ...models.document import ChunkDetail, DocumentDetail
from ...services import document_service

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
