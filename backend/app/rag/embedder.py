"""조각을 OpenAI 임베딩으로 바꿔 벡터 저장소에 넣는다.

    data/documents.json
        │  OpenAI text-embedding-3-*
        ▼
    data/vectors/  (Chroma)

이미 넣은 조각은 건너뛴다. 중간에 끊겨도 다시 돌리면 남은 것부터 이어서 한다.
"""

import time
from dataclasses import dataclass, field
from typing import Callable

import tiktoken
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

from .. import settings
from . import store

# 1M 토큰당 요금(달러). 요금이 바뀌면 여기만 고친다.
PRICE_PER_MILLION_TOKENS = {
    "text-embedding-3-small": 0.02,
    "text-embedding-3-large": 0.13,
    "text-embedding-ada-002": 0.10,
}

BATCH_SIZE = 200  # 한 번에 저장소에 넣는 조각 수


def build_embeddings(model: str | None = None) -> Embeddings:
    """OpenAI 임베딩 클라이언트. 키가 없으면 여기서 멈춘다."""
    from langchain_openai import OpenAIEmbeddings

    return OpenAIEmbeddings(
        model=model or settings.EMBEDDING_MODEL,
        api_key=settings.require_openai_api_key(),
        max_retries=5,
    )


def count_tokens(texts: list[str], model: str) -> int:
    try:
        encoding = tiktoken.encoding_for_model(model)
    except KeyError:
        encoding = tiktoken.get_encoding("cl100k_base")
    return sum(len(encoding.encode(text)) for text in texts)


def estimate_cost(token_count: int, model: str) -> float:
    price = PRICE_PER_MILLION_TOKENS.get(model, 0.0)
    return token_count / 1_000_000 * price


@dataclass
class EmbeddingPlan:
    """돈을 쓰기 전에 무엇을 얼마에 하는지 먼저 보여 준다."""

    model: str
    total_chunks: int
    already_embedded: int
    pending: list[Document] = field(default_factory=list)
    token_count: int = 0

    @property
    def cost(self) -> float:
        return estimate_cost(self.token_count, self.model)

    def render(self) -> str:
        return "\n".join(
            [
                f"모델        {self.model}",
                f"전체 조각   {self.total_chunks:,}개",
                f"이미 완료   {self.already_embedded:,}개",
                f"이번에 처리 {len(self.pending):,}개",
                f"토큰        약 {self.token_count:,}개",
                f"예상 요금   약 ${self.cost:.2f}",
            ]
        )


def plan(
    documents: list[Document],
    vector_store: Chroma,
    model: str,
    limit: int | None = None,
) -> EmbeddingPlan:
    done = store.existing_ids(vector_store, [document.id for document in documents])
    pending = [document for document in documents if document.id not in done]
    if limit is not None:
        pending = pending[:limit]

    return EmbeddingPlan(
        model=model,
        total_chunks=len(documents),
        already_embedded=len(done),
        pending=pending,
        token_count=count_tokens([document.page_content for document in pending], model),
    )


def run(
    vector_store: Chroma,
    pending: list[Document],
    batch_size: int = BATCH_SIZE,
    on_progress: Callable[[int, int, float], None] | None = None,
) -> int:
    """조각을 나눠서 임베딩하고 저장소에 넣는다. 넣은 개수를 돌려준다."""
    started = time.time()
    added = 0
    for start in range(0, len(pending), batch_size):
        batch = pending[start : start + batch_size]
        vector_store.add_documents(batch, ids=[document.id for document in batch])
        added += len(batch)
        if on_progress:
            on_progress(added, len(pending), time.time() - started)
    return added
