#!/usr/bin/env python3 -m pytest
"""/query 계약.

프론트가 이 응답 형태에 맞춰 개발하므로, 계약을 깨는 변경은
여기서 먼저 실패해야 한다.
"""

import pytest

from app.models.query import QueryResponse


def test_query_returns_message_and_data(client) -> None:
    response = client.post(
        "/api/v1/query", json={"query": "과학대회 참가하려면 뭐부터 해야 하나요?"}
    )
    assert response.status_code == 200

    body = response.json()
    assert set(body) == {"query_id", "message", "data"}
    # 스키마에 맞지 않으면 여기서 ValidationError로 실패한다.
    assert QueryResponse.model_validate(body).message.strip()


def test_documents_are_sorted_by_relevance(client) -> None:
    body = client.post("/api/v1/query", json={"query": "참가 신청 서류가 뭔가요?"}).json()
    scores = [doc["relevance"] for doc in body["data"]["documents"]]
    assert scores == sorted(scores, reverse=True)


def test_document_ids_can_be_fetched(client) -> None:
    """근거 문서의 document_id·chunk_id는 그대로 문서 API 경로에 쓸 수 있어야 한다."""
    body = client.post("/api/v1/query", json={"query": "참가 신청"}).json()
    document = body["data"]["documents"][0]

    assert client.get(f"/api/v1/documents/{document['document_id']}").status_code == 200
    assert (
        client.get(
            f"/api/v1/documents/{document['document_id']}/chunks/{document['chunk_id']}"
        ).status_code
        == 200
    )


def test_next_action_step_id_can_be_null(client) -> None:
    """워크플로에 없는 안내성 할 일은 step_id가 없다.
    프론트는 이때 완료 버튼을 그리지 않는다."""
    body = client.post("/api/v1/query", json={"query": "과학대회 준비"}).json()
    step_ids = [action["step_id"] for action in body["data"]["next_actions"]]
    assert None in step_ids
    assert any(step_id is not None for step_id in step_ids)


def test_workflow_id_is_optional(client) -> None:
    assert client.post("/api/v1/query", json={"query": "다음 단계는?"}).status_code == 200
    assert (
        client.post(
            "/api/v1/query",
            json={"query": "다음 단계는?", "workflow_id": "science_competition"},
        ).status_code
        == 200
    )


@pytest.mark.parametrize(
    "payload",
    [
        {},  # query 누락
        {"query": ""},  # 빈 질문
        {"query": "x" * 1001},  # 최대 길이 초과
    ],
)
def test_invalid_requests_are_rejected(client, payload: dict) -> None:
    response = client.post("/api/v1/query", json=payload)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
