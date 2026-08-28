"""두 단계로 근거 조각을 찾는다.

    질문
     │
     ├─ 1단계  Summary Index에서 관련 문서 N건을 고른다 (문서 단위로 좁히기)
     │
     └─ 2단계  그 문서들 안에서만 Chunk Index를 뒤져 근거 조각을 뽑는다

한 단계로 조각만 뒤지면, 업무가 전혀 다른 문서에 우연히 비슷한 문장이 있을 때
그 조각이 근거로 올라온다. 문서를 먼저 고르면 그런 일이 줄어든다.

/query 응답의 documents 항목이 여기서 나온다. 반환 형태를 API 계약의
DocumentResult와 맞춰 두었으므로 서비스 계층에서 그대로 옮겨 담으면 된다.
"""

import re
from dataclasses import dataclass
from pathlib import Path

from langchain_chroma import Chroma

from .. import settings
from . import doctype, embedder, glossary, store

# 좁게 가져오면 "이 업무가 어떻게 진행됐나" 같은 질문에 답할 수 없다.
# 넉넉히 가져온 다음 종류 가중치와 중복 제거로 걸러 내는 편이 낫다.
DEFAULT_TOP_K = 8
DEFAULT_DOCUMENT_CANDIDATES = 20
CANDIDATE_MULTIPLIER = 5  # 걸러내기 전에 이만큼 더 가져온다
MAX_CHUNKS_PER_DOCUMENT = 2  # 한 문서가 근거를 독차지하지 않게 한다
MAX_CHUNKS_PER_TITLE = 2  # 같은 문서가 여러 번 접수되기도 한다(제목이 같다)
SNIPPET_KEY_LENGTH = 120  # 같은 내용인지 볼 때 비교하는 앞부분 길이

# 벡터만으로는 고유명사를 놓친다. "토요과학교실 운영 계획"을 물으면 "운영 계획"에
# 이끌려 엉뚱한 사업의 계획서가 올라온다. 그래서 질문에 들어 있는 낱말이 문서에
# 실제로 나오는지도 함께 본다.
KEYWORD_WEIGHT = 0.35

# 어느 문서에나 나오는 말은 고유명사 노릇을 못 한다.
STOPWORDS = frozenset(
    """
    운영 계획 계획서 안내 관련 업무 문서 자료 내용 방법 절차 서류 제출 신청 진행
    어떻게 무엇 뭔가요 뭐가 있나요 하나요 합니까 인가요 건가요 알려줘 알려주세요
    정리 대한 위한 해야 되나요 언제 어디 누가 우리 학교 올해 작년 그리고 그런
    """.split()
)


def _keywords(query: str) -> list[str]:
    """질문에서 문서를 가려낼 만한 낱말만 남긴다."""
    tokens = re.findall(r"[가-힣A-Za-z][가-힣A-Za-z0-9]{1,}", query)
    return [token for token in tokens if token not in STOPWORDS]


def _keyword_score(text: str, keywords: list[str]) -> float:
    """질문의 낱말이 문서에 얼마나 나오는가. 0~1."""
    if not keywords:
        return 0.0
    haystack = text or ""
    found = sum(1 for keyword in keywords if keyword in haystack)
    return found / len(keywords)


@dataclass
class Hit:
    document_id: str
    chunk_id: str
    title: str
    content: str
    relevance: float  # 0~1. 문서 종류 가중치까지 반영한 최종 관련도
    document_relevance: float | None = None  # 문서 요약과 질문이 얼마나 가까운가
    kind: str | None = None  # 계획 / 지침 / 안내 / 명단 …
    page: int | None = None
    section: str | None = None
    doc_number: str | None = None
    direction: str | None = None
    source_type: str | None = None


@dataclass
class DocumentMatch:
    """1단계에서 고른 문서. 무슨 업무인지 사용자에게 보여 줄 수도 있다."""

    document_id: str
    title: str
    relevance: float
    kind: str | None = None
    doc_number: str | None = None
    direction: str | None = None


def _content_key(text: str) -> str:
    """같은 내용인지 보기 위한 열쇠.

    공문은 본문과 첨부에 같은 문장이 그대로 실리는 일이 흔하다. 그대로 두면
    근거 다섯 자리 중 세 자리가 같은 글로 채워진다.
    """
    return " ".join(text.split())[:SNIPPET_KEY_LENGTH]


def _select(hits: list["Hit"], k: int) -> list["Hit"]:
    """중복을 걷어 내고 한 문서가 독차지하지 않게 골라 낸다."""
    chosen: list[Hit] = []
    seen_content: set[str] = set()
    per_document: dict[str, int] = {}
    per_title: dict[str, int] = {}

    for hit in hits:
        key = _content_key(hit.content)
        title = " ".join((hit.title or "").split())
        if key in seen_content:
            continue
        if per_document.get(hit.document_id, 0) >= MAX_CHUNKS_PER_DOCUMENT:
            continue
        if per_title.get(title, 0) >= MAX_CHUNKS_PER_TITLE:
            continue
        seen_content.add(key)
        per_document[hit.document_id] = per_document.get(hit.document_id, 0) + 1
        per_title[title] = per_title.get(title, 0) + 1
        chosen.append(hit)
        if len(chosen) >= k:
            break
    return chosen


def _filter(conditions: list[dict]) -> dict | None:
    if not conditions:
        return None
    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


