"""질문이 어떤 업무의 어느 단계에 관한 것인지 가려낸다.

낱말이 겹치는지 세는 방식은 "강사비 지출하려면 뭐가 필요한가요"처럼 업무
이름이 그대로 나오지 않는 질문을 놓친다. 그래서 업무와 단계를 임베딩해 두고
질문과의 코사인 유사도로 고른다.

    질문  "외부 강사비 지출할 때 필요한 서류가 뭔가요"
      │
      ├─ 업무   토요과학교실 운영        0.42
      └─ 단계   강사비 지출 품의          0.55   ← 질문이 가리키는 단계

업무는 진행 상태(어디까지 했는가)를, 단계는 질문 내용(무엇을 묻는가)을
가리킨다. 둘은 다르다. 담당자가 3단계를 물어도 워크플로상 현재 단계는
여전히 2단계일 수 있다.

기준값에 못 미치면 아무 업무도 고르지 않는다. 엉뚱한 업무를 붙여 놓으면
화면에 잘못된 다음 단계가 뜨는데, 그건 업무를 못 찾은 것보다 나쁘다.
"""

from dataclasses import dataclass
from typing import Callable, Sequence

import numpy as np

from ..models.common import StepStatus
from . import workflow_service

# 실제 질문으로 재 보고 정한 값이다.
#   관련 질문   0.42 ~ 0.86
#   무관한 질문 0.11 ~ 0.37
# 사이가 넓지 않으므로 높은 쪽에 맞춘다. 애매하면 업무를 붙이지 않는 편이 낫다.
WORKFLOW_THRESHOLD = 0.40
STEP_THRESHOLD = 0.40

EmbedFn = Callable[[Sequence[str]], list[list[float]]]


@dataclass
class WorkflowMatch:
    workflow_id: str
    name: str
    score: float
    step_id: str | None = None
    step_name: str | None = None
    step_score: float = 0.0


def _cosine(matrix: np.ndarray, vector: np.ndarray) -> np.ndarray:
    matrix_norm = np.linalg.norm(matrix, axis=1)
    vector_norm = np.linalg.norm(vector)
    if vector_norm == 0:
        return np.zeros(len(matrix))
    matrix_norm[matrix_norm == 0] = 1.0
    return (matrix @ vector) / (matrix_norm * vector_norm)


def workflow_text(name: str, description: str | None, steps: list[str]) -> str:
    """업무 하나를 나타내는 문장. 이름만으로는 짧아 단계 이름까지 넣는다."""
    parts = [name]
    if description:
        parts.append(description)
    if steps:
        parts.append("단계: " + ", ".join(steps))
    return "\n".join(parts)


def step_text(workflow_name: str, step_name: str, description: str | None) -> str:
    parts = [f"{workflow_name} - {step_name}"]
    if description:
        parts.append(description)
    return "\n".join(parts)


