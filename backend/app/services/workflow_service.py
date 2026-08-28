"""워크플로 서비스.

지금은 메모리 안의 예시 데이터로 동작한다. 프론트가 단계를 완료 처리하면
서버가 살아 있는 동안은 상태가 실제로 바뀌므로, Mock만으로도 화면 흐름을
끝까지 확인할 수 있다. 이후 이 파일 안쪽이 Workflow DB 조회로 바뀐다.
"""

import json
from copy import deepcopy
from datetime import datetime, timezone
from itertools import count
from pathlib import Path

from .. import settings
from ..errors import not_found
from ..models.common import StepStatus
from ..models.workflow import (
    FeedbackRequest,
    FeedbackResponse,
    FeedbackType,
    StepCompleteRequest,
    WorkflowDetail,
    WorkflowDiff,
    WorkflowListResponse,
    WorkflowStep,
    WorkflowSummary,
)

_SEED: dict[str, dict] = {
    "science_competition": {
        "name": "과학대회 참가",
        "description": "교외 과학대회에 학생을 참가시키는 업무",
        "steps": [
            {"step_id": "1", "name": "학생 모집", "completed": True, "docs": []},
            {"step_id": "2", "name": "학생 선발", "completed": True, "docs": []},
            {
                "step_id": "3",
                "name": "참가 신청",
                "completed": False,
                "docs": ["doc_2026_competition_guide"],
                "description": "학생 명단을 첨부해 참가 신청서를 제출한다.",
            },
            {"step_id": "4", "name": "내부 결재", "completed": False, "docs": []},
            {"step_id": "5", "name": "결과 보고", "completed": False, "docs": []},
        ],
    },
    "saturday_science_class": {
        "name": "토요과학교실 운영",
        "description": "외부 강사와 함께 토요 프로그램을 운영하는 업무",
        "steps": [
            {
                "step_id": "1",
                "name": "운영 계획 수립",
                "completed": True,
                "docs": ["doc_school_2025_10129"],
            },
            {"step_id": "2", "name": "가정통신문 발송", "completed": False, "docs": []},
            {"step_id": "3", "name": "강사비 지출 품의", "completed": False, "docs": []},
        ],
    },
}

_COMPLETED_AT = datetime(2026, 8, 25, 9, 0, tzinfo=timezone.utc)

WORKFLOWS_PATH = settings.DATA_DIR / "workflows.json"


def _load_generated(path: Path | None = None) -> dict[str, dict] | None:
    """문서에서 만들어 낸 업무 흐름을 읽는다.

    scripts/build_workflows.py 가 만든 것이다. 없으면 위의 예시 두 건으로
    동작한다(문서를 넣지 않은 사람도 화면을 볼 수 있어야 한다).
    """
    path = path or WORKFLOWS_PATH
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as stream:
            payload = json.load(stream)
    except (json.JSONDecodeError, OSError) as exc:
        print(f"[workflow] {path}를 읽지 못했습니다: {exc}")
        return None

    workflows: dict[str, dict] = {}
    for item in payload.get("workflows", []):
        workflows[item["workflow_id"]] = {
            "name": item["name"],
            "description": item.get("description"),
            "steps": [
                {
                    "step_id": step["step_id"],
                    "name": step["name"],
                    "completed": step["status"] == "completed",
                    "docs": step.get("document_ids", []),
                    "description": None,
                    "completed_at": _parse_completed(step.get("completed_at")),
                }
                for step in item["steps"]
            ],
            "updated_at": _parse_completed(item.get("updated_at")) or _COMPLETED_AT,
        }
    return workflows or None


