"""문서 서비스.

문서는 document_store에서 가져온다. 인제스트를 돌렸으면 업무목록의 실제
문서가, 돌리지 않았으면 예시 문서 두 건이 들어 있다. 어느 쪽이든 API가
돌려주는 형태는 같다.
"""

from ..errors import not_found
from ..models.document import ChunkDetail, DocumentDetail
from . import document_store


def _require_document(document_id: str) -> dict:
    document = document_store.get(document_id)
    if document is None:
        raise not_found("document_not_found", f"문서 '{document_id}'를 찾을 수 없습니다.")
    return document


def get_document(document_id: str, include_content: bool = False) -> DocumentDetail:
    document = _require_document(document_id)
    content = None
    if include_content:
        content = "\n\n".join(chunk["content"] for chunk in document["chunks"].values())

    return DocumentDetail(
        document_id=document_id,
        title=document["title"],
        source_type=document["source_type"],
        doc_number=document.get("doc_number"),
        issued_on=document.get("issued_on"),
        page_count=document.get("page_count"),
        chunk_count=len(document["chunks"]),
        original_url=f"/api/v1/documents/{document_id}/original",
        content=content,
    )


def get_chunk(document_id: str, chunk_id: str) -> ChunkDetail:
    """조각 하나와 앞뒤 조각 식별자를 함께 준다.

    프론트의 원문 보기에서 앞뒤 문단으로 이동할 수 있게 하려는 것이다.
    """
    document = _require_document(document_id)
    chunk = document["chunks"].get(chunk_id)
    if chunk is None:
        raise not_found("chunk_not_found", f"조각 '{chunk_id}'를 찾을 수 없습니다.")

    chunk_ids = list(document["chunks"])
    position = chunk_ids.index(chunk_id)
    return ChunkDetail(
        document_id=document_id,
        chunk_id=chunk_id,
        title=document["title"],
        page=chunk["page"],
        content=chunk["content"],
        prev_chunk_id=chunk_ids[position - 1] if position > 0 else None,
        next_chunk_id=(
            chunk_ids[position + 1] if position + 1 < len(chunk_ids) else None
        ),
    )
