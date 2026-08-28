#!/usr/bin/env python3 -m pytest
"""데스크톱 프로그램(Tkinter).

창을 실제로 만들되 화면에 띄우지는 않는다. 백엔드 자리에는 가짜를 끼워
OpenAI를 부르지 않는다. 화면이 그리는 값과 눌렀을 때 도는 흐름만 본다.
"""

import tkinter
from datetime import date, datetime, timezone

import pytest

import gui
from app.models.common import (
    DocumentResult,
    NextAction,
    StageRef,
    StepStatus,
    TimelineEntry,
    WorkflowRef,
)
from app.models.document import ChunkDetail
from app.models.query import QueryData, QueryResponse
from app.models.workflow import WorkflowDetail, WorkflowStep, WorkflowSummary


class FakeBackend:
    def __init__(self) -> None:
        self.completed: list[tuple[str, str, bool]] = []
        self.asked: list[tuple[str, str | None]] = []

    def engine_name(self) -> str:
        return "FakeEngine"

    def list_workflows(self):
        return [
            WorkflowSummary(
                workflow_id="science_competition",
                name="과학대회 참가",
                step_count=3,
                completed_step_count=1,
                current_step="학생 선발",
            )
        ]

    def get_workflow(self, workflow_id: str):
        return WorkflowDetail(
            workflow_id=workflow_id,
            name="과학대회 참가",
            steps=[
                WorkflowStep(
                    step_id="1",
                    name="학생 모집",
                    status=StepStatus.COMPLETED,
                    completed_at=datetime(2025, 8, 25, 9, 0, tzinfo=timezone.utc),
                ),
                WorkflowStep(step_id="2", name="학생 선발", status=StepStatus.CURRENT),
                WorkflowStep(step_id="3", name="참가 신청", status=StepStatus.PENDING),
            ],
        )

    def ask(self, question: str, workflow_id: str | None):
        self.asked.append((question, workflow_id))
        return QueryResponse(
            query_id="qry_test",
            message="참가 신청서를 30일 전까지 제출하세요.",
            data=QueryData(
                workflow=WorkflowRef(workflow_id="science_competition", name="과학대회 참가"),
                current_stage=StageRef(step_id="1", name="학생 모집"),
                next_stage=StageRef(step_id="2", name="학생 선발"),
                next_actions=[NextAction(step_id="2", title="학생 선발")],
                timeline=[
                    TimelineEntry(
                        document_id="doc_notice",
                        title="대회 개최 안내",
                        date=date(2025, 3, 2),
                        kind="안내·공모",
                        direction="received",
                        audience="교육청 수신",
                    ),
                    TimelineEntry(
                        document_id="doc_plan",
                        title="참가 운영 계획",
                        date=None,
                        kind="계획",
                        direction="drafted",
                        audience="교육청 제출",
                    ),
                ],
                documents=[
                    DocumentResult(
                        document_id="doc_a",
                        chunk_id="chunk_0001",
                        title="참가 지침",
                        page=12,
                        snippet="30일 전까지 제출한다.",
                        relevance=0.87,
                    )
                ],
            ),
        )

    def complete_step(self, workflow_id: str, step_id: str, completed: bool):
        self.completed.append((workflow_id, step_id, completed))
        return self.get_workflow(workflow_id)

    def get_chunk(self, document_id: str, chunk_id: str):
        return ChunkDetail(
            document_id=document_id,
            chunk_id=chunk_id,
            title="참가 지침",
            page=12,
            content="참가 신청은 대회 30일 전까지 제출한다.",
            prev_chunk_id=None,
            next_chunk_id="chunk_0002",
        )


@pytest.fixture
def app():
    try:
        application = gui.Application(backend=FakeBackend())
    except tkinter.TclError as error:  # 화면 없는 환경
        pytest.skip(f"창을 만들 수 없습니다: {error}")
    application.withdraw()  # 시험 중에는 띄우지 않는다
    pump(application)
    yield application
    application.destroy()


def pump(application, rounds: int = 40) -> None:
    """백그라운드에서 끝난 일이 화면에 반영될 때까지 이벤트를 돌린다."""
    for _ in range(rounds):
        application.update()
        application.after(10)


def test_workflows_fill_the_selector(app) -> None:
    values = app.workflow_box.cget("values")
    assert values[0] == gui.ALL_WORKFLOWS
    assert "과학대회 참가 (1/3)" in values


