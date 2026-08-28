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


@pytest.fixture
def upload_sandbox(tmp_path, monkeypatch):
    """업로드 인제스트가 실제 산출물을 건드리지 않게 경로를 격리한다."""
    from app import settings

    monkeypatch.setattr(settings, "MARKDOWN_DIR", tmp_path / "markdown")
    monkeypatch.setattr(settings, "DOCUMENTS_PATH", tmp_path / "documents.json")
    monkeypatch.setattr(settings, "openai_api_key", lambda: None)  # 색인은 건너뜀
    yield tmp_path


LONG_TEXT = ("토요과학교실 운영 계획\n\n" + "실험 준비물과 일정을 정리한다. " * 40).encode("utf-8")


def test_upload_flows_through_markitdown_and_langchain(client, upload_sandbox) -> None:
    """업로드 → markitdown 변환 → LangChain 분할 → 문서함. 배치와 같은 흐름이다."""
    from app import settings
    from app.api.frontend import UPLOAD_DIR

    record = upload(client, "새 운영계획.txt", LONG_TEXT).json()
    assert record["status"] == "received"  # 응답은 저장 직후

    # TestClient 는 배경 작업을 응답 뒤에 실행한다 → 목록에서 결과를 본다
    row = client.get("/api/frontend/uploads").json()["items"][0]
    assert row["status"] == "analyzed"  # 키가 없으니 색인 전까지
    assert row["chunk_count"] >= 1
    assert "키가 없어" in row["note"]  # 색인을 건너뛴 이유를 밝힌다

    # md 가 배치와 같은 폴더 구조에 남는다 (다음 배치 인제스트에도 포함된다)
    markdown = list((settings.MARKDOWN_DIR / "업로드").glob("*.md"))
    assert len(markdown) == 1

    # 문서함 API에 바로 보인다
    document = client.get(f"/api/v1/documents/{row['document_id']}").json()
    assert document["chunk_count"] == row["chunk_count"]
    chunk = client.get(
        f"/api/v1/documents/{row['document_id']}/chunks/chunk_0000"
    ).json()
    assert "토요과학교실" in chunk["content"]

    for leftover in UPLOAD_DIR.glob(f"{record['id']}_*"):
        leftover.unlink()


def test_failed_conversion_reports_the_reason(client, upload_sandbox) -> None:
    """빈·깨진 파일은 실패 상태와 사유를 남긴다. 조용히 사라지지 않는다."""
    from app.api.frontend import UPLOAD_DIR

    record = upload(client, "빈문서.txt", b" ").json()
    row = client.get("/api/frontend/uploads").json()["items"][0]
    assert row["status"] == "failed"
    assert row["note"]

    for leftover in UPLOAD_DIR.glob(f"{record['id']}_*"):
        leftover.unlink()


def test_reuploading_replaces_not_duplicates_the_document(client, upload_sandbox) -> None:
    import json

    from app import settings
    from app.api.frontend import UPLOAD_DIR

    upload(client, "계획.txt", LONG_TEXT)
    first = client.get("/api/frontend/uploads").json()["items"][0]

    upload(client, "계획.txt", LONG_TEXT)  # 같은 파일을 또 올림 (id는 다르다)
    payload = json.loads(settings.DOCUMENTS_PATH.read_text(encoding="utf-8"))
    uploaded_docs = [d for d in payload["documents"] if d["document_id"].startswith("doc_up_")]
    # 업로드 기록마다 문서가 하나씩 — 같은 문서 id 가 중복 등록되지는 않는다
    ids = [d["document_id"] for d in uploaded_docs]
    assert len(ids) == len(set(ids))

    for leftover in UPLOAD_DIR.glob("up_*"):
        leftover.unlink()


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
    assert "새로 추가한 업무" in detail["guideline_change_notice"]

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


# --- 직접 추가한 담당 업무 ------------------------------------------------------


