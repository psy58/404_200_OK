"""실데이터를 프론트엔드 화면 형태로 옮긴다.

    workflows.json  ─┐
                     ├─▶ assignments / tasks / task-details / notifications
    relations.json  ─┘        documents / feed

프론트는 mock JSON(public/mocks/backend/*.json)을 zod로 검증해 화면을
그린다. 이 모듈은 그 mock과 똑같은 형태를 실제 문서에서 만들어 낸다.
프론트 화면·어댑터는 한 줄도 바꾸지 않고 데이터만 진짜가 된다.

모든 값은 이미 만들어 둔 산출물에서 읽는다. LLM도 임베딩도 부르지 않으므로
이 API들은 키 없이, 몇 ms 안에 답한다.
"""

import json
from datetime import date, datetime, timedelta
from pathlib import Path

from .. import settings
from ..errors import not_found
from ..ingest import relations
from ..models import frontend as dto
from ..rag import doctype, timeline
from . import state_store, statute_service

ASSIGNMENT_ID = "sci"  # 이 말뭉치는 전부 과학·정보 담당 문서다

# 시험에서 오늘을 고정할 때 쓴다. None 이면 실제 오늘.
TODAY_OVERRIDE: date | None = None


def _today() -> date:
    return TODAY_OVERRIDE or date.today()


def _academic_year(day: date) -> int:
    """학년도는 3월에 시작한다. 2026년 1월은 2025학년도다."""
    return day.year if day.month >= 3 else day.year - 1


def _school() -> dto.School:
    return dto.School(
        id="sch_seg", name="숭의여자고등학교", academic_year=_academic_year(_today())
    )


PROJECTED_PREFIX = "wf26_"  # 작년 업무에서 투영한 올해 업무의 id 접두어
CUSTOM_PREFIX = "cust_"  # 담당자가 직접 추가한 업무의 id 접두어

# 직접 추가한 업무의 기본 단계. 작년 기록이 없으므로 흔한 흐름을 기본으로 두고,
# 진행은 체크리스트 확인으로 담당자가 직접 남긴다.
CUSTOM_STAGES = ["계획 수립", "신청·접수", "운영", "지출·정산", "결과 보고"]

FEED_LIMIT = 12
DOCUMENT_LIMIT = 60
NOTIFICATION_LIMIT = 8
EVIDENCE_LIMIT = 8
STATUTE_LIMIT = 5  # 근거 사슬에 붙일 법령 수

_TEMPLATE_CATEGORY = {
    "public_call": "공모 사업",
    "internal_program": "자체 운영",
    "request_and_settle": "지출 처리",
    "notice_only": "안내 수신",
}


class _Store:
    """워크플로·문서 산출물을 한 번만 읽어 둔다."""

    def __init__(self) -> None:
        self.workflows: list[dict] = []
        self.nodes: dict[str, dict] = {}
        self.attachments: dict[str, list[str]] = {}  # 본문 -> 첨부들
        self.document_workflow: dict[str, dict] = {}  # 문서 -> 소속 워크플로
        self.loaded = False

    def load(self) -> None:
        workflows_path = settings.DATA_DIR / "workflows.json"
        if workflows_path.exists():
            try:
                with open(workflows_path, encoding="utf-8") as stream:
                    self.workflows = json.load(stream).get("workflows", [])
            except (json.JSONDecodeError, OSError) as exc:
                print(f"[frontend] {workflows_path}를 읽지 못했습니다: {exc}")

        graph = relations.load()
        self.nodes = graph.get("nodes", {})
        self.attachments = {}
        for edge in graph.get("edges", []):
            if edge["type"] == relations.ATTACHMENT:
                self.attachments.setdefault(edge["source"], []).append(edge["target"])

        self.document_workflow = {}
        for workflow in self.workflows:
            for step in workflow["steps"]:
                for document_id in step.get("document_ids", []):
                    self.document_workflow.setdefault(document_id, workflow)
        self.loaded = True

    def ensure(self) -> "_Store":
        if not self.loaded:
            self.load()
        return self


_store = _Store()


def reset(path: Path | None = None) -> None:
    """테스트에서 산출물을 갈아 끼운 뒤 다시 읽게 한다."""
    global _store
    _store = _Store()


