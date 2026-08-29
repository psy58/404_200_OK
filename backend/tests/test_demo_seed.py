"""Docker demo seed와 업로드 방어선."""

from pathlib import Path

import pytest

from app import settings
from app.services import frontend_service


@pytest.fixture
def demo_seed(monkeypatch):
    monkeypatch.setattr(settings, "DEMO_SEED_ENABLED", True)
    monkeypatch.setattr(
        settings,
        "DEMO_SEED_DIR",
        Path(__file__).resolve().parents[2] / "public" / "mocks" / "backend",
    )
    frontend_service.reset()
    yield
    frontend_service.reset()


def test_demo_seed_flows_through_fastapi_aliases(client, demo_seed) -> None:
    assignments = client.get("/mocks/backend/assignments.json").json()
    tasks = client.get("/mocks/backend/tasks.json").json()

    assert assignments["items"]
    assert tasks["items"]
    assert any(task["id"] == "t2" for task in tasks["items"])

    detail = client.get("/mocks/backend/task-details/t2.json").json()
    assert detail["task_id"] == "t2"
    assert detail["evidence_chain"]


def test_demo_checklist_and_notifications_use_persistent_overlay(client, demo_seed) -> None:
    changed = client.post(
        "/api/frontend/task-details/t2/checklist/c4", json={"done": True}
    )
    assert changed.status_code == 200
    assert next(item for item in changed.json()["checklist"] if item["id"] == "c4")["done"]

    task = next(
        item for item in client.get("/api/frontend/tasks").json()["items"]
        if item["id"] == "t2"
    )
    assert task["checklist_done"] == 4

    assert any(
        item["is_new"]
        for item in client.get("/api/frontend/notifications").json()["items"]
    )
    client.post("/api/frontend/notifications/read", json={"all": True})
    assert not any(
        item["is_new"]
        for item in client.get("/api/frontend/notifications").json()["items"]
    )


def test_upload_rejects_unsupported_type_and_oversized_body(
    client, demo_seed, monkeypatch
) -> None:
    unsupported = client.post(
        "/api/frontend/uploads", files={"file": ("payload.exe", b"MZ", "application/octet-stream")}
    )
    assert unsupported.status_code == 415
    assert unsupported.json()["error"]["code"] == "upload_type_not_allowed"

    monkeypatch.setattr(settings, "MAX_UPLOAD_BYTES", 8)
    oversized = client.post(
        "/api/frontend/uploads", files={"file": ("large.txt", b"123456789", "text/plain")}
    )
    assert oversized.status_code == 413
    assert oversized.json()["error"]["code"] == "upload_too_large"


def test_csv_matches_the_frontend_upload_contract(
    client, demo_seed, monkeypatch
) -> None:
    from app.api import frontend

    monkeypatch.setattr(frontend.upload_ingest, "process_upload", lambda *_args: None)
    accepted = client.post(
        "/api/frontend/uploads",
        files={"file": ("schedule.csv", b"date,title\n2026-08-28,demo\n", "text/csv")},
    )
    assert accepted.status_code == 200
    assert accepted.json()["filename"] == "schedule.csv"
    for leftover in frontend.UPLOAD_DIR.glob(f"{accepted.json()['id']}_*"):
        leftover.unlink()
