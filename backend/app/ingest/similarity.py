"""문서번호로 이어지지 않는 문서를 내용과 날짜로 잇는다.

"관련"에 번호를 적어 두는 공문은 많지 않다. 관련 참조 296건 중 우리가 가진
문서로 이어지는 것은 50건뿐이다. 나머지 흐름은 번호가 아니라 내용으로 찾아야
한다.

    같은 사업     토요과학교실 1차 계획 ─ 2차 계획 ─ 3차 계획
                  요약 임베딩이 비슷하면 같은 일로 본다.

    후속 추정     [8/20 접수] 운영비 교부 ──▶ [9/19 기안] 예산 및 운영 계획서
                  받은 공문 뒤 한 달 안에, 내용이 비슷한 기안 문서가 있으면
                  그 공문을 처리한 문서로 본다.

여기서 만든 연결은 **추정**이다. 문서번호로 이은 연결과 구분해서 담고,
화면에서도 구분해 보여 주어야 한다. 이미 만들어 둔 요약 임베딩을 쓰므로
추가 비용은 들지 않는다.
"""

from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import numpy as np

from .. import settings

SAME_TOPIC = "same_topic"  # 같은 사업으로 보이는 문서
LIKELY_FOLLOW_UP = "likely_follow_up"  # 받은 공문을 처리한 것으로 보이는 기안 문서

# 실제 문서로 재 보고 정한 값이다.
#   0.85 이상  같은 사업의 회차 문서 (토요과학교실 1차 / 2차 / 3차)
#   0.70~0.75  같은 종류의 다른 사업 (강사비 지출 ↔ 다른 사업 강사비 지급)
#   0.62~0.65  같은 분야일 뿐 (토요과학교실 ↔ 반일제 체험 협의회비)
# 같은 사업만 묶으려면 0.78 위로 잡아야 한다.
TOPIC_THRESHOLD = 0.78
TOPIC_TOP_K = 3

# 후속 추정은 날짜와 방향(받음→기안)이 함께 걸리므로 조금 낮춰 잡는다.
SEQUENCE_THRESHOLD = 0.65
SEQUENCE_WINDOW_DAYS = 30


@dataclass
class Suggestion:
    source: str
    target: str
    type: str
    score: float
    label: str | None = None


def load_summary_vectors(
    vector_dir: Path | None = None,
) -> tuple[list[str], np.ndarray]:
    """요약 인덱스에 넣어 둔 문서 벡터를 가져온다.

    문서 하나에 벡터 하나라 그대로 문서 사이의 거리를 재는 데 쓸 수 있다.
    """
    import chromadb

    from ..rag import store

    directory = vector_dir or settings.VECTOR_DIR
    client = chromadb.PersistentClient(path=str(directory))
    collection = client.get_collection(store.SUMMARY_COLLECTION)
    result = collection.get(include=["embeddings"])

    ids = list(result.get("ids", []))
    embeddings = result.get("embeddings")
    if embeddings is None or len(embeddings) == 0:
        return ids, np.zeros((0, 0), dtype="float32")

    vectors = np.asarray(embeddings, dtype="float32")
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return ids, vectors / norms  # 정규화해 두면 내적이 곧 코사인 유사도다


def _event_date(node: dict) -> date | None:
    """문서의 날짜. 결재일 > 시행일 > 접수일 순으로 있는 것을 쓴다."""
    for key in ("approval_date", "issuing_date", "receipt_date"):
        value = node.get(key)
        if value:
            try:
                return datetime.strptime(value, "%Y-%m-%d").date()
            except ValueError:
                continue
    return None


def _is_body(node: dict) -> bool:
    """첨부는 본문에 이미 붙어 있으므로 본문끼리만 잇는다."""
    return node.get("kind") != "첨부"


def suggest(
    nodes: dict[str, dict],
    ids: list[str],
    vectors: np.ndarray,
    topic_threshold: float = TOPIC_THRESHOLD,
    top_k: int = TOPIC_TOP_K,
    sequence_threshold: float = SEQUENCE_THRESHOLD,
    window_days: int = SEQUENCE_WINDOW_DAYS,
) -> list[Suggestion]:
    """내용과 날짜로 추정한 연결을 만든다."""
    if not len(vectors):
        return []

    keep = [i for i, key in enumerate(ids) if key in nodes and _is_body(nodes[key])]
    if len(keep) < 2:
        return []

    ids = [ids[i] for i in keep]
    vectors = vectors[keep]
    similarity = vectors @ vectors.T
    np.fill_diagonal(similarity, -1.0)

    dates = {key: _event_date(nodes[key]) for key in ids}
    suggestions: list[Suggestion] = []
    seen: set[tuple[str, str, str]] = set()

    for row, source in enumerate(ids):
        scores = similarity[row]
        for column in np.argsort(scores)[::-1][:top_k]:
            score = float(scores[column])
            if score < topic_threshold:
                break
            target = ids[column]
            key = (source, target, SAME_TOPIC)
            if key in seen:
                continue
            seen.add(key)
            suggestions.append(
                Suggestion(
                    source=source,
                    target=target,
                    type=SAME_TOPIC,
                    score=round(score, 3),
                    label=nodes[target].get("title"),
                )
            )

        # 받은 공문이면, 그 뒤에 우리가 기안한 문서를 찾는다.
        if nodes[source].get("direction") != "received":
            continue
        source_date = dates.get(source)
        if source_date is None:
            continue

        for column in np.argsort(scores)[::-1][: top_k * 3]:
            score = float(scores[column])
            if score < sequence_threshold:
                break
            target = ids[column]
            node = nodes[target]
            target_date = dates.get(target)
            if node.get("direction") != "drafted" or target_date is None:
                continue
            gap = (target_date - source_date).days
            if not 0 <= gap <= window_days:
                continue

            key = (source, target, LIKELY_FOLLOW_UP)
            if key in seen:
                continue
            seen.add(key)
            suggestions.append(
                Suggestion(
                    source=source,
                    target=target,
                    type=LIKELY_FOLLOW_UP,
                    score=round(score, 3),
                    label=f"{gap}일 뒤 · {node.get('title')}",
                )
            )
    return suggestions