def _event_date(node: dict) -> str | None:
    for key in ("approval_date", "issuing_date", "receipt_date"):
        if node.get(key):
            return node[key]
    return None


def _month_index(value: str | None) -> int:
    """3월 시작 학년도 축의 0-기반 달 인덱스. 프론트 연간지도가 쓰는 좌표다."""
    if not value:
        return 0
    try:
        month = datetime.strptime(value[:10], "%Y-%m-%d").month
    except ValueError:
        return 0
    return (month - 3) % 12


def _source_type(node: dict) -> str:
    return "official" if node.get("direction") == "received" else "school_case"


# --- assignments -------------------------------------------------------------


def create_custom_assignment(
    name: str, active_from: str | None = None, note: str | None = None
) -> dto.Assignment:
    """담당 업무(분장)를 직접 추가한다. 업무 카드는 이 아래에 달린다."""
    saved = state_store.add_custom_assignment(
        {
            "name": name.strip(),
            "active_from": active_from or _today().isoformat(),
            "note": note,
            "created_at": _today().isoformat(),
        }
    )
    return _custom_assignment_dto(saved, task_count=0)


def _custom_assignment_dto(record: dict, task_count: int) -> dto.Assignment:
    return dto.Assignment(
        id=record["id"],
        name=record["name"],
        active_from=record.get("active_from") or _today().isoformat(),
        status="proposed_by_school",  # 서버 분장표가 아니라 담당자가 등록한 것
        note=record.get("note") or "직접 추가한 담당 업무",
        task_count=task_count,
    )


def assignments() -> dto.AssignmentsResponse:
    store = _store.ensure()
    year = _academic_year(_today())
    all_tasks = tasks().items
    counts: dict[str, int] = {}
    for task in all_tasks:
        counts[task.assignment_id] = counts.get(task.assignment_id, 0) + 1

    items = [
        dto.Assignment(
            id=ASSIGNMENT_ID,
            name="과학·정보",
            active_from=f"{year}-03-01",
            status="server_allowed",
            note=f"작년 공문 {len(store.nodes):,}건에서 올해 업무를 자동 구성",
            task_count=counts.get(ASSIGNMENT_ID, 0),
        )
    ]
    items.extend(
        _custom_assignment_dto(record, counts.get(record["id"], 0))
        for record in state_store.custom_assignments()
    )
    return dto.AssignmentsResponse(school=_school(), items=items)


# --- tasks -------------------------------------------------------------------


def _task_status(done: int, total: int) -> str:
    if total and done == total:
        return "complete"
    if done == 0:
        return "upcoming"
    return "in_progress"


def _workflow_dates(workflow: dict) -> tuple[str, str]:
    """(첫 활동일, 마지막 활동일). 문서에서 확인된 실제 날짜다."""
    dates = sorted(
        step["completed_at"] for step in workflow["steps"] if step.get("completed_at")
    )
    if not dates:
        fallback = workflow.get("updated_at") or f"{workflow.get('year') or _academic_year(_today())}-03-01"
        return fallback, fallback
    return dates[0], dates[-1]


def _step_done(step: dict, overlay: dict[str, bool]) -> bool:
    """단계 완료 여부. 문서에서 온 상태 위에 담당자의 손 확인을 덮는다."""
    if step["step_id"] in overlay:
        return overlay[step["step_id"]]
    return step["status"] == "completed"


def _to_task(workflow: dict) -> dto.Task:
    steps = workflow["steps"]
    overlay = state_store.checklist_overlay(workflow["workflow_id"])
    done = sum(1 for step in steps if _step_done(step, overlay))
    first, last = _workflow_dates(workflow)
    current = next((s for s in steps if s["status"] == "current"), None)

    rationale = workflow.get("description") or "문서에서 자동 구성한 업무입니다."
    rationale += f" 공문 {workflow.get('document_count', 0)}건에서 흐름을 복원했다."
    if current:
        rationale += f" 다음 할 일은 '{current['name']}'이다."

    return dto.Task(
        id=workflow["workflow_id"],
        assignment_id=ASSIGNMENT_ID,
        title=workflow["name"],
        category=_TEMPLATE_CATEGORY.get(workflow.get("template_id", ""), "일반"),
        status=_task_status(done, len(steps)),
        recommended_start_date=first,
        official_due_date=last,
        previous_actual_date=workflow.get("updated_at") or last,
        checklist_done=done,
        checklist_total=len(steps),
        timeline_month_start=_month_index(first),
        timeline_month_end=max(_month_index(first), _month_index(last)),
        rationale=rationale,
    )


