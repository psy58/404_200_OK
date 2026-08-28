#!/usr/bin/env python3 -m pytest
"""인제스트 두 단계.

    1단계  업무 문서 → markitdown → Markdown 파일
    2단계  Markdown 파일 → LangChain → 조각 저장소

문서 원본은 개인정보라 저장소에 넣지 않으므로, 실제 파일이 필요한 검사는
업무목록 폴더가 있을 때만 돌린다.
"""

import json
from pathlib import Path

import pytest

from app.ingest import converter, frontmatter, hwp_com, metadata, splitter
from app.ingest.splitter import CHUNK_SIZE
from app.services import document_store

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "업무목록"
needs_source = pytest.mark.skipif(not SOURCE.exists(), reason="업무목록 폴더가 없습니다.")


# --- 파일 이름에서 공문 정보 읽기 -------------------------------------------


def parse_name(name: str, folder: str = "기안한문서") -> metadata.DocumentMeta:
    return metadata.parse(SOURCE / folder / name, SOURCE)


def test_parses_drafted_document_name() -> None:
    meta = parse_name("(숭의여자고등학교-10129 (본문)) 2025학년도 토요과학교실(3차) 운영 계획.pdf")
    assert meta.doc_number == "숭의여자고등학교-10129"
    assert meta.kind == "본문"
    assert meta.title == "2025학년도 토요과학교실(3차) 운영 계획"
    assert meta.direction == metadata.DRAFTED
    assert meta.sender is None


def test_parses_received_document_with_sender() -> None:
    meta = parse_name(
        "(숭의여자고등학교-11247 (첨부) 서울특별시교육청 학생역량과) [연수 4] 운영 계획.hwpx",
        folder="접수한문서",
    )
    assert meta.doc_number == "숭의여자고등학교-11247"
    assert meta.kind == "첨부"
    assert meta.sender == "서울특별시교육청 학생역량과"
    assert meta.direction == metadata.RECEIVED


def test_attachments_share_the_document_number() -> None:
    """본문과 첨부를 한 건으로 묶으려면 번호가 같아야 한다."""
    body = parse_name("(숭의여자고등학교-10129 (본문)) 운영 계획.pdf")
    attachment = parse_name("(숭의여자고등학교-10129 (첨부)) 1. 운영기획서.hwp")
    assert body.doc_number == attachment.doc_number
    assert body.document_id != attachment.document_id


def test_unparsable_name_falls_back_to_the_file_name() -> None:
    meta = parse_name("그냥 메모.pdf")
    assert meta.title == "그냥 메모"
    assert meta.doc_number is None


def test_document_id_is_stable_and_ascii() -> None:
    """식별자가 URL 경로에 그대로 들어가므로 ASCII여야 한다."""
    first = parse_name("(숭의여자고등학교-10129 (본문)) 운영 계획.pdf").document_id
    second = parse_name("(숭의여자고등학교-10129 (본문)) 운영 계획.pdf").document_id
    assert first == second
    assert first.isascii()


# --- 1단계: Markdown 파일 ---------------------------------------------------


def test_frontmatter_round_trip() -> None:
    meta = {"document_id": "doc_1", "title": "제목: 콜론이 든 제목", "sender": None}
    text = frontmatter.dump(meta, "본문 한 줄")
    parsed_meta, body = frontmatter.parse(text)
    assert parsed_meta == meta
    assert body.strip() == "본문 한 줄"


def test_frontmatter_tolerates_plain_markdown() -> None:
    meta, body = frontmatter.parse("# 그냥 마크다운\n\n본문")
    assert meta == {}
    assert body.startswith("# 그냥 마크다운")


def test_markdown_path_keeps_the_folder_structure() -> None:
    source = SOURCE / "기안한문서" / "(숭의여자고등학교-10129 (본문)) 운영 계획.pdf"
    target = converter.markdown_path(source, SOURCE, Path("out"))
    assert target == Path("out/기안한문서/(숭의여자고등학교-10129 (본문)) 운영 계획.pdf.md")


def test_hwp_converter_is_registered_in_markitdown() -> None:
    """구버전 HWP도 markitdown 한 곳을 거쳐야 한다."""
    from app.ingest.hwp_converter import HwpConverter

    registered = converter.build_markitdown()._converters
    assert any(isinstance(entry.converter, HwpConverter) for entry in registered)