class Searcher:
    """열어 둔 두 인덱스로 계속 검색한다.

    저장소를 열 때 Chroma가 파일을 읽으므로 요청마다 새로 열지 않는다.
    """

    def __init__(self, summary_store: Chroma, chunk_store: Chroma) -> None:
        self.summaries = summary_store
        self.chunks = chunk_store

    @classmethod
    def open(cls, directory: Path | None = None) -> "Searcher":
        directory = directory or settings.VECTOR_DIR
        return cls(
            store.open_summary_store(
                embedder.build_embeddings(settings.SUMMARY_EMBEDDING_MODEL), directory
            ),
            store.open_chunk_store(
                embedder.build_embeddings(settings.CHUNK_EMBEDDING_MODEL), directory
            ),
        )

    def find_documents(
        self,
        query: str,
        k: int = DEFAULT_DOCUMENT_CANDIDATES,
        direction: str | None = None,
        doc_number: str | None = None,
    ) -> list[DocumentMatch]:
        """1단계. 요약으로 관련 문서를 고른다."""
        conditions = []
        if direction:
            conditions.append({"direction": direction})
        if doc_number:
            conditions.append({"doc_number": doc_number})

        # 걸러 내면 줄어드니 넉넉히 가져온다.
        results = self.summaries.similarity_search_with_relevance_scores(
            query, k=k * 2, filter=_filter(conditions)
        )

        keywords = _keywords(query)
        matches = []
        for document, score in results:
            if not document.metadata.get("document_id"):
                continue
            title = document.metadata.get("title", "")
            weighted, kind = doctype.weigh(float(score), title)
            # 제목과 요약에 질문의 낱말이 실제로 나오는지 본다.
            overlap = _keyword_score(f"{title} {document.page_content}", keywords)
            weighted *= 1 + KEYWORD_WEIGHT * overlap
            matches.append(
                DocumentMatch(
                    document_id=document.metadata["document_id"],
                    title=title,
                    relevance=max(0.0, min(1.0, weighted)),
                    kind=kind,
                    doc_number=document.metadata.get("doc_number"),
                    direction=document.metadata.get("direction"),
                )
            )

        matches.sort(key=lambda match: match.relevance, reverse=True)
        return matches[:k]

    def search(
        self,
        query: str,
        k: int = DEFAULT_TOP_K,
        document_candidates: int = DEFAULT_DOCUMENT_CANDIDATES,
        direction: str | None = None,
        doc_number: str | None = None,
        document_ids: list[str] | None = None,
    ) -> list[Hit]:
        """질문과 가까운 조각을 관련도 내림차순으로 돌려준다.

        direction("drafted"/"received")이나 doc_number를 주면 그 범위에서만 찾는다.
        document_ids 를 주면 **그 문서들 안에서만** 찾는다 — 담당자가 특정
        업무를 보며 물을 때 다른 사업의 문서가 근거로 끼어들지 않게 한다.
        Summary Index가 비어 있으면 조각만으로 찾는다(요약 없이도 동작한다).
        """
        # 같은 사업이라도 문서마다 이름이 다르다. 용어집으로 다른 표기를 붙인다.
        expansion = glossary.expand(query)

        if document_ids:
            # 범위가 이미 문서로 정해져 있으면 1단계(요약으로 좁히기)는 필요 없다.
            matches: list[DocumentMatch] = []
            document_scores: dict[str, float] = {}
            conditions: list[dict] = [{"document_id": {"$in": list(document_ids)}}]
        else:
            matches = self.find_documents(
                expansion.text, k=document_candidates, direction=direction, doc_number=doc_number
            )
            document_scores = {match.document_id: match.relevance for match in matches}

            conditions = []
            if document_scores:
                conditions.append({"document_id": {"$in": list(document_scores)}})
            else:
                if direction:
                    conditions.append({"direction": direction})
                if doc_number:
                    conditions.append({"doc_number": doc_number})

        results = self.chunks.similarity_search_with_relevance_scores(
            expansion.text, k=k * CANDIDATE_MULTIPLIER, filter=_filter(conditions)
        )

        keywords = _keywords(query) + expansion.keywords
        hits = []
        for document, score in results:
            title = document.metadata.get("title", "")
            weighted, kind = doctype.weigh(float(score), title)
            overlap = _keyword_score(f"{title} {document.page_content}", keywords)
            weighted *= 1 + KEYWORD_WEIGHT * overlap
            hits.append(
                Hit(
                    document_id=document.metadata.get("document_id", ""),
                    chunk_id=document.metadata.get("chunk_id", ""),
                    title=title,
                    content=document.page_content,
                    relevance=max(0.0, min(1.0, weighted)),
                    document_relevance=document_scores.get(
                        document.metadata.get("document_id", "")
                    ),
                    kind=kind,
                    page=document.metadata.get("page"),
                    section=document.metadata.get("section"),
                    doc_number=document.metadata.get("doc_number"),
                    direction=document.metadata.get("direction"),
                    source_type=document.metadata.get("source_type"),
                )
            )

        hits.sort(key=lambda hit: hit.relevance, reverse=True)
        return _select(hits, k)

    def counts(self) -> dict[str, int]:
        return {
            "summaries": store.count(self.summaries),
            "chunks": store.count(self.chunks),
        }