def _shift_year(value: str) -> str:
    """작년 날짜를 올해 자리로 옮긴다. 2025-08-14 → 2026-08-14."""
    try:
        return f"{int(value[:4]) + 1}{value[4:]}"
    except (ValueError, TypeError):
        return value


def _series(store: _Store) -> dict[str, dict[int | None, dict]]:
    """사업 이름 → {학년도: 워크플로}. 올해와 작년을 짝짓는 데 쓴다."""
    series: dict[str, dict[int | None, dict]] = {}
    for workflow in store.workflows:
        series.setdefault(workflow["business_name"], {})[workflow.get("year")] = workflow
    return series


def _project_task(previous: dict) -> dto.Task:
    """작년 업무를 올해 자리로 투영한다.

    학교 업무는 대부분 해마다 되풀이된다. 올해 문서가 아직 없어도 작년 흐름이
    "언제 시작해서 언제 끝냈는지"를 알려 주므로, 그 날짜를 한 해 밀어 올해
    권장 일정으로 삼는다. 이것이 이 서비스의 요지다 — 작년 문서가 올해 업무를
    예고한다.
    """
    year = _academic_year(_today())
    first, last = _workflow_dates(previous)
    start, due = _shift_year(first), _shift_year(last)

    # 문서가 하나도 없으니 진행중일 수 없다. 시기가 오면 준비, 멀면 예정.
    status = "upcoming" if start <= (_today() + timedelta(days=14)).isoformat() else "planned"

    steps = previous["steps"]
    task_id = PROJECTED_PREFIX + previous["workflow_id"].removeprefix("wf_")
    overlay = state_store.checklist_overlay(task_id)
    done = sum(1 for value in overlay.values() if value)
    if done:  # 담당자가 확인을 시작했으면 더는 '예정'이 아니다
        status = "complete" if done == len(steps) else "in_progress"
    return dto.Task(
        id=task_id,
        assignment_id=ASSIGNMENT_ID,
        title=f"{year}년 {previous['business_name']}",
        category=_TEMPLATE_CATEGORY.get(previous.get("template_id", ""), "일반"),
        status=status,
        recommended_start_date=start,
        official_due_date=due,
        previous_actual_date=previous.get("updated_at") or last,  # 작년 실제 처리일
        checklist_done=done,
        checklist_total=len(steps),
        timeline_month_start=_month_index(start),
        timeline_month_end=max(_month_index(start), _month_index(due)),
        rationale=(
            f"작년에는 {first}부터 {last}까지 진행했다 (공문 {previous.get('document_count', 0)}건). "
            f"올해 문서는 아직 없다 — 작년 흐름을 근거로 한 권장 일정이다."
        ),
    )


def _custom_task_status(record: dict, done: int, total: int) -> str:
    if total and done == total:
        return "complete"
    if done:
        return "in_progress"
    start = record.get("start_date") or _today().isoformat()
    if start <= (_today() + timedelta(days=14)).isoformat():
        return "upcoming"
    return "planned"


def _custom_to_task(record: dict) -> dto.Task:
    overlay = state_store.checklist_overlay(record["id"])
    done = sum(1 for value in overlay.values() if value)
    total = len(CUSTOM_STAGES)
    start = record.get("start_date") or _today().isoformat()
    due = record.get("due_date") or start
    return dto.Task(
        id=record["id"],
        assignment_id=record.get("assignment_id") or ASSIGNMENT_ID,
        title=record["title"],
        category=record.get("category") or "직접 추가",
        status=_custom_task_status(record, done, total),
        recommended_start_date=start,
        official_due_date=due,
        # 작년 기록이 없다. 화면의 "작년 처리" 칸이 날짜를 요구해 시작일을 넣는다.
        previous_actual_date=start,
        checklist_done=done,
        checklist_total=total,
        timeline_month_start=_month_index(start),
        timeline_month_end=max(_month_index(start), _month_index(due)),
        rationale=record.get("memo") or "담당자가 직접 추가한 업무다. 작년 기록 없이 시작한다.",
    )


