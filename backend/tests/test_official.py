#!/usr/bin/env python3 -m pytest
"""공문 분석과 문서 연결.

실제 공문에서 본 형태를 그대로 줄여 시험한다. PDF에서 변환된 꼬리말은
표로 바뀌어 칸 구분 기호가 끼어들기도 해서, 그 형태도 함께 본다.
"""

from pathlib import Path

from app.ingest import frontmatter, official, relations

RECEIVED_DOCUMENT = """미래를 여는 협력교육
서울특별시교육청융합과학교육원
수신 수신자 참조
(경유)
제목 서울과학전람회 운영 방안 변경(안) 안내
1. 관련: 기획운영부-66(2026. 1. 9.)
2. 다음과 같이 변경하여 실시하고자 합니다.

붙임 변경(안) 1부.  끝.
서울특별시교육청융합과학교육원장
★교육연구사 김하늘 기획운영부장 2026. 2. 2.
협조자
시행 기획운영부-193 ( 2026. 2. 2. ) 접수 숭의여자고등학교-1000 ( 2026. 2. 2. )
우 08799 서울특별시 관악구 낙성대로 101 / http://ssei.sen.go.kr
전화 02-881-3025 / 부분공개(5)
"""

DRAFTED_DOCUMENT = """숭의여자고등학교
수신 내부결재
제목 2025학년도 토요과학교실(3차) 운영 계획
1. 관련: 가. 숭의여자고등학교-9182(2025. 7. 1.) 나. 창의미래교육과-14069(2025. 8. 29.)
2. 다음과 같이 운영하고자 합니다.

★융합과학부장 이바다 교감 박노을 교장 2025. 8. 14. 최가람
협조자 행정실장 정마루
시행 숭의여자고등학교-10129 ( ) 접수 ( )
우 06944 서울특별시 동작구 여의대방로36길 79 / 부분공개(5)
"""

TABLE_FOOTER_DOCUMENT = """제목 과학 강연 협의회 진행 요청
1. 관련: 숭의여자고등학교-10129(2025. 8. 14.)

| 교장 | | 최가람 | 2025. 9. 1. |
| --- | --- | --- | --- |
협조자 | 시행 숭의여자고등학교-10201 | | ( | | ) 접수 | | ( | ) |
"""

ATTACHMENT_DOCUMENT = """세종과학교실 수업 운영 기획서

학 교 명 : 숭의여자고등학교
수업일자 : 2025년 3월 29일(토)
"""


# --- 공문 한 건 읽기 ---------------------------------------------------------


def test_reads_the_header_of_a_received_document() -> None:
    document = official.parse(RECEIVED_DOCUMENT)
    assert document.subject == "서울과학전람회 운영 방안 변경(안) 안내"
    assert document.recipient == "수신자 참조"
    assert document.disclosure == "부분공개(5)"


def test_reads_the_footer_numbers_and_dates() -> None:
    document = official.parse(RECEIVED_DOCUMENT)
    assert document.issuing_number == "기획운영부-193"
    assert document.issuing_date == "2026-02-02"
    assert document.receipt_number == "숭의여자고등학교-1000"
    assert document.receipt_date == "2026-02-02"
    assert document.approval_date == "2026-02-02"


def test_reads_related_references() -> None:
    document = official.parse(RECEIVED_DOCUMENT)
    assert [(r.number, r.date) for r in document.related] == [("기획운영부-66", "2026-01-09")]


def test_reads_several_related_references() -> None:
    """관련에 가. 나. 로 여러 건이 붙는다."""
    document = official.parse(DRAFTED_DOCUMENT)
    assert [r.number for r in document.related] == [
        "숭의여자고등학교-9182",
        "창의미래교육과-14069",
    ]


def test_drafted_document_without_dates_still_gives_the_number() -> None:
    """기안 문서는 시행 날짜 칸이 비어 있는 경우가 많다."""
    document = official.parse(DRAFTED_DOCUMENT)
    assert document.issuing_number == "숭의여자고등학교-10129"
    assert document.issuing_date is None
    assert document.approval_date == "2025-08-14"  # 결재란 날짜는 남아 있다
    assert document.is_official


def test_footer_split_into_table_cells_is_still_read() -> None:
    """PDF에서 변환하면 꼬리말이 표로 쪼개진다."""
    document = official.parse(TABLE_FOOTER_DOCUMENT)
    assert document.issuing_number == "숭의여자고등학교-10201"
    assert document.related[0].number == "숭의여자고등학교-10129"


def test_attachment_without_a_footer_is_not_an_official_document() -> None:
    document = official.parse(ATTACHMENT_DOCUMENT)
    assert not document.is_official
    assert document.issuing_number is None


