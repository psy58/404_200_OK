#!/usr/bin/env python3 -m pytest
"""/documents 계약."""

DOCUMENT = "/api/v1/documents/doc_2026_competition_guide"


def test_document_omits_content_by_default(client) -> None:
    body = client.get(DOCUMENT).json()
    assert body["content"] is None
    assert body["chunk_count"] > 0
    assert body["source_type"] == "hwpx"


def test_document_can_include_content(client) -> None:
    body = client.get(DOCUMENT, params={"include_content": True}).json()
    assert body["content"]


def test_chunk_links_to_neighbours(client) -> None:
    """원문 보기에서 앞뒤 문단으로 이동할 수 있어야 한다."""
    body = client.get(f"{DOCUMENT}/chunks/chunk_0142").json()
    assert body["page"] == 12
    assert body["prev_chunk_id"] == "chunk_0141"
    assert body["next_chunk_id"] == "chunk_0143"

    first = client.get(f"{DOCUMENT}/chunks/chunk_0141").json()
    assert first["prev_chunk_id"] is None


def test_unknown_document_and_chunk_return_404(client) -> None:
    missing_document = client.get("/api/v1/documents/no_such_doc")
    assert missing_document.status_code == 404
    assert missing_document.json()["error"]["code"] == "document_not_found"

    missing_chunk = client.get(f"{DOCUMENT}/chunks/chunk_9999")
    assert missing_chunk.status_code == 404
    assert missing_chunk.json()["error"]["code"] == "chunk_not_found"