class WorkflowMatcher:
    """업무·단계 임베딩을 만들어 두고 질문마다 비교한다.

    업무 목록은 자주 바뀌지 않으므로 한 번만 임베딩한다(업무 2건 + 단계 8건
    이면 호출 한 번이다). 업무가 바뀌면 refresh()로 다시 만든다.
    """

    def __init__(self, embed: EmbedFn, threshold: float = WORKFLOW_THRESHOLD) -> None:
        self.embed = embed
        self.threshold = threshold
        self._workflow_ids: list[str] = []
        self._workflow_names: list[str] = []
        self._workflow_vectors: np.ndarray | None = None
        self._steps: list[tuple[str, str, str]] = []  # (업무id, 단계id, 단계이름)
        self._step_vectors: np.ndarray | None = None

    def refresh(self) -> None:
        workflow_texts: list[str] = []
        step_texts: list[str] = []
        self._workflow_ids, self._workflow_names, self._steps = [], [], []

        for summary in workflow_service.list_workflows().workflows:
            detail = workflow_service.get_workflow(summary.workflow_id)
            self._workflow_ids.append(detail.workflow_id)
            self._workflow_names.append(detail.name)
            workflow_texts.append(
                workflow_text(
                    detail.name,
                    detail.description,
                    [step.name for step in detail.steps],
                )
            )
            for step in detail.steps:
                self._steps.append((detail.workflow_id, step.step_id, step.name))
                step_texts.append(step_text(detail.name, step.name, step.description))

        vectors = self.embed(workflow_texts + step_texts) if workflow_texts else []
        split = len(workflow_texts)
        self._workflow_vectors = np.array(vectors[:split], dtype="float32") if vectors else None
        self._step_vectors = np.array(vectors[split:], dtype="float32") if vectors else None

    def match(self, query: str) -> WorkflowMatch | None:
        """질문에 맞는 업무를 고른다. 못 고르면 None.

        업무 점수는 "업무 설명과의 유사도"와 "그 업무 단계 중 가장 가까운
        단계와의 유사도" 중 큰 값을 쓴다. 업무 이름은 안 나오고 단계 이름만
        나오는 질문("강사비 지출할 때 서류가...")이 흔하기 때문이다. 단계로
        고르지 않으면 그런 질문이 엉뚱한 업무로 간다.
        """
        if self._workflow_vectors is None:
            self.refresh()
        if self._workflow_vectors is None or not len(self._workflow_vectors):
            return None

        query_vector = np.array(self.embed([query])[0], dtype="float32")
        workflow_scores = _cosine(self._workflow_vectors, query_vector)
        step_scores = (
            _cosine(self._step_vectors, query_vector)
            if self._step_vectors is not None and len(self._step_vectors)
            else np.zeros(0)
        )

        best: WorkflowMatch | None = None
        for index, workflow_id in enumerate(self._workflow_ids):
            steps = [
                (float(score), step)
                for score, step in zip(step_scores, self._steps)
                if step[0] == workflow_id
            ]
            step_score, step = max(steps, key=lambda item: item[0]) if steps else (0.0, None)
            score = max(float(workflow_scores[index]), step_score)
            if best is not None and score <= best.score:
                continue

            best = WorkflowMatch(
                workflow_id=workflow_id,
                name=self._workflow_names[index],
                score=score,
                step_id=step[1] if step and step_score >= STEP_THRESHOLD else None,
                step_name=step[2] if step and step_score >= STEP_THRESHOLD else None,
                step_score=step_score,
            )

        if best is None or best.score < self.threshold:
            return None  # 엉뚱한 업무를 붙이느니 아무것도 붙이지 않는다
        return best


def build_matcher(embed: EmbedFn | None = None) -> WorkflowMatcher | None:
    """임베딩으로 고르는 매처. 임베딩을 쓸 수 없으면 None을 준다.

    부르는 쪽은 None을 받으면 keyword_match로 넘어간다. 여기서 예외가 새어
    나가면 질문 하나가 서버 오류가 되므로, 키가 없는 경우까지 여기서 막는다
    (키 확인 함수는 SystemExit을 던진다).
    """
    if embed is None:
        from .. import settings

        if not settings.openai_api_key():
            return None
        try:
            from ..rag import embedder

            model = embedder.build_embeddings(settings.CHUNK_EMBEDDING_MODEL)
            embed = model.embed_documents
        except (Exception, SystemExit):
            return None
    return WorkflowMatcher(embed)


def keyword_match(query: str) -> WorkflowMatch | None:
    """임베딩 없이 쓰는 대비책. 업무·단계 이름이 질문에 있는지만 본다."""
    workflow_id = workflow_service.guess_workflow(query)
    if workflow_id is None:
        return None

    detail = workflow_service.get_workflow(workflow_id)
    step = next(
        (
            step
            for step in detail.steps
            if len(step.name) >= 2
            and step.name in query
            and step.status is not StepStatus.COMPLETED
        ),
        None,
    )
    return WorkflowMatch(
        workflow_id=workflow_id,
        name=detail.name,
        score=1.0,
        step_id=step.step_id if step else None,
        step_name=step.name if step else None,
    )
