"""문서에서 업무 흐름을 만들어 낸다.

    문서 484건
      │  keys.py    (연도, 사업명, 차수)를 붙인다
      ▼
    사업 묶음 258개
      │  stages.py  제목의 행위어로 단계를 정한다
      ▼
    (사업, 단계)로 배정된 문서
      │  stages.yaml 이 순서를 알려 준다
      ▼
    워크플로 (진행 상태까지 채워진 것)

문서끼리 견주어 관계를 추론하지 않는다. 문서마다 단계 하나를 고르는 분류
문제로 바꾸었기 때문에, 짧은 제목으로도 잘 맞고 왜 그렇게 묶였는지 설명할 수 있다.

단계의 상태는 문서가 있느냐로 정한다.

    그 단계의 문서가 있다        → 완료 (마지막 문서 날짜를 완료일로)
    없는데 앞 단계는 끝났다      → 지금 할 차례
    그 뒤                        → 아직
"""

import hashlib
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

import yaml

from . import stages as stage_module
from .keys import BusinessKey, business_key

TEMPLATE_PATH = Path(__file__).resolve().parent / "templates" / "stages.yaml"

MIN_DOCUMENTS = 2  # 문서 한 건짜리는 업무 흐름이라 할 것이 없다
MIN_STAGES = 2


@dataclass
class TemplateGraph:
    id: str
    name: str
    description: str
    signals: list[str]
    stages: list[str]


@dataclass
class BuiltStep:
    step_id: str
    stage: str
    name: str
    status: str  # completed / current / pending
    completed_at: date | None = None
    document_ids: list[str] = field(default_factory=list)


@dataclass
class BuiltWorkflow:
    workflow_id: str
    name: str
    description: str
    template_id: str
    year: int | None
    business_name: str
    steps: list[BuiltStep]
    document_count: int
    updated_at: date | None = None


def load_templates(path: Path | None = None) -> list[TemplateGraph]:
    with open(path or TEMPLATE_PATH, encoding="utf-8") as stream:
        payload = yaml.safe_load(stream)
    return [
        TemplateGraph(
            id=item["id"],
            name=item["name"],
            description=item.get("description", ""),
            signals=item.get("signals", []),
            stages=item["stages"],
        )
        for item in payload["templates"]
    ]


def choose_template(
    observed: set[str], templates: list[TemplateGraph]
) -> TemplateGraph:
    """관찰된 단계를 가장 잘 담는 템플릿을 고른다.

    담긴 단계 수가 많은 쪽, 같으면 군더더기가 적은 쪽을 고른다.
    """

    def score(template: TemplateGraph) -> tuple[int, int, int]:
        covered = len(observed & set(template.stages))
        signal_hit = len(observed & set(template.signals))
        return (covered, signal_hit, -len(template.stages))

    return max(templates, key=score)


def _workflow_id(key: tuple[int | None, str]) -> str:
    """URL 경로에 그대로 들어가므로 ASCII로 만든다."""
    digest = hashlib.sha1(str(key).encode("utf-8")).hexdigest()[:10]
    return f"wf_{digest}"


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _event_date(node: dict) -> str | None:
    for field_name in ("approval_date", "issuing_date", "receipt_date"):
        if node.get(field_name):
            return node[field_name]
    return None


def group_documents(nodes: dict[str, dict]) -> dict[tuple[int | None, str], list[tuple[str, dict, BusinessKey]]]:
    """문서를 사업별로 묶는다. 첨부는 본문에 딸린 것이라 세지 않는다."""
    groups: dict[tuple[int | None, str], list[tuple[str, dict, BusinessKey]]] = {}
    for document_id, node in nodes.items():
        if node.get("kind") == "첨부":
            continue
        key = business_key(node.get("title") or "", _event_date(node))
        if key is None:
            continue
        groups.setdefault(key.series, []).append((document_id, node, key))
    return groups


