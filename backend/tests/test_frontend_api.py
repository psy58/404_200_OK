#!/usr/bin/env python3 -m pytest
"""React 프론트엔드용 API 계약.

프론트는 응답을 zod(src/domain/raw-schemas.ts)로 검증한 뒤에만 쓴다.
필드 하나만 어긋나도 화면이 ContractIssue 로 죽으므로, zod가 요구하는
키·enum 을 여기 박아 두고 우리 응답이 정확히 그 형태인지 본다.

zod 를 바꾸는 PR은 이 파일도 함께 바꿔야 한다.
"""

import pytest

# src/domain/raw-schemas.ts 와 1:1. 여기 키를 바꿀 일이 생기면 zod 먼저 본다.
ZOD_KEYS = {
    "assignment": {"id", "name", "active_from", "status", "task_count"},  # note는 선택
    "task": {
        "id", "assignment_id", "title", "category", "status",
        "recommended_start_date", "official_due_date", "previous_actual_date",
        "checklist_done", "checklist_total",
        "timeline_month_start", "timeline_month_end", "rationale",
    },
    "feed": {"id", "title", "issuer", "received_at", "hint", "related_task_id"},
    "document": {
        "id", "title", "document_number", "source_type", "related_task_title",
        "issued_at", "analysis_status", "verification_status",
    },
    "notification": {"id", "title", "message", "kind", "is_new", "related_task_id"},
    "checklist_item": {"id", "text", "note", "done"},
    "evidence_link": {"level", "title", "detail", "source_type"},
    "timeline_event": {"date", "event"},
    "form_ref": {"id", "title", "meta"},
}

TASK_STATUS = {"in_progress", "upcoming", "planned", "complete"}
SOURCE_TYPE = {"official", "school_case"}
NOTIFICATION_KIND = {"due", "prep", "doc", "evidence_update", "analysis_complete"}


def keys_of(item: dict, kind: str) -> None:
    """필수 키가 다 있고, zod 가 모르는 키를 보내지 않는지."""
    required = ZOD_KEYS[kind]
    missing = required - set(item)
    assert not missing, f"{kind}에 빠진 키: {missing}"


@pytest.fixture(scope="module")
def api():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


def get(api, path: str) -> dict:
    response = api.get(path)
    assert response.status_code == 200, path
    return response.json()


# --- 목록 응답들 -------------------------------------------------------------


def test_assignments_shape(api) -> None:
    body = get(api, "/api/frontend/assignments")
    assert set(body["school"]) == {"id", "name", "academic_year"}
    assert isinstance(body["school"]["academic_year"], int)
    for item in body["items"]:
        keys_of(item, "assignment")
        assert item["status"] in {"server_allowed", "proposed_by_school"}


def test_tasks_shape(api) -> None:
    for item in get(api, "/api/frontend/tasks")["items"]:
        keys_of(item, "task")
        assert item["status"] in TASK_STATUS
        assert 0 <= item["timeline_month_start"] <= 11
        assert item["timeline_month_start"] <= item["timeline_month_end"] <= 11
        assert item["checklist_done"] <= item["checklist_total"]


def test_feed_shape(api) -> None:
    for item in get(api, "/api/frontend/feed")["items"]:
        keys_of(item, "feed")
        assert item["received_at"]  # 날짜 없는 공문은 피드에 싣지 않는다


def test_documents_shape(api) -> None:
    for item in get(api, "/api/frontend/documents")["items"]:
        keys_of(item, "document")
        assert item["source_type"] in SOURCE_TYPE
        assert item["document_number"]  # zod 는 빈 값도 통과시키지만 화면이 허전해진다


def test_notifications_shape(api) -> None:
    for item in get(api, "/api/frontend/notifications")["items"]:
        keys_of(item, "notification")
        assert item["kind"] in NOTIFICATION_KIND


def test_notes_are_empty_not_fabricated(api) -> None:
    """노트 저장 기능이 아직 없다. 가짜 노트를 지어내 보내지 않는다."""
    assert get(api, "/api/frontend/experience-notes")["items"] == []


# --- 업무 상세 ---------------------------------------------------------------


def first_task_id(api) -> str | None:
    items = get(api, "/api/frontend/tasks")["items"]
    return items[0]["id"] if items else None