def create_custom_task(
    title: str,
    start_date: str | None = None,
    due_date: str | None = None,
    category: str | None = None,
    memo: str | None = None,
    assignment_id: str | None = None,
) -> dto.Task:
    saved = state_store.add_custom_task(
        {
            "title": title.strip(),
            "start_date": start_date,
            "due_date": due_date,
            "category": category,
            "memo": memo,
            "assignment_id": assignment_id or ASSIGNMENT_ID,
            "created_at": _today().isoformat(),
        }
    )
    return _custom_to_task(saved)


def tasks() -> dto.TasksResponse:
    """올해(현재 학년도) 업무 목록.

    올해 문서가 이미 있는 사업은 그대로, 없는 사업은 작년 업무를 투영해
    싣는다. 작년 기록 자체는 각 업무 상세의 '작년 진행 흐름'으로 남는다.
    """
    store = _store.ensure()
    year = _academic_year(_today())

    items = []
    for by_year in _series(store).values():
        current, previous = by_year.get(year), by_year.get(year - 1)
        if current:
            task = _to_task(current)
            if previous:  # 작년 실제 처리일은 작년 기록에서 온다
                task.previous_actual_date = previous.get("updated_at") or task.previous_actual_date
            items.append(task)
        elif previous:
            items.append(_project_task(previous))

    items.extend(_custom_to_task(record) for record in state_store.custom_tasks())
    items.sort(key=lambda t: t.recommended_start_date)
    return dto.TasksResponse(items=items)


# --- task detail -------------------------------------------------------------


def _checklist(workflow: dict) -> list[dto.ChecklistItem]:
    overlay = state_store.checklist_overlay(workflow["workflow_id"])
    items = []
    for step in workflow["steps"]:
        if step.get("completed_at"):
            note = f"{step['completed_at']} 완료 · 문서 {len(step.get('document_ids', []))}건"
        elif step["status"] == "current":
            note = "지금 할 차례"
        else:
            note = ""
        items.append(
            dto.ChecklistItem(
                id=step["step_id"],
                text=step["name"],
                note=note,
                done=_step_done(step, overlay),
            )
        )
    return items


def _workflow_documents(workflow: dict, store: _Store) -> list[tuple[str, dict, str]]:
    """(문서id, 노드, 단계이름)을 날짜순으로."""
    rows = []
    for step in workflow["steps"]:
        for document_id in step.get("document_ids", []):
            node = store.nodes.get(document_id)
            if node:
                rows.append((document_id, node, step["name"]))
    rows.sort(key=lambda row: _event_date(row[1]) or "9999")
    return rows


def _sibling(store: _Store, workflow: dict, year: int) -> dict | None:
    """같은 사업의 다른 학년도 워크플로."""
    return _series(store).get(workflow["business_name"], {}).get(year)


def _projected_checklist(task_id: str, previous: dict) -> list[dto.ChecklistItem]:
    """투영 업무의 체크리스트. 작년과 같은 단계, 전부 미완료.

    첫 단계를 '지금 할 차례'로 두고, 작년에 언제 했는지를 메모로 붙인다.
    담당자가 확인한 항목(state_store)은 그 위에 덮인다.
    """
    overlay = state_store.checklist_overlay(task_id)
    items = []
    for index, step in enumerate(previous["steps"]):
        note = f"작년 {step['completed_at']} 처리" if step.get("completed_at") else ""
        items.append(
            dto.ChecklistItem(
                id=step["step_id"],
                text=step["name"],
                note=("지금 할 차례 · " + note).rstrip(" ·") if index == 0 else note,
                done=overlay.get(step["step_id"], False),
            )
        )
    return items


