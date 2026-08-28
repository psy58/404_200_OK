"""Markdown 파일 머리말(YAML frontmatter) 읽기/쓰기.

변환된 .md 파일 하나만 봐도 어느 공문의 무엇인지 알 수 있어야 한다.
LangChain으로 읽을 때도 이 머리말이 그대로 Document.metadata가 된다.

    ---
    document_id: doc_ab12cd34ef
    title: 2025학년도 토요과학교실(3차) 운영 계획
    doc_number: 숭의여자고등학교-10129
    ---

    본문...
"""

from typing import Any

import yaml

DELIMITER = "---"


def dump(metadata: dict[str, Any], body: str) -> str:
    header = yaml.safe_dump(
        metadata,
        allow_unicode=True,  # 한글을 이스케이프하지 않는다
        sort_keys=False,
        default_flow_style=False,
    )
    return f"{DELIMITER}\n{header}{DELIMITER}\n\n{body.strip()}\n"


def parse(text: str) -> tuple[dict[str, Any], str]:
    """머리말과 본문을 나눈다. 머리말이 없으면 빈 사전을 준다."""
    if not text.startswith(DELIMITER):
        return {}, text

    parts = text.split(f"\n{DELIMITER}\n", 1)
    if len(parts) != 2:
        return {}, text

    header = parts[0][len(DELIMITER) :]
    try:
        metadata = yaml.safe_load(header) or {}
    except yaml.YAMLError:
        return {}, text

    if not isinstance(metadata, dict):
        return {}, text
    return metadata, parts[1].lstrip("\n")
