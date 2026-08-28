"""업무 네비게이터 데스크톱 프로그램 (Tkinter).

    python gui.py

브라우저도 서버도 띄우지 않는다. 프로그램 하나만 실행하면 된다.
질문을 넣으면 문서를 찾아 답을 만들고, 업무 흐름과 근거 문서를 함께 보여 준다.

    ┌──────────────────────────────────────────────┐
    │ 질문 [                                ] [질문] │
    │ 업무 [ 전체에서 찾기 ▾ ]                        │
    ├──────────────────────────────────────────────┤
    │ 답변                                          │
    ├───────────────────────┬──────────────────────┤
    │ 업무 흐름              │ 근거 문서              │
    │  ✓ 학생 모집           │  0.59 지정 신청서      │
    │  ▶ 참가 신청  [완료]    │  0.55 지정 계획       │
    └───────────────────────┴──────────────────────┘

백엔드는 API를 거치지 않고 서비스 계층을 그대로 부른다. 화면과 로직이 한
프로세스 안에 있으므로 포트도 서버도 필요 없다. 나중에 백엔드를 다른 컴퓨터에
두게 되면 아래 Backend 클래스만 HTTP 호출로 바꾸면 된다.
"""

import queue
import sys
import threading
import tkinter as tk
from dataclasses import dataclass
from pathlib import Path
from tkinter import messagebox, ttk

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

TITLE = "업무 네비게이터"
FONT = ("맑은 고딕", 10)
FONT_BOLD = ("맑은 고딕", 10, "bold")
FONT_ANSWER = ("맑은 고딕", 11)
ALL_WORKFLOWS = "전체에서 찾기"

STATUS_MARK = {"completed": "✓", "current": "▶", "pending": "·"}


class Backend:
    """서비스 계층을 부르는 자리. 화면은 여기만 거친다."""

    def __init__(self) -> None:
        from app.models.query import QueryRequest
        from app.models.workflow import FeedbackRequest, StepCompleteRequest
        from app.services import document_service, query_service, workflow_service

        self._QueryRequest = QueryRequest
        self._StepCompleteRequest = StepCompleteRequest
        self._FeedbackRequest = FeedbackRequest
        self._documents = document_service
        self._query = query_service
        self._workflows = workflow_service

    def engine_name(self) -> str:
        return type(self._query.get_engine()).__name__

    def list_workflows(self):
        return self._workflows.list_workflows().workflows

    def get_workflow(self, workflow_id: str):
        return self._workflows.get_workflow(workflow_id)

    def ask(self, question: str, workflow_id: str | None):
        return self._query.answer_query(
            self._QueryRequest(query=question, workflow_id=workflow_id)
        )

    def complete_step(self, workflow_id: str, step_id: str, completed: bool):
        return self._workflows.complete_step(
            workflow_id, step_id, self._StepCompleteRequest(completed=completed)
        )

    def get_chunk(self, document_id: str, chunk_id: str):
        return self._documents.get_chunk(document_id, chunk_id)


@dataclass
class Task:
    """백그라운드에서 끝난 일. 화면 갱신은 반드시 주 스레드에서 한다."""

    kind: str
    result: object = None
    error: str | None = None