def test_person_names_are_not_collected() -> None:
    """결재자·담당자 이름은 문서를 잇는 데 필요 없다. 뽑지 않는다."""
    document = official.parse(RECEIVED_DOCUMENT)
    values = " ".join(
        str(value) for value in vars(document).values() if isinstance(value, str)
    )
    assert "김하늘" not in values


# --- 문서 잇기 ---------------------------------------------------------------


def write(directory: Path, name: str, meta: dict, body: str) -> None:
    path = directory / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(frontmatter.dump(meta, body), encoding="utf-8")


def build_corpus(tmp_path: Path) -> Path:
    directory = tmp_path / "markdown"
    write(
        directory,
        "접수한문서/안내.pdf.md",
        {
            "document_id": "doc_notice",
            "title": "제3기 과학중점학교 지정 알림",
            "doc_number": "숭의여자고등학교-10895",
            "kind": "본문",
            "direction": "received",
        },
        "제목 지정 알림\n시행 창의미래교육과-14069 ( 2025. 8. 29. )"
        " 접수 숭의여자고등학교-10895 ( 2025. 8. 29. )\n",
    )
    write(
        directory,
        "기안한문서/요청.pdf.md",
        {
            "document_id": "doc_request",
            "title": "과학중점학교 학급 승인 요청",
            "doc_number": "숭의여자고등학교-10980",
            "kind": "본문",
            "direction": "drafted",
        },
        "제목 승인 요청\n1. 관련: 창의미래교육과-14069(2025. 8. 29.)\n"
        "교장 2025. 9. 1.\n시행 숭의여자고등학교-10980 ( )\n",
    )
    write(
        directory,
        "기안한문서/요청_첨부.hwp.md",
        {
            "document_id": "doc_request_form",
            "title": "학급 승인 요청서",
            "doc_number": "숭의여자고등학교-10980",
            "kind": "첨부",
            "direction": "drafted",
        },
        "요청서 서식입니다.\n",
    )
    return directory


def test_attachments_are_linked_to_their_body(tmp_path: Path) -> None:
    graph = relations.build(build_corpus(tmp_path))
    edges = [e for e in graph.edges if e.type == relations.ATTACHMENT]
    assert [(e.source, e.target) for e in edges] == [("doc_request", "doc_request_form")]


def test_related_reference_links_two_documents(tmp_path: Path) -> None:
    """받은 공문과 그것을 근거로 기안한 문서가 이어져야 한다."""
    graph = relations.build(build_corpus(tmp_path))

    related = [e for e in graph.edges if e.type == relations.RELATED]
    assert [(e.source, e.target) for e in related] == [("doc_request", "doc_notice")]

    follow_up = [e for e in graph.edges if e.type == relations.FOLLOW_UP]
    assert [(e.source, e.target) for e in follow_up] == [("doc_notice", "doc_request")]


def test_dates_and_numbers_land_on_the_node(tmp_path: Path) -> None:
    graph = relations.build(build_corpus(tmp_path))

    notice = graph.nodes["doc_notice"]
    assert notice.issuing_number == "창의미래교육과-14069"
    assert notice.issuing_date == "2025-08-29"
    assert notice.direction == "received"

    request = graph.nodes["doc_request"]
    assert request.approval_date == "2025-09-01"


def test_references_to_documents_we_do_not_have_are_recorded(tmp_path: Path) -> None:
    """대부분의 관련 참조는 우리가 갖고 있지 않은 문서를 가리킨다."""
    directory = tmp_path / "markdown"
    write(
        directory,
        "기안.md",
        {"document_id": "doc_x", "title": "요청", "doc_number": "숭의여자고등학교-1", "kind": "본문"},
        "제목 요청\n1. 관련: 어디에도없는과-999(2025. 1. 1.)\n시행 숭의여자고등학교-1 ( )\n",
    )
    graph = relations.build(directory)
    assert graph.edges == []
    assert graph.unresolved == [("doc_x", "어디에도없는과-999")]


def test_neighbours_can_be_read_back_from_the_saved_graph(tmp_path: Path) -> None:
    graph = relations.build(build_corpus(tmp_path))
    path = relations.save(graph, tmp_path / "relations.json")

    loaded = relations.load(path)
    linked = relations.neighbours(loaded, "doc_request")
    assert {item["type"] for item in linked} == {relations.ATTACHMENT, relations.RELATED}
    assert {item["title"] for item in linked} == {
        "학급 승인 요청서",
        "제3기 과학중점학교 지정 알림",
    }