def _parse_completed(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
    except ValueError:
        return None

_workflows: dict[str, dict] = {}
_feedback_log: list[dict] = []
_feedback_ids = count(1)


def reset(use_generated: bool = True) -> None:
    """업무 목록을 처음 상태로 되돌린다.

    문서에서 만들어 낸 것이 있으면 그것을, 없으면 예시 두 건을 쓴다.
    """
    global _workflows, _feedback_log, _feedback_ids

    generated = _load_generated() if use_generated else None
    if generated is not None:
        _workflows = generated
    else:
        _workflows = deepcopy(_SEED)
        for workflow in _workflows.values():
            for step in workflow["steps"]:
                step["completed_at"] = _COMPLETED_AT if step["completed"] else None
            workflow["updated_at"] = _COMPLETED_AT
    _feedback_log = []
    _feedback_ids = count(1)


reset()


def _require_workflow(workflow_id: str) -> dict:
    workflow = _workflows.get(workflow_id)
    if workflow is None:
        raise not_found("workflow_not_found", f"업무 '{workflow_id}'를 찾을 수 없습니다.")
    return workflow


def _status_of(step: dict, is_current: bool) -> StepStatus:
    if step["completed"]:
        return StepStatus.COMPLETED
    return StepStatus.CURRENT if is_current else StepStatus.PENDING


def _current_step_id(steps: list[dict]) -> str | None:
    """지금 할 차례. 마지막으로 끝낸 단계 다음의 빈 단계다.

    그냥 첫 번째 빈 단계를 고르면, 이미 끝난 업무인데 중간에 건너뛴 단계가
    "지금 할 차례"로 뜬다. 계획서 없이 바로 운영한 사업이 실제로 그렇다.
    """
    last_done = max(
        (index for index, step in enumerate(steps) if step["completed"]), default=-1
    )
    return next(
        (step["step_id"] for step in steps[last_done + 1 :] if not step["completed"]),
        None,
    )


def _to_detail(workflow_id: str, workflow: dict) -> WorkflowDetail:
    first_pending = _current_step_id(workflow["steps"])
    return WorkflowDetail(
        workflow_id=workflow_id,
        name=workflow["name"],
        description=workflow["description"],
        steps=[
            WorkflowStep(
                step_id=step["step_id"],
                name=step["name"],
                status=_status_of(step, step["step_id"] == first_pending),
                description=step.get("description"),
                completed_at=step["completed_at"],
                document_ids=step["docs"],
            )
            for step in workflow["steps"]
        ],
        updated_at=workflow["updated_at"],
    )


def guess_workflow(query: str) -> str | None:
    """질문이 어떤 업무에 관한 것인지 추정한다.

    지금은 업무 이름·설명·단계 이름의 낱말이 질문에 들어 있는지로 고른다.
    맞히지 못하면 None을 주고, 그러면 답변에 업무 흐름 없이 근거 문서만 실린다.
    (LangGraph를 붙이는 단계에서 제대로 된 분류로 바꾼다.)
    """
    best_id, best_score = None, 0
    for workflow_id, workflow in _workflows.items():
        words = {workflow["name"], *(step["name"] for step in workflow["steps"])}
        words |= set((workflow["description"] or "").split())
        score = sum(
            1 for word in words if len(word) >= 2 and word in query
        )
        if score > best_score:
            best_id, best_score = workflow_id, score
    return best_id


def list_workflows() -> WorkflowListResponse:
    summaries = []
    for workflow_id, workflow in _workflows.items():
        detail = _to_detail(workflow_id, workflow)
        current = next(
            (step.name for step in detail.steps if step.status is StepStatus.CURRENT),
            None,
        )
        summaries.append(
            WorkflowSummary(
                workflow_id=workflow_id,
                name=detail.name,
                description=detail.description,
                step_count=len(detail.steps),
                completed_step_count=sum(
                    1 for step in detail.steps if step.status is StepStatus.COMPLETED
                ),
                current_step=current,
            )
        )
    return WorkflowListResponse(workflows=summaries, total=len(summaries))


def get_workflow(workflow_id: str) -> WorkflowDetail:
    return _to_detail(workflow_id, _require_workflow(workflow_id))


def complete_step(
    workflow_id: str, step_id: str, request: StepCompleteRequest
) -> WorkflowDetail:
    """단계를 완료 처리하거나 되돌린다.

    이미 완료된 단계를 다시 완료해도 성공으로 처리한다(멱등).
    프론트가 중복 클릭이나 재전송을 걱정하지 않아도 된다.
    """
    workflow = _require_workflow(workflow_id)
    step = next((s for s in workflow["steps"] if s["step_id"] == step_id), None)
    if step is None:
        raise not_found("step_not_found", f"단계 '{step_id}'를 찾을 수 없습니다.")

    now = datetime.now(timezone.utc)
    step["completed"] = request.completed
    step["completed_at"] = now if request.completed else None
    workflow["updated_at"] = now
    # 실제 업무 Trace 기록 자리. 지금은 메모만 들고 있는다.
    step["note"] = request.note
    return _to_detail(workflow_id, workflow)


def _step_names(workflow: dict) -> list[str]:
    return [step["name"] for step in workflow["steps"]]


def _build_diff(workflow: dict, request: FeedbackRequest) -> WorkflowDiff:
    """등록된 흐름과 담당자가 말한 실제 흐름을 나란히 만든다.

    차이가 난 부분만 보여주면 되므로 기준 단계 주변만 잘라서 담는다.
    """
    names = _step_names(workflow)
    index = next(
        (
            i
            for i, step in enumerate(workflow["steps"])
            if step["step_id"] == request.after_step_id
        ),
        -1,
    )
    expected = names[max(index, 0) : index + 2] if names else []
    reported = list(expected)

    if request.type is FeedbackType.MISSING_STEP:
        inserted = request.suggested_step_name or "(이름 없는 단계)"
        reported = expected[:1] + [inserted] + expected[1:]
    elif request.type is FeedbackType.UNNECESSARY_STEP and len(expected) > 1:
        reported = [expected[0]]
    elif request.type is FeedbackType.WRONG_ORDER and len(expected) > 1:
        reported = list(reversed(expected))

    return WorkflowDiff(expected=expected, reported=reported)


def add_feedback(workflow_id: str, request: FeedbackRequest) -> FeedbackResponse:
    workflow = _require_workflow(workflow_id)
    if request.after_step_id is not None and not any(
        step["step_id"] == request.after_step_id for step in workflow["steps"]
    ):
        raise not_found(
            "step_not_found", f"단계 '{request.after_step_id}'를 찾을 수 없습니다."
        )

    feedback_id = f"fb_{next(_feedback_ids):04d}"
    _feedback_log.append(
        {
            "feedback_id": feedback_id,
            "workflow_id": workflow_id,
            "request": request.model_dump(mode="json"),
            "created_at": datetime.now(timezone.utc),
        }
    )
    return FeedbackResponse(
        feedback_id=feedback_id,
        workflow_id=workflow_id,
        type=request.type,
        diff=_build_diff(workflow, request),
        message="의견이 접수되었습니다. 워크플로 개선 검토에 반영됩니다.",
    )