def test_task_detail_shape(api) -> None:
    task_id = first_task_id(api)
    if task_id is None:
        pytest.skip("생성된 워크플로가 없습니다(data/ 없이 실행).")

    body = get(api, f"/api/frontend/task-details/{task_id}")
    assert body["task_id"] == task_id
    for item in body["checklist"]:
        keys_of(item, "checklist_item")
    for item in body["evidence_chain"]:
        keys_of(item, "evidence_link")
        assert item["source_type"] in SOURCE_TYPE
    for item in body["previous_timeline"]:
        keys_of(item, "timeline_event")
        assert item["date"]  # 날짜 없는 사건은 싣지 않는다
    for item in body["related_forms"]:
        keys_of(item, "form_ref")


def test_task_detail_checklist_matches_the_task_row(api) -> None:
    """목록의 2/6 와 상세의 체크 표시가 어긋나면 안 된다."""
    items = get(api, "/api/frontend/tasks")["items"]
    if not items:
        pytest.skip("생성된 워크플로가 없습니다.")
    task = items[0]
    detail = get(api, f"/api/frontend/task-details/{task['id']}")
    assert len(detail["checklist"]) == task["checklist_total"]
    assert sum(1 for c in detail["checklist"] if c["done"]) == task["checklist_done"]


def test_unknown_task_detail_is_404(api) -> None:
    assert api.get("/api/frontend/task-details/no_such_task").status_code == 404


# --- 정적 mock 경로의 별칭 ----------------------------------------------------


def test_mock_path_aliases_serve_the_same_payload(api) -> None:
    """프론트가 지금 fetch 하는 경로 그대로도 응답해야 한다.

    이 별칭 덕에 vite proxy 에 재작성 규칙이 필요 없고, React 빌드를
    이 서버가 함께 서빙해도 그대로 동작한다.
    """
    for name in ("assignments", "tasks", "feed", "documents", "notifications"):
        canonical = get(api, f"/api/frontend/{name}")
        aliased = get(api, f"/mocks/backend/{name}.json")
        assert canonical == aliased

    task_id = first_task_id(api)
    if task_id:
        assert get(api, f"/mocks/backend/task-details/{task_id}.json") == get(
            api, f"/api/frontend/task-details/{task_id}"
        )


# --- 날짜 → 학년도 축 변환 ----------------------------------------------------


def test_month_axis_starts_in_march() -> None:
    """연간 지도는 3월 시작 축을 쓴다. 8월이면 5다(프론트 mock과 동일 규칙)."""
    from app.services.frontend_service import _month_index

    assert _month_index("2026-03-01") == 0
    assert _month_index("2026-08-31") == 5
    assert _month_index("2027-02-15") == 11
    assert _month_index(None) == 0


# --- optional vs nullable ----------------------------------------------------
#
# zod 의 .optional() 은 "키가 없어도 된다"이고 null 은 허용하지 않는다.
# .nullable() 은 반대로 키가 반드시 있어야 한다. 실제로 상세 화면이
# guideline_change_notice: null 때문에 ContractIssue 로 죽은 적이 있다.


def test_optional_fields_are_omitted_not_sent_as_null(api) -> None:
    task_id = first_task_id(api)
    if task_id is None:
        pytest.skip("생성된 워크플로가 없습니다.")
    detail = get(api, f"/api/frontend/task-details/{task_id}")
    if "guideline_change_notice" in detail:
        assert isinstance(detail["guideline_change_notice"], str)

    for item in get(api, "/api/frontend/assignments")["items"]:
        if "note" in item:
            assert isinstance(item["note"], str)


def test_nullable_fields_always_keep_their_key(api) -> None:
    for item in get(api, "/api/frontend/feed")["items"]:
        assert "related_task_id" in item  # null 이어도 키는 있어야 한다
    for item in get(api, "/api/frontend/notifications")["items"]:
        assert "related_task_id" in item


# --- 올해 업무 투영 -----------------------------------------------------------
#
# 지금은 2026학년도다. 작년(2025-03~2026-02) 공문은 "작년 기록"이고,
# 화면의 내 업무는 올해 것이어야 한다. 올해 문서가 없는 사업은 작년 흐름을
# 한 해 밀어 권장 일정으로 보여 준다.


@pytest.fixture(autouse=True)
def fixed_today():
    from datetime import date

    from app.services import frontend_service

    frontend_service.TODAY_OVERRIDE = date(2026, 8, 29)
    yield
    frontend_service.TODAY_OVERRIDE = None


