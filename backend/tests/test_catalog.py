#!/usr/bin/env python3 -m pytest
"""변환 결과 목록."""

from pathlib import Path

from app.ingest import catalog, frontmatter


def write(directory: Path, name: str, meta: dict, body: str) -> None:
    path = directory / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(frontmatter.dump(meta, body), encoding="utf-8")


def make_corpus(tmp_path: Path) -> Path:
    directory = tmp_path / "markdown"
    write(
        directory,
        "기안한문서/계획.pdf.md",
        {
            "document_id": "doc_a",
            "title": "토요과학교실 운영 계획",
            "doc_number": "숭의여자고등학교-10129",
            "kind": "본문",
            "direction": "drafted",
            "source_type": "pdf",
            "converted_by": "python",
        },
        "본문입니다. " * 60,
    )
    write(
        directory,
        "기안한문서/기획서.hwp.md",
        {
            "document_id": "doc_b",
            "title": "운영기획서",
            "doc_number": "숭의여자고등학교-10129",
            "kind": "첨부",
            "direction": "drafted",
            "source_type": "hwp",
            "converted_by": "hancom",
        },
        "표가 들어간 기획서. " * 40,
    )
    write(
        directory,
        "접수한문서/안내.pdf.md",
        {
            "document_id": "doc_c",
            "title": "공모 안내",
            "doc_number": "숭의여자고등학교-1000",
            "kind": "본문",
            "direction": "received",
            "sender": "서울특별시교육청 창의미래교육과",
            "source_type": "pdf",
        },
        "짧은 문서",
    )
    return directory


def test_reads_every_converted_file(tmp_path: Path) -> None:
    built = catalog.read(make_corpus(tmp_path))
    assert len(built.entries) == 3
    assert {e.document_id for e in built.entries} == {"doc_a", "doc_b", "doc_c"}


def test_index_file_itself_is_skipped(tmp_path: Path) -> None:
    directory = make_corpus(tmp_path)
    catalog.write_index(directory)
    assert len(catalog.read(directory).entries) == 3  # _INDEX.md 는 세지 않는다


def test_short_documents_are_flagged(tmp_path: Path) -> None:
    """변환이 잘못된 문서는 대개 결과가 짧다."""
    built = catalog.read(make_corpus(tmp_path))
    assert [e.document_id for e in built.short_entries] == ["doc_c"]


def test_attachments_are_listed_under_their_body(tmp_path: Path) -> None:
    text = catalog.render(catalog.read(make_corpus(tmp_path)), tmp_path / "markdown")
    heading = "### 숭의여자고등학교-10129 — 토요과학교실 운영 계획"
    assert heading in text

    section = text.split(heading, 1)[1]
    body_line, attachment_line = section.strip().splitlines()[:2]
    assert "본문" in body_line
    assert "첨부" in attachment_line and "한글 변환" in attachment_line


def test_links_stay_readable(tmp_path: Path) -> None:
    """경로에 한글과 공백이 들어간다. 퍼센트 인코딩하면 읽을 수 없다."""
    text = catalog.render(catalog.read(make_corpus(tmp_path)), tmp_path / "markdown")
    assert "(<기안한문서/계획.pdf.md>)" in text
    assert "%EA%B8" not in text


def test_sender_is_shown_for_received_documents(tmp_path: Path) -> None:
    text = catalog.render(catalog.read(make_corpus(tmp_path)), tmp_path / "markdown")
    assert "서울특별시교육청 창의미래교육과" in text


def test_write_index_creates_the_file(tmp_path: Path) -> None:
    directory = make_corpus(tmp_path)
    path, built = catalog.write_index(directory)
    assert path.name == "_INDEX.md"
    assert path.exists()
    assert "문서 **3건**" in path.read_text(encoding="utf-8")
    assert len(built.entries) == 3


def test_not_converted_files_are_listed_with_reasons(tmp_path: Path) -> None:
    """왜 이 문서가 없는지 목록에서 바로 답이 나와야 한다."""
    report = {
        "skipped": [
            {"file": "지출품의서.ozd", "reason": "오즈리포트 문서라 텍스트를 뽑을 수 없습니다."},
            {"file": "품의서2.ozd", "reason": "오즈리포트 문서라 텍스트를 뽑을 수 없습니다."},
            {"file": "통장사본.pdf", "reason": "스캔한 이미지 PDF로 보입니다."},
        ],
        "failed": [{"file": "명단.xls", "reason": "암호가 걸린 문서입니다."}],
    }
    text = catalog.render(catalog.read(make_corpus(tmp_path)), tmp_path, report)

    assert "## 변환하지 못한 문서 (4건)" in text
    assert "**오즈리포트 문서라 텍스트를 뽑을 수 없습니다.** — 2건" in text
    assert "지출품의서.ozd" in text
    assert "### 실패 (1건)" in text
    assert "암호가 걸린 문서입니다." in text and "명단.xls" in text


def test_index_without_a_report_still_works(tmp_path: Path) -> None:
    text = catalog.render(catalog.read(make_corpus(tmp_path)), tmp_path, {})
    assert "변환하지 못한 문서" not in text
