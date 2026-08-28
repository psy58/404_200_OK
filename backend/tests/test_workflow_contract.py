#!/usr/bin/env python3 -m pytest
"""/workflows 계약."""

WORKFLOW = "/api/v1/workflows/science_competition"


def statuses(detail: dict) -> list[str]:
    return [step["status"] for step in detail["steps"]]


def test_list_matches_detail(client) -> None:
    listing = client.get("/api/v1/workflows").json()
    assert listing["total"] == len(listing["workflows"])

    summary = next(
        item for item in listing["workflows"] if item["workflow_id"] == "science_competition"
    )
    detail = client.get(WORKFLOW).json()
    assert summary["step_count"] == len(detail["steps"])
    assert summary["completed_step_count"] == statuses(detail).count("completed")
    assert summary["current_step"] == next(
        step["name"] for step in detail["steps"] if step["status"] == "current"
    )


def test_detail_has_exactly_one_current_step(client) -> None:
    detail = client.get(WORKFLOW).json()
    assert statuses(detail).count("current") == 1
    # 완료 → 진행 중 → 대기 순서가 뒤섞이지 않는다.
    assert statuses(detail) == ["completed", "completed", "current", "pending", "pending"]


def test_completed_steps_carry_a_timestamp(client) -> None:
    for step in client.get(WORKFLOW).json()["steps"]:
        if step["status"] == "completed":
            assert step["completed_at"] is not None
        else:
            assert step["completed_at"] is None


def test_complete_advances_the_current_step(client) -> None:
    detail = client.post(f"{WORKFLOW}/steps/3/complete", json={"completed": True}).json()
    assert statuses(detail) == ["completed", "completed", "completed", "current", "pending"]
    assert detail["steps"][2]["completed_at"] is not None


def test_complete_is_idempotent(client) -> None:
    """중복 클릭이나 재전송이 에러가 되지 않는다."""
    first = client.post(f"{WORKFLOW}/steps/3/complete", json={"completed": True})
    second = client.post(f"{WORKFLOW}/steps/3/complete", json={"completed": True})
    assert first.status_code == second.status_code == 200
    assert statuses(second.json()).count("completed") == 3


def test_complete_can_be_undone(client) -> None:
    client.post(f"{WORKFLOW}/steps/3/complete", json={"completed": True})
    detail = client.post(f"{WORKFLOW}/steps/3/complete", json={"completed": False}).json()
    assert statuses(detail) == ["completed", "completed", "current", "pending", "pending"]
    assert detail["steps"][2]["completed_at"] is None


def test_completed_defaults_to_true(client) -> None:
    assert client.post(f"{WORKFLOW}/steps/3/complete", json={}).status_code == 200


def test_unknown_workflow_and_step_return_404(client) -> None:
    missing_workflow = client.get("/api/v1/workflows/no_such_workflow")
    assert missing_workflow.status_code == 404
    assert missing_workflow.json()["error"]["code"] == "workflow_not_found"

    missing_step = client.post(f"{WORKFLOW}/steps/99/complete", json={"completed": True})
    assert missing_step.status_code == 404
    assert missing_step.json()["error"]["code"] == "step_not_found"


def test_feedback_returns_the_difference(client) -> None:
    """설계 문서 9항의 예상/실제 흐름 비교를 그대로 돌려준다."""
    body = client.post(
        f"{WORKFLOW}/feedback",
        json={
            "type": "missing_step",
            "after_step_id": "2",
            "suggested_step_name": "개인정보 동의",
            "description": "학생들에게 개인정보 동의서를 먼저 받았습니다.",
        },
    ).json()

    assert body["diff"]["expected"] == ["학생 선발", "참가 신청"]
    assert body["diff"]["reported"] == ["학생 선발", "개인정보 동의", "참가 신청"]
    assert body["feedback_id"]


def test_feedback_requires_a_description(client) -> None:
    response = client.post(f"{WORKFLOW}/feedback", json={"type": "missing_step"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_feedback_rejects_unknown_step(client) -> None:
    response = client.post(
        f"{WORKFLOW}/feedback",
        json={"type": "missing_step", "after_step_id": "99", "description": "..."},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "step_not_found"
