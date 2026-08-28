"""문서 사이의 연결을 만든다.

세 가지로 잇는다.

    첨부       (숭의여자고등학교-10129 (본문)) 계획 ── (…(첨부)) 운영기획서
               파일 이름의 문서번호가 같으면 한 건의 공문이다. 확실한 연결이다.

    관련       (…-12462) 공연비 지출 ──관련──▶ (…-12326) 체험 계획
               공문 본문의 "1. 관련"에 적힌 번호를 다른 문서의 시행·접수
               번호와 맞춘다. 앞선 문서를 가리키므로 방향이 있다.

    후속       (…-10895) 교육청 안내(접수) ──후속──▶ (…-10980) 승인 요청(기안)
               받은 공문을 근거로 우리가 기안한 문서. 관련 참조로 이어진
               기안 문서를 반대 방향에서 본 것이다.

이 연결이 곧 업무의 흐름이다. "계획 → 품의 → 정산"처럼 한 사업이 여러 공문에
걸쳐 진행되는데, 담당자는 그 사슬의 어디쯤인지를 알고 싶어 한다.
"""

import json
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .. import settings
from . import frontmatter, official, similarity

ATTACHMENT = "attachment"  # 본문 ↔ 첨부
RELATED = "related"  # 이 문서가 가리키는 앞선 문서
FOLLOW_UP = "follow_up"  # 이 문서를 근거로 만들어진 뒤따르는 문서


@dataclass
class DocumentNode:
    document_id: str
    title: str
    doc_number: str | None
    kind: str | None  # 본문 / 첨부
    direction: str | None  # drafted / received
    sender: str | None
    subject: str | None = None
    recipient: str | None = None
    issuing_number: str | None = None
    issuing_date: str | None = None
    receipt_number: str | None = None
    receipt_date: str | None = None
    approval_date: str | None = None
    disclosure: str | None = None
    markdown_path: str | None = None


@dataclass
class Edge:
    source: str  # document_id
    target: str
    type: str
    label: str | None = None
    score: float | None = None  # 추정 연결일 때의 유사도

    @property
    def inferred(self) -> bool:
        """문서번호가 아니라 내용·날짜로 추정한 연결인가."""
        return self.type in (similarity.SAME_TOPIC, similarity.LIKELY_FOLLOW_UP)


@dataclass
class RelationGraph:
    nodes: dict[str, DocumentNode] = field(default_factory=dict)
    edges: list[Edge] = field(default_factory=list)
    unresolved: list[tuple[str, str]] = field(default_factory=list)  # (문서, 못 찾은 번호)

    def to_dict(self) -> dict:
        return {
            "document_count": len(self.nodes),
            "edge_count": len(self.edges),
            "nodes": {key: asdict(node) for key, node in self.nodes.items()},
            "edges": [asdict(edge) for edge in self.edges],
            "unresolved_references": [
                {"document_id": document_id, "number": number}
                for document_id, number in self.unresolved
            ],
        }


def read_markdown(markdown_dir: Path) -> list[tuple[dict, str]]:
    documents = []
    for path in sorted(markdown_dir.rglob("*.md")):
        meta, body = frontmatter.parse(path.read_text(encoding="utf-8", errors="replace"))
        if not meta.get("document_id"):
            continue
        meta["markdown_path"] = path.relative_to(markdown_dir).as_posix()
        documents.append((meta, body))
    return documents


def build(
    markdown_dir: Path | None = None,
    suggest: bool = True,
    vector_dir: Path | None = None,
) -> RelationGraph:
    """문서를 읽어 연결 그래프를 만든다.

    문서번호로 잇는 것이 먼저다(확실). 요약 벡터가 있으면 내용·날짜로 추정한
    연결을 덧붙인다(추정). 벡터가 없으면 확실한 연결만 남는다.
    """
    markdown_dir = markdown_dir or settings.MARKDOWN_DIR
    graph = RelationGraph()

    by_issuing: dict[str, str] = {}  # 시행번호 -> document_id
    by_receipt: dict[str, str] = {}  # 접수번호 -> document_id
    by_doc_number: dict[str, list[str]] = defaultdict(list)  # 파일이름 번호 -> document_id들
    related_by_document: dict[str, list[official.Reference]] = {}

    for meta, body in read_markdown(markdown_dir):
        parsed = official.parse(body)
        document_id = meta["document_id"]

        graph.nodes[document_id] = DocumentNode(
            document_id=document_id,
            title=meta.get("title") or "",
            doc_number=meta.get("doc_number"),
            kind=meta.get("kind"),
            direction=meta.get("direction"),
            sender=meta.get("sender"),
            subject=parsed.subject,
            recipient=parsed.recipient,
            issuing_number=parsed.issuing_number,
            issuing_date=parsed.issuing_date,
            receipt_number=parsed.receipt_number,
            receipt_date=parsed.receipt_date,
            approval_date=parsed.approval_date,
            disclosure=parsed.disclosure,
            markdown_path=meta.get("markdown_path"),
        )

        if parsed.issuing_number:
            by_issuing.setdefault(parsed.issuing_number, document_id)
        if parsed.receipt_number:
            by_receipt.setdefault(parsed.receipt_number, document_id)
        if meta.get("doc_number"):
            by_doc_number[meta["doc_number"]].append(document_id)
        if parsed.related:
            related_by_document[document_id] = parsed.related

    _add_attachment_edges(graph, by_doc_number)
    _add_related_edges(graph, related_by_document, by_issuing, by_receipt)
    if suggest:
        _add_suggested_edges(graph, vector_dir)
    return graph