@needs_source
def test_converts_every_format_to_markdown(tmp_path: Path) -> None:
    """hwp, hwpx, pdf, xlsx가 모두 Markdown 파일이 되어야 한다."""
    for extension in (".hwp", ".hwpx", ".pdf", ".xlsx"):
        source = next(SOURCE.glob(f"**/*{extension}"), None)
        if source is None:
            continue
        markitdown = converter.build_markitdown()
        body = converter.convert_one(markitdown, source)
        assert len(body.strip()) > 40, f"{extension} 변환 결과가 비었습니다."


@needs_source
def test_conversion_writes_files_with_frontmatter(tmp_path: Path) -> None:
    # 테스트에서는 한글 오피스를 부르지 않는다. 실행 중인 다른 변환과
    # 한글 인스턴스를 함께 쓰게 되고, 테스트가 몇 분씩 걸린다.
    report = converter.convert_tree(
        SOURCE, tmp_path, limit=3, use_hancom=False, progress_every=0
    )
    assert report.converted == 3

    written = list(tmp_path.rglob("*.md"))
    assert len(written) == 3
    meta, body = frontmatter.parse(written[0].read_text(encoding="utf-8"))
    assert meta["document_id"].startswith("doc_")
    assert meta["source_path"]
    assert body.strip()


@needs_source
def test_conversion_resumes_without_redoing_work(tmp_path: Path) -> None:
    """중간에 멈춰도 이어 돌릴 수 있어야 한다.

    이미 만든 .md는 다시 만들지 않고 그다음 문서로 넘어간다.
    (--limit은 '새로 변환할 건수'다.)
    """
    converter.convert_tree(SOURCE, tmp_path, limit=2, use_hancom=False, progress_every=0)
    first_pass = {path: path.stat().st_mtime_ns for path in tmp_path.rglob("*.md")}
    assert len(first_pass) == 2

    again = converter.convert_tree(
        SOURCE, tmp_path, limit=2, use_hancom=False, progress_every=0
    )
    assert again.converted == 2  # 앞의 두 건이 아니라 그다음 두 건
    assert len(list(tmp_path.rglob("*.md"))) == 4
    for path, mtime in first_pass.items():
        assert path.stat().st_mtime_ns == mtime, "이미 변환한 파일을 다시 썼습니다."


def test_hancom_cache_mirrors_the_source_tree(tmp_path: Path) -> None:
    """변환한 HWPX는 원본 폴더가 아니라 캐시 폴더에 쌓여야 한다."""
    session = hwp_com.HancomSession(tmp_path / "hwpx_cache")
    source = SOURCE / "기안한문서" / "(숭의여자고등학교-10129 (첨부)) 1. 운영기획서.hwp"
    target = session.target_path(source, SOURCE)

    assert target.suffix == ".hwpx"
    assert target.parent.name == "기안한문서"
    assert tmp_path in target.parents
    assert SOURCE not in target.parents


def test_conversion_records_which_backend_was_used(tmp_path: Path) -> None:
    """나중에 표가 왜 흩어졌는지 따질 수 있도록 변환 방식을 남긴다."""
    meta = {"document_id": "doc_1", "converted_by": converter.HANCOM}
    text = frontmatter.dump(meta, "본문")
    assert frontmatter.parse(text)[0]["converted_by"] == "hancom"


def test_unsupported_formats_are_listed_not_converted() -> None:
    for extension in (".ozd", ".jpg", ".png"):
        assert extension in converter.UNSUPPORTED


# --- 2단계: LangChain 분할 ---------------------------------------------------


def write_markdown(directory: Path, name: str, meta: dict, body: str) -> Path:
    path = directory / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(frontmatter.dump(meta, body), encoding="utf-8")
    return path


def test_metadata_travels_from_frontmatter_to_chunks(tmp_path: Path) -> None:
    write_markdown(
        tmp_path,
        "문서.md",
        {"document_id": "doc_1", "title": "운영 계획", "source_type": "hwp"},
        "## 1. 목적\n\n" + ("과학 행사를 운영한다. " * 60),
    )
    documents = splitter.load_markdown_documents(tmp_path)
    assert len(documents) == 1

    chunks = splitter.split_document(documents[0])
    assert chunks
    assert all(chunk.metadata["document_id"] == "doc_1" for chunk in chunks)
    assert any(chunk.metadata.get("h2") == "1. 목적" for chunk in chunks)


