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
from datetime import date, datetime
from pathlib import Path

from .. import settings
from ..errors import not_found
from ..ingest import relations
from ..models import frontend as dto
from ..rag import doctype, timeline
from . import statute_service

ASSIGNMENT_ID = "sci"  # 이 말뭉치는 전부 과학·정보 담당 문서다
SCHOOL = dto.School(id="sch_seg", name="숭의여자고등학교", academic_year=2025)
ACADEMIC_YEAR_START = "2025-03-01"

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


def assignments() -> dto.AssignmentsResponse:
    store = _store.ensure()
    return dto.AssignmentsResponse(
        school=SCHOOL,
        items=[
            dto.Assignment(
                id=ASSIGNMENT_ID,
                name="과학·정보",
                active_from=ACADEMIC_YEAR_START,
                status="server_allowed",
                note=f"공문 {len(store.nodes):,}건에서 업무 {len(store.workflows)}개를 자동 구성",
                task_count=len(store.workflows),
            )
        ],
    )


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
        fallback = workflow.get("updated_at") or ACADEMIC_YEAR_START
        return fallback, fallback
    return dates[0], dates[-1]


def _to_task(workflow: dict) -> dto.Task:
    steps = workflow["steps"]
    done = sum(1 for step in steps if step["status"] == "completed")
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


def tasks() -> dto.TasksResponse:
    store = _store.ensure()
    return dto.TasksResponse(items=[_to_task(w) for w in store.workflows])


# --- task detail -------------------------------------------------------------


def _checklist(workflow: dict) -> list[dto.ChecklistItem]:
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
                done=step["status"] == "completed",
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


def task_detail(task_id: str) -> dto.TaskDetail:
    store = _store.ensure()
    workflow = next(
        (w for w in store.workflows if w["workflow_id"] == task_id), None
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

    previous = [
        dto.TimelineEvent(date=_event_date(node) or "", event=node.get("title") or "")
        for _, node, _ in documents
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

    return dto.TaskDetail(
        task_id=task_id,
        checklist=_checklist(workflow),
        evidence_chain=evidence,
        previous_timeline=previous,
        related_forms=forms,
    )


# --- feed / documents --------------------------------------------------------


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
        workflow = store.document_workflow.get(document_id)
        kind = doctype.classify(node.get("title"))
        items.append(
            dto.FeedItem(
                id=document_id,
                title=node.get("title") or "(제목 없음)",
                issuer=node.get("sender") or "교육청",
                received_at=_event_date(node) or "",
                hint=doctype.LABEL.get(kind, "공문")
                + (f" · {workflow['name']} 관련" if workflow else ""),
                related_task_id=workflow["workflow_id"] if workflow else None,
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
        workflow = store.document_workflow.get(document_id)
        items.append(
            dto.DocumentRow(
                id=document_id,
                title=node.get("title") or "(제목 없음)",
                document_number=node.get("doc_number")
                or node.get("issuing_number")
                or "-",
                source_type=_source_type(node),
                related_task_title=workflow["name"] if workflow else "일반 문서",
                issued_at=_event_date(node) or "",
                # 전 문서가 변환·색인을 거쳤으므로 분석은 끝난 상태다.
                analysis_status="complete",
                # 사람 검증 절차는 아직 없다. 있다고 말하지 않는다.
                verification_status="none",
            )
        )
    return dto.DocumentsResponse(items=items)


# --- notes / notifications ---------------------------------------------------


def experience_notes() -> dto.ExperienceNotesResponse:
    """경험 노트 저장 기능은 아직 없다. 가짜 노트를 지어내지 않는다."""
    return dto.ExperienceNotesResponse(items=[])


def notifications() -> dto.NotificationsResponse:
    store = _store.ensure()
    active = [
        w
        for w in store.workflows
        if any(step["status"] == "current" for step in w["steps"])
    ]
    active.sort(key=lambda w: w.get("updated_at") or "", reverse=True)

    latest = max(
        (w.get("updated_at") or "" for w in store.workflows), default=""
    )

    items = []
    for index, workflow in enumerate(active[:NOTIFICATION_LIMIT], start=1):
        current = next(s for s in workflow["steps"] if s["status"] == "current")
        done = sum(1 for s in workflow["steps"] if s["status"] == "completed")
        items.append(
            dto.Notification(
                id=f"gen_{index}",
                title=f"{workflow['name']} · 다음 할 일: {current['name']}",
                message=f"{workflow.get('updated_at') or ''} 기준 · "
                f"{done}/{len(workflow['steps'])} 단계 완료",
                kind="prep",
                is_new=workflow.get("updated_at") == latest,
                related_task_id=workflow["workflow_id"],
            )
        )
    return dto.NotificationsResponse(items=items)
