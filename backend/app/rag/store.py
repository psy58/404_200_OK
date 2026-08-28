"""벡터 저장소. 인덱스가 둘이다.

    document_summaries   문서 한 건 = 벡터 하나. 요약을 임베딩한다(3-large).
    document_chunks      조각 하나 = 벡터 하나. 본문을 임베딩한다(3-small).

검색은 두 단계로 한다. 먼저 요약에서 관련 문서를 추리고, 그 문서들 안에서만
조각을 찾는다. 엉뚱한 문서의 조각이 문장 하나 비슷하다고 근거로 올라오는 일을
줄이려는 것이다.

두 인덱스는 차원이 달라 같은 컬렉션에 넣을 수 없다. Chroma는 컬렉션마다
차원을 따로 가지므로 저장 폴더는 하나를 같이 쓴다.

조각 식별자는 "문서id:조각id", 요약 식별자는 문서id다. 같은 것을 다시 넣으면
덮어쓰므로 문서가 늘어날 때 전체를 다시 임베딩하지 않아도 된다.
"""

import json
from pathlib import Path
from typing import Any, Iterable

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

from .. import settings

SUMMARY_COLLECTION = "document_summaries"
CHUNK_COLLECTION = "document_chunks"

# Chroma 메타데이터로 넣을 수 있는 값은 문자열·숫자·불리언뿐이다.
_METADATA_FIELDS = (
    "document_id",
    "chunk_id",
    "title",
    "doc_number",
    "kind",
    "direction",
    "source_type",
    "section",
    "page",
)


def chunk_uid(document_id: str, chunk_id: str) -> str:
    return f"{document_id}:{chunk_id}"


def clean_metadata(raw: dict[str, Any]) -> dict[str, Any]:
    """None과 빈 값을 걸러 낸다. Chroma가 None을 받지 않는다."""
    return {
        key: raw[key]
        for key in _METADATA_FIELDS
        if raw.get(key) is not None and raw.get(key) != ""
    }


def _open(collection: str, embeddings: Embeddings, directory: Path | None) -> Chroma:
    directory = directory or settings.VECTOR_DIR
    directory.mkdir(parents=True, exist_ok=True)
    return Chroma(
        collection_name=collection,
        embedding_function=embeddings,
        persist_directory=str(directory),
        # 기본값은 L2 거리인데, 그러면 관련도가 0~1을 벗어난다. API 계약의
        # relevance가 0~1이므로 코사인으로 고정한다.
        collection_metadata={"hnsw:space": "cosine"},
    )


def open_chunk_store(embeddings: Embeddings, directory: Path | None = None) -> Chroma:
    return _open(CHUNK_COLLECTION, embeddings, directory)


def open_summary_store(embeddings: Embeddings, directory: Path | None = None) -> Chroma:
    return _open(SUMMARY_COLLECTION, embeddings, directory)


def read_documents_file(path: Path | None = None) -> list[dict]:
    path = path or settings.DOCUMENTS_PATH
    if not path.exists():
        raise SystemExit(f"{path} 가 없습니다. 먼저 scripts/build_index.py 를 돌리세요.")
    with open(path, encoding="utf-8") as stream:
        return json.load(stream).get("documents", [])


def load_chunk_documents(path: Path | None = None) -> list[Document]:
    """조각을 LangChain Document로 읽는다. Chunk Index에 넣을 것들이다."""
    documents: list[Document] = []
    for record in read_documents_file(path):
        for chunk in record["chunks"]:
            documents.append(
                Document(
                    id=chunk_uid(record["document_id"], chunk["chunk_id"]),
                    page_content=chunk["content"],
                    metadata=clean_metadata({**record, **chunk}),
                )
            )
    return documents


def load_summary_documents(
    summaries_path: Path | None = None,
    documents_path: Path | None = None,
) -> list[Document]:
    """문서 요약을 Document로 읽는다. Summary Index에 넣을 것들이다.

    검색어에 문서 제목이나 공문 번호가 그대로 나오는 경우가 많아, 요약 앞에
    제목과 번호를 붙여서 임베딩한다.
    """
    summaries_path = summaries_path or settings.SUMMARIES_PATH
    if not summaries_path.exists():
        raise SystemExit(
            f"{summaries_path} 가 없습니다. 먼저 scripts/build_summaries.py 를 돌리세요."
        )

    with open(summaries_path, encoding="utf-8") as stream:
        summaries = json.load(stream).get("summaries", {})

    records = {record["document_id"]: record for record in read_documents_file(documents_path)}

    documents: list[Document] = []
    for document_id, summary in summaries.items():
        record = records.get(document_id)
        if record is None or not summary.strip():
            continue
        heading = " / ".join(
            part for part in (record["title"], record.get("doc_number")) if part
        )
        documents.append(
            Document(
                id=document_id,
                page_content=f"{heading}\n\n{summary.strip()}",
                metadata=clean_metadata(record),
            )
        )
    return documents


def existing_ids(store: Chroma, ids: Iterable[str]) -> set[str]:
    """이미 임베딩해 둔 것. 다시 부르지 않기 위해 확인한다."""
    ids = list(ids)
    if not ids:
        return set()

    found: set[str] = set()
    step = 5000  # 한 번에 너무 많이 물으면 sqlite 쿼리가 길어진다
    for start in range(0, len(ids), step):
        result = store.get(ids=ids[start : start + step], include=[])
        found.update(result.get("ids", []))
    return found


def count(store: Chroma) -> int:
    return store._collection.count()


def close(store: Chroma) -> None:
    """벡터를 디스크에 확실히 내려놓고 연결을 닫는다.

    Chroma는 색인을 백그라운드에서 정리해 파일로 쓴다. 넣자마자 프로세스가
    끝나면 sqlite에는 기록이 남지만 색인 파일이 만들어지지 않아, 다음에 열 때
    "Error loading hnsw index"로 읽지 못한다. 넣기를 마치면 반드시 닫는다.
    """
    client = getattr(store, "_client", None)
    if client is not None and hasattr(client, "close"):
        client.close()