def test_chunks_stay_within_the_size_limit(tmp_path: Path) -> None:
    write_markdown(tmp_path, "문서.md", {"document_id": "doc_1"}, "문장입니다. " * 500)
    records, chunk_total = splitter.build_records(tmp_path)
    assert chunk_total > 1
    for chunk in records[0]["chunks"]:
        assert len(chunk["content"]) <= CHUNK_SIZE * 1.2


def test_chunk_ids_are_sequential(tmp_path: Path) -> None:
    write_markdown(tmp_path, "문서.md", {"document_id": "doc_1"}, "문단입니다.\n\n" * 80)
    records, _ = splitter.build_records(tmp_path)
    ids = [chunk["chunk_id"] for chunk in records[0]["chunks"]]
    assert ids == [f"chunk_{index:04d}" for index in range(len(ids))]


def test_index_can_be_rebuilt_from_markdown_only(tmp_path: Path) -> None:
    """원본 문서 없이 .md 폴더만으로 저장소를 다시 만들 수 있어야 한다."""
    write_markdown(
        tmp_path,
        "하위폴더/문서.md",
        {"document_id": "doc_1", "title": "제목", "source_type": "pdf"},
        "본문입니다. " * 50,
    )
    records, chunk_total = splitter.build_records(tmp_path)
    assert len(records) == 1
    assert records[0]["title"] == "제목"
    assert records[0]["markdown_path"] == "하위폴더/문서.md"
    assert chunk_total == records[0]["chunk_count"]


# --- 저장소와 API 연결 -------------------------------------------------------


def test_store_falls_back_to_samples_without_ingest(tmp_path: Path) -> None:
    document_store.load(tmp_path / "없는파일.json")
    assert document_store.ingested_count() == 0
    assert document_store.get("doc_2026_competition_guide") is not None
    document_store.load()  # 원래 상태로 되돌린다


def test_store_serves_ingested_documents(tmp_path: Path, client) -> None:
    path = tmp_path / "documents.json"
    path.write_text(
        json.dumps(
            {
                "documents": [
                    {
                        "document_id": "doc_test01",
                        "title": "시험용 문서",
                        "source_type": "hwp",
                        "doc_number": "테스트-1",
                        "page_count": None,
                        "chunks": [
                            {"chunk_id": "chunk_0000", "page": None, "content": "첫 조각"},
                            {"chunk_id": "chunk_0001", "page": None, "content": "둘째 조각"},
                        ],
                    }
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    document_store.load(path)
    try:
        body = client.get("/api/v1/documents/doc_test01").json()
        assert body["title"] == "시험용 문서"
        assert body["chunk_count"] == 2

        chunk = client.get("/api/v1/documents/doc_test01/chunks/chunk_0000").json()
        assert chunk["next_chunk_id"] == "chunk_0001"
        assert chunk["prev_chunk_id"] is None
    finally:
        document_store.load()


# --- 변환하지 못한 문서 사유 -------------------------------------------------


def test_failure_reasons_are_written_in_plain_words() -> None:
    """담당자가 원본을 고칠지 다시 받을지 판단할 수 있어야 한다."""
    from xlrd.biffh import XLRDError
    from zipfile import BadZipFile

    assert "암호" in converter.describe_failure(XLRDError("Workbook is encrypted"))
    assert "깨졌" in converter.describe_failure(BadZipFile("File is not a zip file"))
    assert "오류" in converter.describe_failure(RuntimeError("무슨 일인지 모를 오류"))


def test_empty_pdf_is_reported_as_a_scan() -> None:
    assert "OCR" in converter.empty_reason(".pdf")
    assert "OCR" not in converter.empty_reason(".hwp")


def test_report_lists_each_skipped_file_with_its_reason() -> None:
    report = converter.ConversionReport()
    report.skipped_files.append(("지출품의서.ozd", converter.UNSUPPORTED[".ozd"]))
    report.skipped_files.append(("통장사본.jpg", converter.UNSUPPORTED[".jpg"]))
    report.failures.append(("명단.xlsx", "파일이 깨졌습니다."))

    payload = report.to_dict()
    assert payload["skipped"][0] == {
        "file": "지출품의서.ozd",
        "reason": converter.UNSUPPORTED[".ozd"],
    }
    assert payload["failed"] == [{"file": "명단.xlsx", "reason": "파일이 깨졌습니다."}]
    assert report.skip_reasons[converter.UNSUPPORTED[".jpg"]] == 1