def _custom_task_detail(task_id: str) -> dto.TaskDetail:
    record = next(
        (r for r in state_store.custom_tasks() if r["id"] == task_id), None
    )
    if record is None:
        raise not_found("task_not_found", f"업무 {task_id!r}를 찾을 수 없습니다.")

    overlay = state_store.checklist_overlay(task_id)
    checklist = [
        dto.ChecklistItem(
            id=str(index),
            text=stage,
            note="지금 할 차례" if index == 1 and not overlay.get("1") else "",
            done=overlay.get(str(index), False),
        )
        for index, stage in enumerate(CUSTOM_STAGES, start=1)
    ]
    return dto.TaskDetail(
        task_id=task_id,
        checklist=checklist,
        evidence_chain=[],
        previous_timeline=[],
        related_forms=[],
        guideline_change_notice=(
            "담당자가 직접 추가한 업무입니다. 관련 공문이 들어오면 근거가 여기에 쌓입니다."
        ),
    )


def task_detail(task_id: str) -> dto.TaskDetail:
    if task_id.startswith(CUSTOM_PREFIX):
        return _custom_task_detail(task_id)
    store = _store.ensure()
    year = _academic_year(_today())

    projected = task_id.startswith(PROJECTED_PREFIX)
    lookup_id = (
        "wf_" + task_id.removeprefix(PROJECTED_PREFIX) if projected else task_id
    )
    workflow = next(
        (w for w in store.workflows if w["workflow_id"] == lookup_id), None
    )
    if workflow is None:
        raise not_found("task_not_found", f"업무 '{task_id}'를 찾을 수 없습니다.")

    documents = _workflow_documents(workflow, store)

    evidence = [
        dto.EvidenceLink(
            level=step_name,
            title=node.get("title") or "(제목 없음)",
            detail=" · ".join(
                part
                for part in (
                    _event_date(node),
                    node.get("sender") or timeline.audience_of(node),
                )
                if part
            ),
            source_type=_source_type(node),
        )
        for _, node, step_name in documents[:EVIDENCE_LIMIT]
    ]

    # 사슬의 마지막 고리 — 이 업무의 공문들이 인용한 근거 법령.
    # 화면 제목이 "공문 → 매뉴얼 → 법령 연결"인데 법령 칸이 비어 있었다.
    citations = statute_service.citations_for_documents(
        [document_id for document_id, _, _ in documents], limit=STATUTE_LIMIT
    )
    for citation in citations:
        verified = citation.get("verified")
        evidence.append(
            dto.EvidenceLink(
                level="근거 법령",
                title=citation["display"],
                detail=citation.get("category", "법령")
                + (" · law.go.kr 확인됨" if verified else " · 검색으로 연결"),
                source_type="official",
                url=citation["url"],
            )
        )

    # "작년 진행 흐름" — 투영 업무면 이 워크플로 자체가 작년 기록이고,
    # 올해 문서가 있는 업무면 같은 사업의 작년 워크플로에서 가져온다.
    previous_workflow = (
        workflow if projected else _sibling(store, workflow, year - 1)
    ) or workflow
    previous = [
        dto.TimelineEvent(date=_event_date(node) or "", event=node.get("title") or "")
        for _, node, _ in _workflow_documents(previous_workflow, store)
        if _event_date(node)
    ]

    # 이 업무의 공문에 딸린 첨부 중 서식류가 실제로 쓰는 양식이다.
    forms: list[dto.FormRef] = []
    for document_id, _, _ in documents:
        for attachment_id in store.attachments.get(document_id, []):
            node = store.nodes.get(attachment_id)
            if node is None:
                continue
            if doctype.classify(node.get("title")) != doctype.FORM:
                continue
            forms.append(
                dto.FormRef(
                    id=attachment_id,
                    title=node.get("title") or "(제목 없음)",
                    meta="첨부 서식",
                )
            )
    seen: set[str] = set()
    forms = [f for f in forms if not (f.title in seen or seen.add(f.title))][:6]

    checklist = (
        _projected_checklist(task_id, workflow) if projected else _checklist(workflow)
    )
    notice = None
    if projected:
        first, last = _workflow_dates(workflow)
        notice = (
            f"올해 문서가 아직 없어 작년({first}~{last}) 기록으로 구성했습니다. "
            "근거 문서와 서식은 모두 작년 것입니다."
        )

    return dto.TaskDetail(
        task_id=task_id,
        checklist=checklist,
        evidence_chain=evidence,
        previous_timeline=previous,
        related_forms=forms,
        guideline_change_notice=notice,
    )