def build_workflow(
    key: tuple[int | None, str],
    documents: list[tuple[str, dict, BusinessKey]],
    templates: list[TemplateGraph],
) -> BuiltWorkflow | None:
    """사업 하나를 워크플로로 만든다."""
    by_stage: dict[str, list[tuple[str, dict]]] = {}
    for document_id, node, _ in documents:
        stage = stage_module.classify(node.get("title"))
        if stage is None:
            continue
        by_stage.setdefault(stage, []).append((document_id, node))

    if len(documents) < MIN_DOCUMENTS or len(by_stage) < MIN_STAGES:
        return None

    template = choose_template(set(by_stage), templates)
    # 템플릿에 있는 단계 중, 이 사업에서 실제로 나타난 것과 그 사이 단계를 남긴다.
    used = [stage for stage in template.stages if stage in by_stage]
    if len(used) < MIN_STAGES:
        return None
    first, last = template.stages.index(used[0]), template.stages.index(used[-1])
    # 마지막으로 문서가 있는 단계 다음 한 단계까지 보여 준다. 담당자가 알고 싶은
    # 것은 "여기까지 했다"가 아니라 "다음에 뭘 해야 하나"이기 때문이다.
    ordered = template.stages[first : last + 2]

    steps: list[BuiltStep] = []
    for index, stage in enumerate(ordered, start=1):
        found = by_stage.get(stage, [])
        dates = sorted(
            filter(None, (_parse_date(_event_date(node)) for _, node in found))
        )
        steps.append(
            BuiltStep(
                step_id=str(index),
                stage=stage,
                name=stage_module.label(stage),
                status="completed" if found else "pending",
                completed_at=dates[-1] if dates else None,
                document_ids=[document_id for document_id, _ in found],
            )
        )

    # 지금 할 차례는 "마지막으로 끝낸 단계 다음의 빈 단계"다.
    #
    # 그냥 첫 번째 빈 단계를 고르면, 이미 끝난 사업인데 중간에 건너뛴 단계가
    # "지금 할 차례"로 뜬다. 계획서를 따로 만들지 않고 바로 운영한 사업이
    # 실제로 그렇다.
    last_done = max(
        (index for index, step in enumerate(steps) if step.status == "completed"),
        default=-1,
    )
    for step in steps[last_done + 1 :]:
        if step.status == "pending":
            step.status = "current"
            break

    year, name = key
    all_dates = sorted(filter(None, (step.completed_at for step in steps)))
    return BuiltWorkflow(
        workflow_id=_workflow_id(key),
        name=f"{year}년 {name}" if year else name,
        description=template.description,
        template_id=template.id,
        year=year,
        business_name=name,
        steps=steps,
        document_count=len(documents),
        updated_at=all_dates[-1] if all_dates else None,
    )


def build_all(
    nodes: dict[str, dict], templates: list[TemplateGraph] | None = None
) -> list[BuiltWorkflow]:
    templates = templates or load_templates()
    workflows = []
    for key, documents in group_documents(nodes).items():
        workflow = build_workflow(key, documents, templates)
        if workflow is not None:
            workflows.append(workflow)

    workflows.sort(key=lambda w: (w.updated_at or date.min), reverse=True)
    return workflows


def to_dict(workflow: BuiltWorkflow) -> dict:
    return {
        "workflow_id": workflow.workflow_id,
        "name": workflow.name,
        "description": workflow.description,
        "template_id": workflow.template_id,
        "year": workflow.year,
        "business_name": workflow.business_name,
        "document_count": workflow.document_count,
        "updated_at": workflow.updated_at.isoformat() if workflow.updated_at else None,
        "steps": [
            {
                "step_id": step.step_id,
                "stage": step.stage,
                "name": step.name,
                "status": step.status,
                "completed_at": step.completed_at.isoformat() if step.completed_at else None,
                "document_ids": step.document_ids,
            }
            for step in workflow.steps
        ],
    }