def test_asking_shows_the_answer_and_the_evidence(app) -> None:
    app.question.insert(0, "참가 신청 서류")
    app.on_ask()
    pump(app)

    assert "30일 전까지" in app.answer.get("1.0", "end")
    rows = [app.document_list.item(i, "values") for i in app.document_list.get_children()]
    assert rows == [("0.87", "참가 지침 (p.12)")]


def test_question_is_limited_to_the_selected_workflow(app) -> None:
    app.workflow_box.set("과학대회 참가 (1/3)")
    app.question.insert(0, "다음 단계는?")
    app.on_ask()
    pump(app)

    assert app.backend.asked[-1] == ("다음 단계는?", "science_competition")


def test_steps_show_their_state_and_date(app) -> None:
    app.question.insert(0, "참가 신청")
    app.on_ask()
    pump(app)

    rows = [
        (app.step_list.item(i, "text"), *app.step_list.item(i, "values"))
        for i in app.step_list.get_children()
    ]
    assert rows[0] == ("✓", "학생 모집", "2025-08-25")  # datetime 을 날짜로 보여 준다
    assert rows[1][0] == "▶"
    assert rows[2][0] == "·"


def test_completing_a_step_calls_the_backend(app) -> None:
    app.question.insert(0, "참가 신청")
    app.on_ask()
    pump(app)

    app.step_list.selection_set(app.step_list.get_children()[1])
    app.on_toggle_step()
    pump(app)

    assert app.backend.completed == [("science_competition", "2", True)]


def test_completed_step_can_be_undone(app) -> None:
    app.question.insert(0, "참가 신청")
    app.on_ask()
    pump(app)

    app.step_list.selection_set(app.step_list.get_children()[0])  # 이미 완료된 단계
    app.on_toggle_step()
    pump(app)

    assert app.backend.completed[-1] == ("science_competition", "1", False)


def test_opening_a_document_shows_the_original_text(app) -> None:
    app.question.insert(0, "참가 신청")
    app.on_ask()
    pump(app)

    app.document_list.selection_set(app.document_list.get_children()[0])
    app.on_open_document()
    pump(app)

    windows = [w for w in app.winfo_children() if isinstance(w, tkinter.Toplevel)]
    assert len(windows) == 1
    text = windows[0].winfo_children()[1].winfo_children()[0].get("1.0", "end")
    assert "30일 전까지" in text


def test_timeline_is_shown_in_date_order(app) -> None:
    """이 업무가 언제 무엇을 거쳐 왔는지 한눈에 보여야 한다."""
    app.question.insert(0, "참가 신청")
    app.on_ask()
    pump(app)

    rows = [
        app.timeline_list.item(i, "values") for i in app.timeline_list.get_children()
    ]
    assert rows[0] == ("2025-03-02", "교육청 수신", "안내·공모", "대회 개최 안내")
    assert rows[1] == ("날짜 미상", "교육청 제출", "계획", "참가 운영 계획")


def test_empty_question_does_nothing(app) -> None:
    app.on_ask()
    pump(app, rounds=5)
    assert app.backend.asked == []


# --- 실행 파일(.bat) ---------------------------------------------------------

LAUNCHERS = sorted((gui.BACKEND_DIR.parent).glob("*.bat"))


def test_launchers_exist() -> None:
    assert LAUNCHERS, "두 번 눌러 실행할 .bat 파일이 있어야 한다."


@pytest.mark.parametrize("path", LAUNCHERS, ids=lambda p: p.name)
def test_launcher_is_readable_by_cmd(path) -> None:
    """cmd는 한글 주석과 LF 줄바꿈을 명령으로 잘못 읽는다.

    실제로 그렇게 만들었다가 실행이 안 됐다. ASCII와 CRLF만 쓴다.
    """
    raw = path.read_bytes()
    assert b"\r\n" in raw, "줄바꿈이 CRLF여야 한다."
    assert raw.isascii(), "cmd가 읽는 파일에는 한글을 넣지 않는다."


@pytest.mark.parametrize("path", LAUNCHERS, ids=lambda p: p.name)
def test_launcher_points_at_a_real_entry_point(path) -> None:
    text = path.read_text(encoding="ascii")
    assert ".venv\Scripts\pythonw.exe" in text
    script = "gui.py" if "gui.py" in text else "desktop.py"
    assert (gui.BACKEND_DIR / script).exists()