class Application(tk.Tk):
    def __init__(self, backend: Backend | None = None) -> None:
        super().__init__()
        self.title(TITLE)
        self.geometry("1060x760")
        self.minsize(880, 620)

        # 시험할 때는 가짜 백엔드를 끼운다. OpenAI를 부르지 않기 위해서다.
        self.backend = backend or Backend()
        self.tasks: queue.Queue[Task] = queue.Queue()
        self.workflow_ids: dict[str, str] = {}  # 화면에 보이는 이름 -> 업무 id
        self.current_workflow: str | None = None
        self.documents: list = []
        self.steps: list = []

        self._build()
        self.after(100, self._drain_tasks)
        self._run("workflows", self.backend.list_workflows)

    # ---------- 화면 만들기 ----------

    def _build(self) -> None:
        style = ttk.Style(self)
        style.configure(".", font=FONT)
        style.configure("Treeview", rowheight=24)
        style.configure("Heading.TLabel", font=FONT_BOLD)

        outer = ttk.Frame(self, padding=12)
        outer.pack(fill="both", expand=True)

        # 질문
        ask = ttk.Frame(outer)
        ask.pack(fill="x")
        ttk.Label(ask, text="질문", style="Heading.TLabel").grid(row=0, column=0, padx=(0, 8))
        self.question = ttk.Entry(ask, font=FONT)
        self.question.grid(row=0, column=1, sticky="ew")
        self.question.bind("<Return>", lambda _event: self.on_ask())
        self.ask_button = ttk.Button(ask, text="질문하기", command=self.on_ask)
        self.ask_button.grid(row=0, column=2, padx=(8, 0))
        ask.columnconfigure(1, weight=1)

        scope = ttk.Frame(outer)
        scope.pack(fill="x", pady=(8, 0))
        ttk.Label(scope, text="업무").grid(row=0, column=0, padx=(0, 8))
        self.workflow_box = ttk.Combobox(
            scope, state="readonly", values=[ALL_WORKFLOWS], font=FONT
        )
        self.workflow_box.set(ALL_WORKFLOWS)
        self.workflow_box.grid(row=0, column=1, sticky="w")
        self.workflow_box.bind("<<ComboboxSelected>>", self.on_workflow_selected)

        for text in (
            "과학대회 참가하려면 뭐부터 해야 하나요?",
            "외부 강사비 지출할 때 필요한 서류가 뭔가요?",
        ):
            ttk.Button(
                scope, text=text, command=lambda t=text: self.on_example(t)
            ).grid(row=0, column=scope.grid_size()[0], padx=(8, 0))

        # 답변
        ttk.Label(outer, text="답변", style="Heading.TLabel").pack(
            anchor="w", pady=(14, 4)
        )
        self.answer = tk.Text(
            outer, height=6, wrap="word", font=FONT_ANSWER, relief="solid",
            borderwidth=1, padx=12, pady=10, background="#fbfcfd", state="disabled",
        )
        self.answer.pack(fill="x")

        # 진행 흐름 — 이 업무가 시간순으로 어떻게 흘러왔는지
        ttk.Label(outer, text="진행 흐름", style="Heading.TLabel").pack(
            anchor="w", pady=(14, 4)
        )
        self.timeline_list = ttk.Treeview(
            outer, columns=("date", "direction", "kind", "title"), show="headings", height=7
        )
        for column, heading, width, stretch in (
            ("date", "날짜", 92, False),
            ("direction", "구분", 84, False),
            ("kind", "종류", 78, False),
            ("title", "문서", 560, True),
        ):
            self.timeline_list.heading(column, text=heading)
            self.timeline_list.column(column, width=width, stretch=stretch)
        self.timeline_list.pack(fill="x")

        # 아래 두 칸
        panes = ttk.Panedwindow(outer, orient="horizontal")
        panes.pack(fill="both", expand=True, pady=(14, 0))

        flow = ttk.Frame(panes)
        ttk.Label(flow, text="업무 흐름", style="Heading.TLabel").pack(anchor="w")
        self.step_list = ttk.Treeview(
            flow, columns=("name", "date"), show="tree headings", height=8
        )
        self.step_list.heading("#0", text="")
        self.step_list.heading("name", text="단계")
        self.step_list.heading("date", text="완료일")
        self.step_list.column("#0", width=36, stretch=False, anchor="center")
        self.step_list.column("name", width=220)
        self.step_list.column("date", width=90, stretch=False)
        self.step_list.pack(fill="both", expand=True, pady=(4, 6))
        self.step_list.bind("<Double-1>", lambda _event: self.on_toggle_step())

        self.step_button = ttk.Button(
            flow, text="선택한 단계 완료", command=self.on_toggle_step, state="disabled"
        )
        self.step_button.pack(anchor="w")
        panes.add(flow, weight=1)

        evidence = ttk.Frame(panes)
        ttk.Label(evidence, text="근거 문서", style="Heading.TLabel").pack(anchor="w")
        self.document_list = ttk.Treeview(
            evidence, columns=("score", "title"), show="headings", height=8
        )
        self.document_list.heading("score", text="관련도")
        self.document_list.heading("title", text="문서")
        self.document_list.column("score", width=64, stretch=False, anchor="center")
        self.document_list.column("title", width=380)
        self.document_list.pack(fill="both", expand=True, pady=(4, 6))
        self.document_list.bind("<Double-1>", lambda _event: self.on_open_document())

        ttk.Button(evidence, text="원문 보기", command=self.on_open_document).pack(anchor="w")
        panes.add(evidence, weight=1)

        self.status = ttk.Label(outer, text="", foreground="#5a6270")
        self.status.pack(anchor="w", pady=(10, 0))

    # ---------- 백그라운드 일 ----------

    def _run(self, kind: str, work, *args) -> None:
        """느린 일은 따로 돌린다. 그러지 않으면 답을 기다리는 동안 창이 멎는다."""

        def worker() -> None:
            try:
                self.tasks.put(Task(kind=kind, result=work(*args)))
            except Exception as error:  # 창이 죽는 것보다 메시지가 낫다
                self.tasks.put(Task(kind=kind, error=str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def _drain_tasks(self) -> None:
        while True:
            try:
                task = self.tasks.get_nowait()
            except queue.Empty:
                break
            self._handle(task)
        self.after(100, self._drain_tasks)

    def _handle(self, task: Task) -> None:
        if task.error:
            self.ask_button.state(["!disabled"])
            self.set_status(f"오류: {task.error}")
            if task.kind != "workflows":
                messagebox.showerror(TITLE, task.error)
            return

        if task.kind == "workflows":
            self.show_workflows(task.result)
        elif task.kind == "answer":
            self.show_answer(task.result)
        elif task.kind == "workflow":
            self.show_steps(task.result)
        elif task.kind == "chunk":
            self.show_chunk(task.result)

    # ---------- 그리기 ----------

    def set_status(self, text: str) -> None:
        self.status.configure(text=text)

    def show_workflows(self, workflows) -> None:
        self.workflow_ids = {}
        names = [ALL_WORKFLOWS]
        for workflow in workflows:
            label = f"{workflow.name} ({workflow.completed_step_count}/{workflow.step_count})"
            self.workflow_ids[label] = workflow.workflow_id
            names.append(label)
        self.workflow_box.configure(values=names)
        if self.workflow_box.get() not in names:
            self.workflow_box.set(ALL_WORKFLOWS)
        self.set_status(f"업무 {len(workflows)}건 · 검색 엔진 {self.backend.engine_name()}")

    def show_answer(self, response) -> None:
        self.ask_button.state(["!disabled"])
        self.answer.configure(state="normal")
        self.answer.delete("1.0", "end")
        self.answer.insert("1.0", response.message)
        self.answer.configure(state="disabled")

        self.timeline_list.delete(*self.timeline_list.get_children())
        for entry in response.data.timeline:
            self.timeline_list.insert(
                "",
                "end",
                values=(
                    entry.date.isoformat() if entry.date else "날짜 미상",
                    # 담당자가 알고 싶은 것은 "이걸 교육청에 내야 하나"다
                    entry.audience
                    or ("교육청 수신" if entry.direction == "received" else "내부 진행"),
                    entry.kind,
                    entry.title,
                ),
            )

        self.documents = response.data.documents
        self.document_list.delete(*self.document_list.get_children())
        for document in self.documents:
            page = f" (p.{document.page})" if document.page else ""
            self.document_list.insert(
                "", "end", values=(f"{document.relevance:.2f}", document.title + page)
            )

        workflow = response.data.workflow
        if workflow:
            self.current_workflow = workflow.workflow_id
            self._run("workflow", self.backend.get_workflow, workflow.workflow_id)
        else:
            self.current_workflow = None
            self.steps = []
            self.step_list.delete(*self.step_list.get_children())
            self.step_button.state(["disabled"])

        found = len(self.documents)
        flow = len(response.data.timeline)
        name = f" · {workflow.name}" if workflow else " · 업무를 찾지 못했습니다"
        self.set_status(f"근거 문서 {found}건 · 진행 흐름 {flow}건{name}")

    def show_steps(self, detail) -> None:
        self.steps = detail.steps
        self.step_list.delete(*self.step_list.get_children())
        for step in detail.steps:
            # completed_at 은 datetime 이다. 날짜만 보여 준다.
            completed_at = step.completed_at.date().isoformat() if step.completed_at else ""
            self.step_list.insert(
                "",
                "end",
                text=STATUS_MARK.get(step.status.value, "·"),
                values=(step.name, completed_at),
            )
        self.step_button.state(["!disabled"] if detail.steps else ["disabled"])

    def show_chunk(self, chunk) -> None:
        window = tk.Toplevel(self)
        window.title(chunk.title[:60])
        window.geometry("760x560")

        header = f"{chunk.title}\n{chunk.chunk_id}" + (
            f" · {chunk.page}쪽" if chunk.page else ""
        )
        ttk.Label(window, text=header, style="Heading.TLabel", padding=(12, 10)).pack(
            anchor="w"
        )

        frame = ttk.Frame(window, padding=(12, 0, 12, 12))
        frame.pack(fill="both", expand=True)
        text = tk.Text(frame, wrap="word", font=FONT, relief="solid", borderwidth=1,
                       padx=12, pady=10)
        scroll = ttk.Scrollbar(frame, orient="vertical", command=text.yview)
        text.configure(yscrollcommand=scroll.set)
        text.insert("1.0", chunk.content)
        text.configure(state="disabled")
        text.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")

        nav = ttk.Frame(window, padding=(12, 0, 12, 12))
        nav.pack(fill="x")
        for label, target in (("← 앞 문단", chunk.prev_chunk_id), ("뒤 문단 →", chunk.next_chunk_id)):
            button = ttk.Button(
                nav,
                text=label,
                command=lambda t=target: (
                    window.destroy(),
                    self._run("chunk", self.backend.get_chunk, chunk.document_id, t),
                ),
            )
            button.pack(side="left", padx=(0, 6))
            if not target:
                button.state(["disabled"])

    # ---------- 사용자 동작 ----------

    def selected_workflow_id(self) -> str | None:
        return self.workflow_ids.get(self.workflow_box.get())

    def on_workflow_selected(self, _event=None) -> None:
        workflow_id = self.selected_workflow_id()
        if workflow_id:
            self.current_workflow = workflow_id
            self._run("workflow", self.backend.get_workflow, workflow_id)

    def on_example(self, text: str) -> None:
        self.question.delete(0, "end")
        self.question.insert(0, text)
        self.on_ask()

    def on_ask(self) -> None:
        question = self.question.get().strip()
        if not question:
            return
        self.ask_button.state(["disabled"])
        self.set_status("문서를 찾고 답을 만드는 중…")
        self._run("answer", self.backend.ask, question, self.selected_workflow_id())

    def on_toggle_step(self) -> None:
        selection = self.step_list.selection()
        if not selection or not self.current_workflow:
            return
        index = self.step_list.index(selection[0])
        step = self.steps[index]
        completed = step.status.value == "completed"

        self._run(
            "workflow",
            self.backend.complete_step,
            self.current_workflow,
            step.step_id,
            not completed,
        )
        self._run("workflows", self.backend.list_workflows)
        self.set_status(f"'{step.name}' 단계를 {'되돌립니다' if completed else '완료합니다'}")

    def on_open_document(self) -> None:
        selection = self.document_list.selection()
        if not selection:
            return
        document = self.documents[self.document_list.index(selection[0])]
        if not document.chunk_id:
            messagebox.showinfo(TITLE, "이 문서에는 볼 수 있는 원문 조각이 없습니다.")
            return
        self._run("chunk", self.backend.get_chunk, document.document_id, document.chunk_id)


def main() -> None:
    Application().mainloop()


if __name__ == "__main__":
    main()
