#!/usr/bin/env python3 -m pytest
"""담당자가 화면에서 만든 상태의 저장.

체크리스트 확인·경험 노트·알림 읽음·업로드는 산출물과 달리 재생성할 수 없다.
서버를 다시 켜도 남아야 하고, zod 계약 그대로 화면에 돌아가야 한다.
"""

import io
from pathlib import Path

import pytest

from app.services import state_store


def first_task(client) -> dict:
    items = client.get("/api/frontend/tasks").json()["items"]
    if not items:
        pytest.skip("생성된 워크플로가 없습니다.")
    return items[0]


def projected_task(client) -> dict:
    items = client.get("/api/frontend/tasks").json()["items"]
    task = next((t for t in items if t["id"].startswith("wf26_")), None)
    if task is None:
        pytest.skip("투영된 업무가 없습니다.")
    return task


# --- 체크리스트 ---------------------------------------------------------------


def test_checklist_toggle_is_saved_and_counted(client) -> None:
    task = first_task(client)
    item = client.get(f"/api/frontend/task-details/{task['id']}").json()["checklist"][0]

    detail = client.post(
        f"/api/frontend/task-details/{task['id']}/checklist/{item['id']}",
        json={"done": not item["done"]},
    ).json()
    toggled = next(c for c in detail["checklist"] if c["id"] == item["id"])
    assert toggled["done"] == (not item["done"])

    # 목록의 n/m 카운트가 상세와 어긋나면 안 된다
    row = next(
        t for t in client.get("/api/frontend/tasks").json()["items"]
        if t["id"] == task["id"]
    )
    assert row["checklist_done"] == sum(1 for c in detail["checklist"] if c["done"])


def test_checking_a_projected_task_moves_it_out_of_planned(client) -> None:
    """담당자가 확인을 시작했으면 그 업무는 더는 '예정'이 아니다."""
    task = projected_task(client)
    client.post(
        f"/api/frontend/task-details/{task['id']}/checklist/1", json={"done": True}
    )
    row = next(
        t for t in client.get("/api/frontend/tasks").json()["items"]
        if t["id"] == task["id"]
    )
    assert row["status"] == "in_progress"
    assert row["checklist_done"] == 1


def test_checklist_state_survives_a_restart(client, tmp_path) -> None:
    task = first_task(client)
    client.post(
        f"/api/frontend/task-details/{task['id']}/checklist/1", json={"done": True}
    )
    # 서버 재시작 = 저장소를 같은 파일로 다시 여는 것
    state_store.reset(tmp_path / "user_state.json")
    assert state_store.checklist_overlay(task["id"]).get("1") is True


def test_toggling_a_missing_item_is_404_and_saves_nothing(client) -> None:
    task = first_task(client)
    response = client.post(
        f"/api/frontend/task-details/{task['id']}/checklist/999", json={"done": True}
    )
    assert response.status_code == 404
    assert state_store.checklist_overlay(task["id"]) == {}


# --- 경험 노트 ----------------------------------------------------------------


def test_saved_note_comes_back_in_the_list(client) -> None:
    task = first_task(client)
    created = client.post(
        "/api/frontend/experience-notes",
        json={"task_id": task["id"], "visibility": "handover", "body": "강사 섭외는 6월에"},
    ).json()
    assert created["task_title"] == task["title"]
    assert created["is_mine"] is True

    items = client.get("/api/frontend/experience-notes").json()["items"]
    assert [n["id"] for n in items] == [created["id"]]
    assert items[0]["body"] == "강사 섭외는 6월에"


def test_note_without_a_task_is_a_general_memo(client) -> None:
    created = client.post(
        "/api/frontend/experience-notes", json={"body": "프린터 토너는 행정실"}
    ).json()
    assert created["task_title"] == "일반 메모"
    assert created["visibility"] == "private"


def test_empty_note_is_rejected(client) -> None:
    assert (
        client.post("/api/frontend/experience-notes", json={"body": ""}).status_code
        == 422
    )


# --- 알림 읽음 ----------------------------------------------------------------


