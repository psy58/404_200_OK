"""인제스트 결과를 읽어 두는 저장소.

backend/data/documents.json 이 있으면 그것을 쓰고, 없으면 예시 문서만으로
동작한다. 프론트 개발자나 처음 받아 본 사람이 인제스트를 돌리지 않아도
API가 그대로 뜨게 하려는 것이다.

지금은 파일 전체를 메모리에 올린다. 문서가 수천 건을 넘어가면 이 자리를
벡터 저장소와 문서 DB로 바꾼다. 바깥에서 보는 함수 이름은 그대로 둔다.
"""

import json
from datetime import date
from pathlib import Path
from typing import Any

DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "documents.json"

# 인제스트 결과가 없어도 API가 뜨도록 들고 있는 예시 문서.
_SAMPLE_DOCUMENTS: dict[str, dict[str, Any]] = {
    "doc_2026_competition_guide": {
        "title": "2026 학생 교외대회 참가 지침",
        "source_type": "hwpx",
        "doc_number": "서울특별시교육청-2026-1043",
        "issued_on": date(2026, 1, 15),
        "page_count": 24,
        "chunks": {
            "chunk_0141": {
                "page": 11,
                "content": "제3장 참가 절차\n\n교외대회 참가는 학교장의 승인을 받아 진행한다.",
            },
            "chunk_0142": {
                "page": 12,
                "content": (
                    "참가 신청은 대회 개최일 30일 전까지 학교장 결재를 거쳐 제출한다. "
                    "신청 시 참가 학생 명단과 지도교사 확인서를 첨부한다."
                ),
            },
            "chunk_0143": {
                "page": 12,
                "content": "미성년 학생의 개인정보를 대회 주최 측에 제공할 때에는 보호자 동의서를 받는다.",
            },
        },
    },
    "doc_school_2025_10129": {
        "title": "2025학년도 토요과학교실(3차) 운영 계획",
        "source_type": "pdf",
        "doc_number": "숭의여자고등학교-10129",
        "issued_on": date(2025, 9, 1),
        "page_count": 4,
        "chunks": {
            "chunk_0007": {
                "page": 2,
                "content": "운영 계획 수립 후 강사비 지출품의서를 함께 상신한다.",
            }
        },
    },
}

_documents: dict[str, dict[str, Any]] = {}
_ingested_count = 0


_KNOWN_SOURCE_TYPES = {"hwpx", "hwp", "pdf", "xlsx"}


def _from_ingest(record: dict[str, Any]) -> dict[str, Any]:
    source_type = record.get("source_type") or "other"
    return {
        "title": record["title"],
        # 계약의 enum에 없는 확장자(txt, pptx 등)는 other 로 뭉뚱그린다.
        # 업로드로 어떤 파일이 올지 모르는데 enum 밖 값 하나로 죽으면 안 된다.
        "source_type": source_type if source_type in _KNOWN_SOURCE_TYPES else "other",
        "doc_number": record.get("doc_number"),
        "issued_on": None,  # 파일 이름에 날짜가 없다. 문서 본문에서 뽑는 것은 이후 과제.
        "page_count": record.get("page_count"),
        "kind": record.get("kind"),
        "direction": record.get("direction"),
        "relative_path": record.get("relative_path"),
        "chunks": {
            chunk["chunk_id"]: {"page": chunk["page"], "content": chunk["content"]}
            for chunk in record["chunks"]
        },
    }


def load(path: Path = DATA_PATH) -> None:
    """저장소를 다시 읽는다. 예시 문서는 항상 함께 들어간다."""
    global _documents, _ingested_count

    _documents = {key: dict(value) for key, value in _SAMPLE_DOCUMENTS.items()}
    _ingested_count = 0

    if not path.exists():
        return

    try:
        with open(path, encoding="utf-8") as stream:
            payload = json.load(stream)
    except (json.JSONDecodeError, OSError) as exc:
        # 인제스트가 도는 중이거나 파일이 깨졌다. 예시 문서로 계속 뜬다.
        print(f"[document_store] {path}를 읽지 못했습니다: {exc}")
        return

    for record in payload.get("documents", []):
        _documents[record["document_id"]] = _from_ingest(record)
        _ingested_count += 1


def uploaded() -> list[tuple[str, dict[str, Any]]]:
    """담당자가 올린 현재 문서(업로드)만. 올린 순서대로.

    새로 추가한 업무는 작년 사업 기록이 없으므로, 업무 도우미가 전년도
    공문 대신 이 목록을 검색 범위로 쓴다.
    """
    return [
        (document_id, record)
        for document_id, record in _documents.items()
        if record.get("direction") == "uploaded"
    ]


def get(document_id: str) -> dict[str, Any] | None:
    return _documents.get(document_id)


def count() -> int:
    return len(_documents)


def ingested_count() -> int:
    """인제스트로 들어온 문서 수. 예시 문서는 세지 않는다."""
    return _ingested_count


load()
