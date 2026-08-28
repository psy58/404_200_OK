"""업로드된 파일을 배치 인제스트와 같은 흐름에 태운다.

    업로드 파일 (data/uploads/)
        │  markitdown                    ← 배치의 1단계와 같은 변환기
        ▼
    data/markdown/업로드/<이름>.md        ← 배치가 다시 돌아도 함께 집계된다
        │  LangChain splitter            ← 배치의 2단계와 같은 분할
        ▼
    documents.json 에 추가               ← 문서함 API가 바로 읽는다
        │  (OpenAI 키가 있으면)
        ▼
    요약 + 임베딩 → Chroma               ← 검색·업무 도우미에 반영

상태는 업로드 기록(state_store)에 남는다.

    received  → 저장만 된 상태
    analyzed  → 변환·분할까지 끝남 (문서함에 보인다)
    indexed   → 검색까지 반영됨
    failed    → 어디선가 실패 (사유를 남긴다)

변환·분할은 빠르지만(1~2초) 요약·임베딩은 OpenAI를 부르므로(수 초),
요청을 잡아 두지 않도록 전체를 배경 작업으로 돌린다.
"""

import hashlib
import json
from datetime import date
from pathlib import Path

from .. import settings
from ..ingest import frontmatter, splitter
from . import document_store, state_store

UPLOAD_MARKDOWN_SUBDIR = "업로드"

STATUS_NOTE = {
    "received": "서버에 저장했습니다. 변환을 시작합니다.",
    "analyzed": "변환·분할까지 끝났습니다. 문서함에 보입니다. 검색 반영(색인)을 진행합니다.",
    "indexed": "검색까지 반영됐습니다. 업무 도우미가 이 문서를 근거로 쓸 수 있습니다.",
    "failed": "처리에 실패했습니다.",
}


def _document_id(record_id: str) -> str:
    return "doc_up_" + hashlib.sha1(record_id.encode()).hexdigest()[:10]


def _convert_to_markdown(saved_path: Path, record_id: str, title: str) -> tuple[Path, str]:
    """markitdown으로 변환해 배치와 같은 폴더 구조에 md 를 남긴다."""
    from ..ingest import converter

    body = converter.convert_one(converter.build_markitdown(), saved_path).strip()
    if len(body) < converter.MIN_CHARACTERS:
        raise ValueError("변환 결과가 비어 있습니다 (스캔 이미지이거나 지원하지 않는 내용).")

    meta = {
        "document_id": _document_id(record_id),
        "title": title,
        "doc_number": None,
        "kind": None,
        "sender": None,
        "direction": "uploaded",
        "source_path": f"{UPLOAD_MARKDOWN_SUBDIR}/{saved_path.name}",
        "source_type": saved_path.suffix.lstrip(".").lower() or "other",
        "converted_by": "upload",
    }
    target = settings.MARKDOWN_DIR / UPLOAD_MARKDOWN_SUBDIR / f"{saved_path.name}.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(frontmatter.dump(meta, body), encoding="utf-8", errors="replace")
    return target, body


def _chunk_and_register(markdown_path: Path) -> dict:
    """md 하나를 분할해 documents.json 에 추가하고 문서함을 새로 읽는다."""
    meta, body = frontmatter.parse(markdown_path.read_text(encoding="utf-8"))
    from langchain_core.documents import Document

    document = Document(page_content=body, metadata=meta)
    chunks = splitter.split_document(document)
    record = splitter.to_store_record(document, chunks)
    record["chunk_count"] = len(chunks)

    documents_path = settings.DOCUMENTS_PATH
    payload = {"documents": []}
    if documents_path.exists():
        with open(documents_path, encoding="utf-8") as stream:
            payload = json.load(stream)
    # 같은 문서를 다시 올리면 교체한다
    payload["documents"] = [
        r for r in payload.get("documents", [])
        if r.get("document_id") != record["document_id"]
    ] + [record]
    documents_path.parent.mkdir(parents=True, exist_ok=True)
    with open(documents_path, "w", encoding="utf-8", errors="replace") as stream:
        stream.write(json.dumps(payload, ensure_ascii=False))

    document_store.load(documents_path)  # 문서함 API에 바로 보이게
    return record


def _index(record: dict, title: str) -> bool:
    """요약과 임베딩. 키가 없으면 True 대신 False — 색인 없이 끝낸다."""
    if not settings.openai_api_key():
        return False

    from langchain_core.documents import Document

    from ..rag import embedder, store, summarizer

    # 조각 임베딩 (배치 3단계와 같은 인덱스에 upsert)
    chunk_documents = [
        Document(
            id=store.chunk_uid(record["document_id"], chunk["chunk_id"]),
            page_content=chunk["content"],
            metadata=store.clean_metadata({**record, **chunk}),
        )
        for chunk in record["chunks"]
    ]
    chunk_store = store.open_chunk_store(
        embedder.build_embeddings(settings.CHUNK_EMBEDDING_MODEL)
    )
    embedder.run(chunk_store, chunk_documents)

    # 요약 생성 + 요약 임베딩 (1단계 검색에 걸리게 하려면 요약이 있어야 한다)
    llm = summarizer.build_llm()
    summary = summarizer.summarize(llm, record)
    summaries = summarizer.load_summaries()
    summaries[record["document_id"]] = summary
    summarizer.save_summaries(summaries, settings.SUMMARY_MODEL)

    summary_store = store.open_summary_store(
        embedder.build_embeddings(settings.SUMMARY_EMBEDDING_MODEL)
    )
    embedder.run(
        summary_store,
        [
            Document(
                id=record["document_id"],
                page_content=f"{title}\n\n{summary}",
                metadata=store.clean_metadata(record),
            )
        ],
    )
    return True


def process_upload(record_id: str, saved_path: Path, title: str) -> None:
    """업로드 한 건을 끝까지 처리한다. 배경 작업으로 돈다."""

    def status(value: str, note: str | None = None, **extra) -> None:
        state_store.update_upload(
            record_id, status=value, note=note or STATUS_NOTE[value], **extra
        )

    try:
        markdown_path, _ = _convert_to_markdown(saved_path, record_id, title)
        record = _chunk_and_register(markdown_path)
        status(
            "analyzed",
            document_id=record["document_id"],
            chunk_count=record["chunk_count"],
        )
    except Exception as exc:
        status("failed", note=f"{STATUS_NOTE['failed']} {exc}")
        return

    try:
        if _index(record, title):
            status(
                "indexed",
                document_id=record["document_id"],
                chunk_count=record["chunk_count"],
            )
        else:
            status(
                "analyzed",
                note="변환·분할까지 끝났습니다. OpenAI 키가 없어 검색 색인은 건너뜁니다.",
                document_id=record["document_id"],
                chunk_count=record["chunk_count"],
            )
    except Exception as exc:
        # 색인 실패는 문서함까지는 살아 있는 상태다. 그렇게 말한다.
        status(
            "analyzed",
            note=f"문서함에는 반영됐지만 검색 색인에 실패했습니다: {exc}",
            document_id=record["document_id"],
            chunk_count=record["chunk_count"],
        )