def test_mark_all_read_sticks(client) -> None:
    before = client.get("/api/frontend/notifications").json()["items"]
    if not before:
        pytest.skip("알림이 없습니다.")
    assert any(n["is_new"] for n in before)

    marked = client.post("/api/frontend/notifications/read", json={"all": True}).json()
    assert marked["marked"] == len(before)

    after = client.get("/api/frontend/notifications").json()["items"]
    assert all(not n["is_new"] for n in after)


def test_notification_ids_are_stable_so_read_marks_do_not_slip(client) -> None:
    """순번 id면 목록이 바뀔 때 읽음 표시가 다른 알림으로 미끄러진다."""
    items = client.get("/api/frontend/notifications").json()["items"]
    if not items:
        pytest.skip("알림이 없습니다.")
    again = client.get("/api/frontend/notifications").json()["items"]
    assert [n["id"] for n in items] == [n["id"] for n in again]
    assert all(n["id"] == f"n_{n['related_task_id']}" for n in items)


# --- 업로드 -------------------------------------------------------------------


def upload(client, name: str, content: bytes = b"x"):
    return client.post(
        "/api/frontend/uploads",
        files={"file": (name, io.BytesIO(content), "application/octet-stream")},
    )


def test_upload_saves_the_file_and_the_record(client) -> None:
    from app.api.frontend import UPLOAD_DIR

    record = upload(client, "운영 계획.hwp", b"hwp-bytes").json()
    assert record["size"] == 9
    assert "인제스트" in record["note"]  # 분석까지 됐다고 말하지 않는다

    saved = UPLOAD_DIR / f"{record['id']}_운영 계획.hwp"
    assert saved.exists() and saved.read_bytes() == b"hwp-bytes"
    saved.unlink()

    listed = client.get("/api/frontend/uploads").json()["items"]
    assert [r["id"] for r in listed] == [record["id"]]


def test_upload_filename_cannot_escape_the_folder(client) -> None:
    from app.api.frontend import UPLOAD_DIR

    record = upload(client, "../../몰래.txt").json()
    assert "/" not in record["filename"] and ".." not in record["filename"]
    for leftover in UPLOAD_DIR.glob(f"{record['id']}_*"):
        assert leftover.parent == UPLOAD_DIR
        leftover.unlink()


def test_broken_state_file_does_not_take_the_server_down(tmp_path: Path) -> None:
    path = tmp_path / "user_state.json"
    path.write_text("{깨진 json", encoding="utf-8")
    state_store.reset(path)
    assert state_store.notes() == []  # 빈 상태로 뜨고
    assert path.with_suffix(".broken.json").exists()  # 원본은 치워 둔다


# --- 직접 추가한 업무 ----------------------------------------------------------


def test_created_task_shows_up_in_the_list(client) -> None:
    created = client.post(
        "/api/frontend/tasks",
        json={
            "title": "2026 신규 창의융합 캠프",
            "start_date": "2026-10-01",
            "due_date": "2026-11-30",
        },
    ).json()
    assert created["id"].startswith("cust_")
    assert created["status"] == "planned"  # 아직 멀었다

    items = client.get("/api/frontend/tasks").json()["items"]
    assert any(t["id"] == created["id"] for t in items)


def test_created_task_has_a_workable_checklist(client) -> None:
    created = client.post(
        "/api/frontend/tasks", json={"title": "새 업무", "start_date": "2026-09-01"}
    ).json()
    detail = client.get(f"/api/frontend/task-details/{created['id']}").json()
    assert len(detail["checklist"]) == created["checklist_total"]
    assert "직접 추가한 업무" in detail["guideline_change_notice"]

    # 확인하면 목록 상태가 진행중으로 바뀐다
    client.post(
        f"/api/frontend/task-details/{created['id']}/checklist/1", json={"done": True}
    )
    row = next(
        t for t in client.get("/api/frontend/tasks").json()["items"]
        if t["id"] == created["id"]
    )
    assert row["status"] == "in_progress" and row["checklist_done"] == 1


def test_created_task_survives_a_restart(client, tmp_path) -> None:
    created = client.post("/api/frontend/tasks", json={"title": "지속 확인"}).json()
    state_store.reset(tmp_path / "user_state.json")
    assert any(t["id"] == created["id"] for t in state_store.custom_tasks())


def test_empty_title_is_rejected(client) -> None:
    assert client.post("/api/frontend/tasks", json={"title": ""}).status_code == 422