def test_academic_year_starts_in_march() -> None:
    from datetime import date

    from app.services.frontend_service import _academic_year

    assert _academic_year(date(2026, 8, 29)) == 2026
    assert _academic_year(date(2026, 1, 15)) == 2025  # 1월은 아직 작년 학년도


def test_school_reports_the_current_academic_year(api) -> None:
    body = get(api, "/api/frontend/assignments")
    assert body["school"]["academic_year"] == 2026


def test_tasks_are_for_this_year_not_last_year(api) -> None:
    """모든 업무가 올해(2026학년도) 것이어야 한다.

    단, 시작일은 작년일 수 있다 — 다음 해 사업의 공모 안내는 전년도
    말에 온다(실제로 2026년 AI 중점학교 공모가 2025-12-29에 접수됐다).
    투영된 업무의 권장 일정만 올해 날짜다.
    """
    items = get(api, "/api/frontend/tasks")["items"]
    if not items:
        pytest.skip("생성된 워크플로가 없습니다.")
    for item in items:
        assert item["title"].startswith("2026년"), item["title"]
        if item["id"].startswith("wf26_"):
            assert item["recommended_start_date"] >= "2026-"


def test_projected_task_is_honest_about_having_no_documents(api) -> None:
    items = get(api, "/api/frontend/tasks")["items"]
    projected = [t for t in items if t["id"].startswith("wf26_")]
    if not projected:
        pytest.skip("투영된 업무가 없습니다.")
    for task in projected:
        assert task["checklist_done"] == 0  # 올해 문서가 없으니 완료도 없다
        assert task["status"] in {"upcoming", "planned"}  # 진행중이라 말하지 않는다
        assert task["previous_actual_date"] < "2026-03"  # 작년 실제 처리일


def test_projected_detail_carries_last_years_record(api) -> None:
    items = get(api, "/api/frontend/tasks")["items"]
    projected = next((t for t in items if t["id"].startswith("wf26_")), None)
    if projected is None:
        pytest.skip("투영된 업무가 없습니다.")

    detail = get(api, f"/api/frontend/task-details/{projected['id']}")
    assert all(not c["done"] for c in detail["checklist"])
    # 작년 진행 흐름이 참조로 실린다
    assert detail["previous_timeline"]
    assert all(e["date"] < "2026-03" for e in detail["previous_timeline"])
    # 작년 기록으로 구성했다고 밝힌다
    assert "작년" in detail.get("guideline_change_notice", "")


def test_real_current_year_task_links_last_years_timeline(api) -> None:
    """올해 문서가 있는 업무도 '작년 진행 흐름'은 작년 워크플로에서 온다."""
    items = get(api, "/api/frontend/tasks")["items"]
    real = next((t for t in items if not t["id"].startswith("wf26_")), None)
    if real is None:
        pytest.skip("올해 실문서 업무가 없습니다.")
    detail = get(api, f"/api/frontend/task-details/{real['id']}")
    assert detail["task_id"] == real["id"]


def test_notifications_point_at_current_year_tasks(api) -> None:
    task_ids = {t["id"] for t in get(api, "/api/frontend/tasks")["items"]}
    for item in get(api, "/api/frontend/notifications")["items"]:
        assert item["related_task_id"] in task_ids
        assert "작년" in item["message"]  # 알림의 근거는 작년 기록이다


def test_feed_links_point_at_current_year_tasks(api) -> None:
    """피드의 이동 링크는 올해 업무 id여야 한다.

    작년 워크플로 id를 주면 상세 페이지가 업무 목록에서 찾지 못해
    "이 업무를 찾을 수 없습니다"가 떴다. 실제로 그랬다.
    """
    task_ids = {t["id"] for t in get(api, "/api/frontend/tasks")["items"]}
    for item in get(api, "/api/frontend/feed")["items"]:
        if item["related_task_id"] is not None:
            assert item["related_task_id"] in task_ids


def test_documents_name_the_current_year_task(api) -> None:
    titles = {t["title"] for t in get(api, "/api/frontend/tasks")["items"]}
    for item in get(api, "/api/frontend/documents")["items"]:
        if item["related_task_title"] != "일반 문서":
            assert item["related_task_title"] in titles