# --- feed / documents --------------------------------------------------------


def _current_task_of(store: _Store, document_id: str) -> dto.Task | None:
    """이 문서(작년 기록)가 속한 사업의 **올해 업무**.

    화면의 업무 목록은 올해(투영 포함) 것이므로, 피드·문서에서 업무로
    이동하는 링크도 올해 업무 id를 가리켜야 한다. 작년 워크플로 id를 주면
    상세 페이지가 목록에서 업무를 찾지 못해 "찾을 수 없습니다"가 뜬다.
    """
    workflow = store.document_workflow.get(document_id)
    if workflow is None:
        return None
    year = _academic_year(_today())
    by_year = _series(store).get(workflow["business_name"], {})
    current, previous = by_year.get(year), by_year.get(year - 1)
    if current:
        return _to_task(current)
    if previous:
        return _project_task(previous)
    return None


def _body_nodes(store: _Store) -> list[tuple[str, dict]]:
    return [
        (document_id, node)
        for document_id, node in store.nodes.items()
        if node.get("kind") != "첨부"
    ]


def feed() -> dto.FeedResponse:
    store = _store.ensure()
    received = [
        (document_id, node)
        for document_id, node in _body_nodes(store)
        if node.get("direction") == "received" and _event_date(node)
    ]
    received.sort(key=lambda row: _event_date(row[1]) or "", reverse=True)

    items = []
    for document_id, node in received[:FEED_LIMIT]:
        task = _current_task_of(store, document_id)
        kind = doctype.classify(node.get("title"))
        items.append(
            dto.FeedItem(
                id=document_id,
                title=node.get("title") or "(제목 없음)",
                issuer=node.get("sender") or "교육청",
                received_at=_event_date(node) or "",
                hint=doctype.LABEL.get(kind, "공문")
                + (f" · {task.title} 관련" if task else ""),
                related_task_id=task.id if task else None,
            )
        )
    return dto.FeedResponse(items=items)


def documents() -> dto.DocumentsResponse:
    store = _store.ensure()
    rows = sorted(
        _body_nodes(store), key=lambda row: _event_date(row[1]) or "", reverse=True
    )

    items = []
    for document_id, node in rows[:DOCUMENT_LIMIT]:
        task = _current_task_of(store, document_id)
        items.append(
            dto.DocumentRow(
                id=document_id,
                title=node.get("title") or "(제목 없음)",
                document_number=node.get("doc_number")
                or node.get("issuing_number")
                or "-",
                source_type=_source_type(node),
                related_task_title=task.title if task else "일반 문서",
                issued_at=_event_date(node) or "",
                # 전 문서가 변환·색인을 거쳤으므로 분석은 끝난 상태다.
                analysis_status="complete",
                # 사람 검증 절차는 아직 없다. 있다고 말하지 않는다.
                verification_status="none",
            )
        )
    return dto.DocumentsResponse(items=items)


# --- notes / notifications ---------------------------------------------------


def _note_dto(note: dict) -> dto.ExperienceNote:
    return dto.ExperienceNote(
        id=note["id"],
        task_id=note.get("task_id") or "",
        task_title=note.get("task_title") or "일반 메모",
        academic_year=note.get("academic_year") or _academic_year(_today()),
        author_display="나",
        is_mine=True,
        visibility=note.get("visibility") or "private",
        body=note.get("body") or "",
    )


def experience_notes() -> dto.ExperienceNotesResponse:
    """담당자가 저장한 경험 노트. 최근 것부터. 지어낸 노트는 없다."""
    return dto.ExperienceNotesResponse(
        items=[_note_dto(note) for note in reversed(state_store.notes())]
    )


def add_experience_note(
    task_id: str | None, visibility: str, body: str
) -> dto.ExperienceNote:
    task = next((t for t in tasks().items if t.id == task_id), None) if task_id else None
    saved = state_store.add_note(
        {
            "task_id": task_id or "",
            "task_title": task.title if task else "일반 메모",
            "academic_year": _academic_year(_today()),
            "visibility": visibility,
            "body": body,
        }
    )
    return _note_dto(saved)


