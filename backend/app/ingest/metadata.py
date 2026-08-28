"""파일 이름에서 공문서 정보를 읽어 낸다.

업무목록의 파일 이름은 규칙이 있다.

    (숭의여자고등학교-10129 (본문)) 2025학년도 토요과학교실(3차) 운영 계획.pdf
    (숭의여자고등학교-10129 (첨부)) 1. 운영기획서.hwp
    (숭의여자고등학교-11247 (첨부) 서울특별시교육청 학생역량과) [연수 4] 운영 계획.hwpx

문서 번호가 같은 파일들은 한 건의 공문(본문 1개 + 첨부 여러 개)이다.
이 묶음을 알아야 "이 지침의 첨부 서식"처럼 답할 수 있으므로 번호를 뽑아 둔다.
"""

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

# (문서번호 (본문|첨부) 발신기관) 제목
_PATTERN = re.compile(
    r"^\(\s*(?P<doc_number>[^()]+?-\d+)\s*"
    r"\((?P<kind>본문|첨부)\)\s*"
    r"(?P<sender>[^()]*)\)\s*"
    r"(?P<title>.+)$"
)

DRAFTED = "drafted"  # 기안한문서: 우리가 만든 문서
RECEIVED = "received"  # 접수한문서: 받은 공문


@dataclass(frozen=True)
class DocumentMeta:
    document_id: str
    title: str
    doc_number: str | None
    kind: str | None  # 본문 / 첨부
    sender: str | None
    direction: str | None  # drafted / received
    relative_path: str


def _document_id(relative_path: str) -> str:
    """경로에서 만든 안정적인 식별자.

    한글 파일 이름을 URL 경로에 그대로 쓰면 인코딩 문제가 생기므로
    해시로 짧은 ASCII 식별자를 만든다. 같은 파일은 항상 같은 값이 된다.
    """
    digest = hashlib.sha1(relative_path.encode("utf-8")).hexdigest()[:10]
    return f"doc_{digest}"


def _direction(relative_path: str) -> str | None:
    head = relative_path.split("/", 1)[0]
    if head == "기안한문서":
        return DRAFTED
    if head == "접수한문서":
        return RECEIVED
    return None


def parse(path: Path, root: Path) -> DocumentMeta:
    relative_path = path.relative_to(root).as_posix()
    match = _PATTERN.match(path.stem)

    if match is None:
        # 규칙에서 벗어난 이름은 파일 이름을 그대로 제목으로 쓴다.
        return DocumentMeta(
            document_id=_document_id(relative_path),
            title=path.stem.strip(),
            doc_number=None,
            kind=None,
            sender=None,
            direction=_direction(relative_path),
            relative_path=relative_path,
        )

    sender = (match.group("sender") or "").strip()
    return DocumentMeta(
        document_id=_document_id(relative_path),
        title=match.group("title").strip(),
        doc_number=match.group("doc_number").strip(),
        kind=match.group("kind"),
        sender=sender or None,
        direction=_direction(relative_path),
        relative_path=relative_path,
    )
