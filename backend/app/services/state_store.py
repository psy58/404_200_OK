"""담당자가 화면에서 만든 상태를 담는 저장소.

체크리스트 확인, 경험 노트, 알림 읽음, 업로드 기록 — 문서에서 만들어 낸
산출물(workflows.json 등)과 달리 이것은 **사람이 만든 기록**이라 다시 만들 수
없다. 산출물은 언제든 재생성하지만 이 파일은 지우면 안 된다.

data/user_state.json 한 파일에 담고, 쓸 때는 임시 파일에 쓴 뒤 바꿔치기해
중간에 죽어도 파일이 깨지지 않게 한다. DB 없이 파일인 이유: 사용자가 한 명
(담당 교사)이고 항목이 수백 건을 넘지 않는다. 규모가 생기면 이 모듈만
갈아 끼운다.
"""

import json
import os
import tempfile
import threading
from pathlib import Path

from .. import settings

STATE_PATH = settings.DATA_DIR / "user_state.json"

_EMPTY: dict = {
    "checklist": {},  # {task_id: {step_id: bool}}
    "notes": [],  # [{id, task_id, task_title, academic_year, visibility, body, created_at}]
    "read_notifications": [],  # [notification_id]
    "uploads": [],  # [{id, filename, size, uploaded_at, status}]
    "custom_tasks": [],  # 담당자가 직접 추가한 업무 카드
    "custom_assignments": [],  # 담당자가 직접 추가한 담당 업무(분장)
}

_lock = threading.Lock()


class _Store:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or STATE_PATH
        self.data: dict = {}
        self.loaded = False

    def load(self) -> dict:
        if not self.loaded:
            self.data = {key: json.loads(json.dumps(value)) for key, value in _EMPTY.items()}
            if self.path.exists():
                try:
                    with open(self.path, encoding="utf-8") as stream:
                        saved = json.load(stream)
                    for key in _EMPTY:
                        if key in saved:
                            self.data[key] = saved[key]
                except (json.JSONDecodeError, OSError) as exc:
                    # 깨진 파일을 덮어쓰지 않도록 옆에 치워 둔다
                    print(f"[state] {self.path} 를 읽지 못했습니다: {exc}")
                    try:
                        self.path.rename(self.path.with_suffix(".broken.json"))
                    except OSError:
                        pass
            self.loaded = True
        return self.data

    def save(self) -> None:
        """임시 파일에 쓴 뒤 바꿔치기한다. 쓰다 죽어도 원본은 남는다."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temp_name = tempfile.mkstemp(
            dir=self.path.parent, prefix=".state_", suffix=".tmp"
        )
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", errors="replace") as stream:
                json.dump(self.data, stream, ensure_ascii=False, indent=2)
            os.replace(temp_name, self.path)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)


_store = _Store()


def reset(path: Path | None = None) -> None:
    """테스트가 다른 파일로 갈아 끼운다."""
    global _store
    _store = _Store(path)


def _mutate(update) -> dict:
    with _lock:
        data = _store.load()
        result = update(data)
        _store.save()
        return result


# --- 체크리스트 ---------------------------------------------------------------


def checklist_overlay(task_id: str) -> dict[str, bool]:
    """이 업무에서 담당자가 손으로 바꾼 확인 상태. {step_id: done}"""
    return dict(_store.load().get("checklist", {}).get(task_id, {}))


def set_checklist_item(task_id: str, step_id: str, done: bool) -> None:
    def update(data: dict):
        data.setdefault("checklist", {}).setdefault(task_id, {})[step_id] = done

    _mutate(update)


# --- 경험 노트 ----------------------------------------------------------------


def notes() -> list[dict]:
    return list(_store.load().get("notes", []))


def add_note(note: dict) -> dict:
    def update(data: dict):
        stored = data.setdefault("notes", [])
        note["id"] = f"note_{len(stored) + 1:04d}"
        stored.append(note)
        return note

    return _mutate(update)


# --- 알림 읽음 ----------------------------------------------------------------


def read_notification_ids() -> set[str]:
    return set(_store.load().get("read_notifications", []))


def mark_notifications_read(ids: list[str]) -> int:
    def update(data: dict):
        stored = set(data.setdefault("read_notifications", []))
        before = len(stored)
        stored.update(ids)
        data["read_notifications"] = sorted(stored)
        return len(stored) - before

    return _mutate(update)


# --- 직접 추가한 업무 ----------------------------------------------------------


def custom_tasks() -> list[dict]:
    return list(_store.load().get("custom_tasks", []))


def add_custom_task(task: dict) -> dict:
    def update(data: dict):
        stored = data.setdefault("custom_tasks", [])
        task["id"] = f"cust_{len(stored) + 1:04d}"
        stored.append(task)
        return task

    return _mutate(update)


# --- 직접 추가한 담당 업무 ------------------------------------------------------


def custom_assignments() -> list[dict]:
    return list(_store.load().get("custom_assignments", []))


def add_custom_assignment(assignment: dict) -> dict:
    def update(data: dict):
        stored = data.setdefault("custom_assignments", [])
        assignment["id"] = f"duty_{len(stored) + 1:04d}"
        stored.append(assignment)
        return assignment

    return _mutate(update)


# --- 업로드 -------------------------------------------------------------------


def uploads() -> list[dict]:
    return list(_store.load().get("uploads", []))


def add_upload(record: dict) -> dict:
    def update(data: dict):
        stored = data.setdefault("uploads", [])
        record["id"] = f"up_{len(stored) + 1:04d}"
        stored.append(record)
        return record

    return _mutate(update)


def update_upload(record_id: str, **fields) -> dict | None:
    """배경 처리(변환→분할→색인)가 진행 상태를 남긴다."""

    def update(data: dict):
        for row in data.setdefault("uploads", []):
            if row["id"] == record_id:
                row.update({k: v for k, v in fields.items() if v is not None})
                return row
        return None

    return _mutate(update)