def notifications() -> dto.NotificationsResponse:
    """올해 업무의 시기 알림.

    작년 이맘때 시작한 업무가 다가오거나 지났으면 알린다. 이것이 이 서비스가
    담당자에게 해 주는 핵심 말이다 — "작년엔 지금쯤 이걸 하고 있었다."
    """
    today = _today().isoformat()
    soon = (_today() + timedelta(days=30)).isoformat()

    candidates = []
    for task in tasks().items:
        if task.status == "complete":
            continue
        start = task.recommended_start_date
        if start <= today:
            candidates.append((start, "지남", task))
        elif start <= soon:
            candidates.append((start, "임박", task))

    # 최근에 지난 것(가장 시급한 것)부터
    candidates.sort(key=lambda row: row[0], reverse=True)

    read = state_store.read_notification_ids()
    items = []
    for start, phase, task in candidates[:NOTIFICATION_LIMIT]:
        if phase == "지남":
            title = f"{task.title} · 권장 준비 시작일이 지났습니다"
            kind = "prep"
        else:
            title = f"{task.title} · 준비 시작 권장"
            kind = "due"
        # id가 업무에 붙어 있어야 읽음을 기억할 수 있다. 순번 id는 목록이
        # 바뀔 때마다 달라져 읽음 표시가 다른 알림으로 미끄러진다.
        notification_id = f"n_{task.id}"
        items.append(
            dto.Notification(
                id=notification_id,
                title=title,
                message=f"작년 기준 시작 {start} · 작년 처리 {task.previous_actual_date}",
                kind=kind,
                is_new=notification_id not in read,
                related_task_id=task.id,
            )
        )
    return dto.NotificationsResponse(items=items)


# --- 업무 도우미(질의)가 쓰는 범위 ---------------------------------------------


def _resolve_workflow(task_id: str) -> dict | None:
    """화면의 업무 id(wf_/wf26_)를 워크플로 기록으로 푼다."""
    store = _store.ensure()
    lookup = (
        "wf_" + task_id.removeprefix(PROJECTED_PREFIX)
        if task_id.startswith(PROJECTED_PREFIX)
        else task_id
    )
    return next((w for w in store.workflows if w["workflow_id"] == lookup), None)


def task_document_ids(task_id: str) -> list[str]:
    """이 업무(올해 + 작년 사업)에 속한 문서 전부. 첨부까지 포함한다.

    업무 도우미가 이 목록으로 검색 범위를 좁힌다. 계획서 알맹이는 대개
    첨부에 있으므로 본문만 넣으면 정작 내용이 검색되지 않는다.
    """
    store = _store.ensure()
    workflow = _resolve_workflow(task_id)
    if workflow is None:
        return []

    siblings = _series(store).get(workflow["business_name"], {})
    ids: list[str] = []
    for sibling in siblings.values():
        for step in sibling["steps"]:
            for document_id in step.get("document_ids", []):
                ids.append(document_id)
                ids.extend(store.attachments.get(document_id, []))

    seen: set[str] = set()
    return [i for i in ids if not (i in seen or seen.add(i))]


def task_flow(task_id: str):
    """이 업무의 작년 처리 순서. 단계 이름을 붙여 날짜순으로.

    업무 도우미의 답변 재료다 — "작년에는 어떤 순서로 진행했나"에 검색이
    아니라 기록으로 답하게 한다.
    """
    from ..rag import timeline as timeline_module

    store = _store.ensure()
    workflow = _resolve_workflow(task_id)
    if workflow is None:
        return []

    entries = []
    for document_id, node, step_name in _workflow_documents(workflow, store):
        entries.append(
            timeline_module.TimelineEntry(
                document_id=document_id,
                title=f"[{step_name}] " + (node.get("title") or ""),
                date=_event_date(node),
                kind=step_name,
                direction=node.get("direction"),
                audience=timeline_module.audience_of(node),
                doc_number=node.get("doc_number"),
            )
        )
    return entries