def _add_suggested_edges(graph: RelationGraph, vector_dir: Path | None) -> None:
    """요약 벡터로 추정한 연결을 덧붙인다. 벡터가 없으면 조용히 넘어간다."""
    try:
        ids, vectors = similarity.load_summary_vectors(vector_dir)
    except Exception as exc:
        print(f"[relations] 요약 벡터를 읽지 못해 추정 연결을 건너뜁니다: {exc}")
        return

    nodes = {key: asdict(node) for key, node in graph.nodes.items()}
    explicit = {(edge.source, edge.target) for edge in graph.edges}
    for suggestion in similarity.suggest(nodes, ids, vectors):
        if (suggestion.source, suggestion.target) in explicit:
            continue  # 문서번호로 이미 이어진 쌍은 추정으로 또 잇지 않는다
        graph.edges.append(
            Edge(
                source=suggestion.source,
                target=suggestion.target,
                type=suggestion.type,
                label=suggestion.label,
                score=suggestion.score,
            )
        )


def _add_attachment_edges(graph: RelationGraph, by_doc_number: dict[str, list[str]]) -> None:
    """한 공문의 본문과 첨부를 잇는다."""
    for document_ids in by_doc_number.values():
        body = next(
            (i for i in document_ids if graph.nodes[i].kind == "본문"),
            None,
        )
        if body is None:
            continue
        for document_id in document_ids:
            if document_id == body:
                continue
            graph.edges.append(
                Edge(
                    source=body,
                    target=document_id,
                    type=ATTACHMENT,
                    label=graph.nodes[document_id].title,
                )
            )


def _add_related_edges(
    graph: RelationGraph,
    related_by_document: dict[str, list[official.Reference]],
    by_issuing: dict[str, str],
    by_receipt: dict[str, str],
) -> None:
    """관련 항목의 번호를 실제 문서로 잇는다. 양방향으로 넣는다."""
    for document_id, references in related_by_document.items():
        for reference in references:
            target = by_issuing.get(reference.number) or by_receipt.get(reference.number)
            if target is None or target == document_id:
                graph.unresolved.append((document_id, reference.number))
                continue

            graph.edges.append(
                Edge(
                    source=document_id,
                    target=target,
                    type=RELATED,
                    label=reference.number,
                )
            )
            # 반대 방향도 넣어 둔다. 앞선 문서에서 "이 일이 어떻게 됐나"를
            # 따라갈 수 있어야 업무 흐름이 보인다.
            graph.edges.append(
                Edge(
                    source=target,
                    target=document_id,
                    type=FOLLOW_UP,
                    label=graph.nodes[document_id].title,
                )
            )


def save(graph: RelationGraph, path: Path | None = None) -> Path:
    path = path or settings.DATA_DIR / "relations.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", errors="replace") as stream:
        stream.write(json.dumps(graph.to_dict(), ensure_ascii=False))
    return path


def load(path: Path | None = None) -> dict:
    path = path or settings.DATA_DIR / "relations.json"
    if not path.exists():
        return {"nodes": {}, "edges": []}
    with open(path, encoding="utf-8") as stream:
        return json.load(stream)


def neighbours(graph: dict, document_id: str, types: set[str] | None = None) -> list[dict]:
    """한 문서에 이어진 문서들. 화면에서 '관련 문서'로 보여 줄 수 있다."""
    results = []
    for edge in graph.get("edges", []):
        if edge["source"] != document_id:
            continue
        if types and edge["type"] not in types:
            continue
        node = graph.get("nodes", {}).get(edge["target"])
        if node:
            results.append({"type": edge["type"], **node})
    return results