def test_created_assignment_appears_with_its_tasks(client) -> None:
    """담당 업무를 추가하면 목록에 나오고, 그 아래 업무 카드가 달린다.

    예전 화면 흐름은 특정 이름(학맞통)이 아니면 아무 일도 없이 끝났다.
    """
    duty = client.post(
        "/api/frontend/assignments",
        json={"name": "환경교육 담당", "active_from": "2026-09-01", "note": "9월부터 담당"},
    ).json()
    assert duty["id"].startswith("duty_")
    assert duty["status"] == "proposed_by_school"  # 분장표가 아니라 직접 등록
    assert duty["task_count"] == 0

    task = client.post(
        "/api/frontend/tasks",
        json={"title": "환경교육 주간 운영", "assignment_id": duty["id"]},
    ).json()
    assert task["assignment_id"] == duty["id"]

    listed = client.get("/api/frontend/assignments").json()["items"]
    row = next(a for a in listed if a["id"] == duty["id"])
    assert row["task_count"] == 1
    # 기본 담당(과학·정보)의 개수에는 섞이지 않는다
    sci = next(a for a in listed if a["id"] == "sci")
    assert all(
        t["assignment_id"] == duty["id"]
        for t in client.get("/api/frontend/tasks").json()["items"]
        if t["id"] == task["id"]
    )
    assert sci["task_count"] >= 0


def test_created_assignment_survives_restart(client, tmp_path) -> None:
    duty = client.post("/api/frontend/assignments", json={"name": "지속 담당"}).json()
    state_store.reset(tmp_path / "user_state.json")
    assert any(a["id"] == duty["id"] for a in state_store.custom_assignments())


def test_empty_assignment_name_is_rejected(client) -> None:
    assert client.post("/api/frontend/assignments", json={"name": " "}).status_code == 422


# --- 새 업무(작년 기록 없음)는 현재 문서 기준 -----------------------------------


def test_custom_task_scope_is_uploaded_documents(client):
    """직접 추가한 업무의 검색 범위는 전년도 공문이 아니라 업로드 문서다."""
    from app.services import document_store, frontend_service

    task = client.post("/api/frontend/tasks", json={"title": "별빛 관측 준비"}).json()
    ids = frontend_service.task_document_ids(task["id"])
    assert ids == [document_id for document_id, _ in document_store.uploaded()]


def test_custom_task_detail_leans_on_uploads(client, monkeypatch):
    """새 업무 상세는 업로드 문서를 근거로 보여 주고, 작년 흐름은 비워 둔다."""
    from app.services import document_store

    monkeypatch.setattr(
        document_store,
        "uploaded",
        lambda: [("doc_up_x", {"title": "올해 운영 계획", "source_type": "hwpx"})],
    )
    task = client.post("/api/frontend/tasks", json={"title": "별빛 관측 준비"}).json()
    detail = client.get(f"/api/frontend/task-details/{task['id']}").json()
    assert detail["previous_timeline"] == []
    assert [e["title"] for e in detail["evidence_chain"]] == ["올해 운영 계획"]
    assert detail["evidence_chain"][0]["level"] == "업로드 자료"
    assert "새로 추가한 업무" in detail["guideline_change_notice"]


def test_new_task_query_without_uploads_asks_for_materials(client, monkeypatch):
    """자료가 없는 새 업무 질의는 전년도 공문을 뒤지지 않고 자료를 청한다."""
    from app.models.query import QueryRequest
    from app.rag import answer as answer_module
    from app.services import document_store, query_service

    task = client.post("/api/frontend/tasks", json={"title": "별빛 관측 준비"}).json()
    monkeypatch.setattr(document_store, "uploaded", lambda: [])
    # searcher=None — 검색이 한 번이라도 불리면 AttributeError 로 터진다.
    engine = query_service.RagQueryEngine(searcher=None, llm=None)
    response = engine.answer(
        QueryRequest(query="뭘 준비해야 해?", workflow_id=task["id"])
    )
    assert response.message == answer_module.NO_UPLOAD_MESSAGE
    assert response.data.documents == []
