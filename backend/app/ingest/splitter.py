"""2단계: Markdown 파일을 LangChain으로 읽어 조각으로 나눈다.

    backend/data/markdown/**/*.md
        │  frontmatter → Document.metadata
        │  MarkdownHeaderTextSplitter   제목 단위로 먼저 나누고
        │  RecursiveCharacterTextSplitter  크기 기준으로 다시 나눈다
        ▼
    backend/data/documents.json  (문서 조회 API가 읽는다)

조각을 LangChain Document로 만들어 두면 다음 단계(임베딩, 벡터 저장소,
retriever)에서 그대로 이어 쓸 수 있다.
"""

from pathlib import Path
from typing import Iterable

from langchain_core.documents import Document
from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)

from . import frontmatter

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
MIN_CHUNK_CHARACTERS = 40

_HEADERS = [("#", "h1"), ("##", "h2"), ("###", "h3")]

_header_splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=_HEADERS,
    strip_headers=False,  # 제목도 본문에 남겨야 조각만 봐도 맥락을 안다
)
_size_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    separators=["\n\n", "\n", ". ", "다. ", " ", ""],
)


def load_markdown_documents(markdown_dir: Path) -> list[Document]:
    """.md 파일을 LangChain Document로 읽는다. 머리말은 metadata가 된다."""
    documents: list[Document] = []
    for path in sorted(markdown_dir.rglob("*.md")):
        text = path.read_text(encoding="utf-8", errors="replace")
        meta, body = frontmatter.parse(text)
        if not body.strip():
            continue
        meta = dict(meta)
        meta["markdown_path"] = path.relative_to(markdown_dir).as_posix()
        documents.append(Document(page_content=body, metadata=meta))
    return documents


def split_document(document: Document) -> list[Document]:
    """문서 하나를 조각으로 나눈다.

    제목이 있으면 제목 단위로 먼저 자른다. markitdown이 만든 표나 제목
    구조를 살릴 수 있고, 제목이 없는 문서(구버전 HWP처럼 문단만 있는 경우)는
    크기 기준 분할만 적용된다.
    """
    sections = _header_splitter.split_text(document.page_content)
    if not sections:
        sections = [Document(page_content=document.page_content, metadata={})]

    chunks: list[Document] = []
    for section in sections:
        section_meta = {**document.metadata, **section.metadata}
        for piece in _size_splitter.split_text(section.page_content):
            if len(piece.strip()) < MIN_CHUNK_CHARACTERS:
                continue
            chunks.append(Document(page_content=piece.strip(), metadata=dict(section_meta)))
    return chunks


def to_store_record(document: Document, chunks: Iterable[Document]) -> dict:
    """문서 조회 API가 읽는 형태로 바꾼다.

    page는 None이다. markitdown은 쪽 경계를 남기지 않기 때문에 지금은
    쪽 번호를 알 수 없다. 근거를 p.12처럼 가리키려면 PDF만 쪽 단위로 읽는
    단계를 따로 붙여야 한다.
    """
    meta = document.metadata
    return {
        "document_id": meta.get("document_id"),
        "title": meta.get("title"),
        "source_type": meta.get("source_type", "other"),
        "doc_number": meta.get("doc_number"),
        "kind": meta.get("kind"),
        "sender": meta.get("sender"),
        "direction": meta.get("direction"),
        "relative_path": meta.get("source_path"),
        "markdown_path": meta.get("markdown_path"),
        "page_count": None,
        "chunks": [
            {
                "chunk_id": f"chunk_{index:04d}",
                "page": None,
                "section": chunk.metadata.get("h3")
                or chunk.metadata.get("h2")
                or chunk.metadata.get("h1"),
                "content": chunk.page_content,
            }
            for index, chunk in enumerate(chunks)
        ],
    }


def build_records(markdown_dir: Path) -> tuple[list[dict], int]:
    """.md 폴더 전체를 저장소 항목 목록으로 바꾼다."""
    records: list[dict] = []
    chunk_total = 0
    for document in load_markdown_documents(markdown_dir):
        chunks = split_document(document)
        if not chunks:
            continue
        record = to_store_record(document, chunks)
        record["chunk_count"] = len(chunks)
        records.append(record)
        chunk_total += len(chunks)
    return records, chunk_total
