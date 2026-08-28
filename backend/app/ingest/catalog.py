"""변환 결과를 사람이 볼 수 있게 목록으로 만든다.

1,085개의 .md 파일이 폴더 두 개에 흩어져 있으면 무엇이 어떻게 변환됐는지
확인할 방법이 없다. 그래서 목록 파일을 하나 만든다.

    backend/data/markdown/_INDEX.md

공문 한 건(본문 + 첨부들)을 묶어서 보여 주고, 각 파일로 바로 열 수 있는
링크를 단다. 글자 수가 유난히 적은 파일은 따로 모아 둔다. 변환이 잘못된
문서는 대개 거기 있다.
"""

import json
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from . import frontmatter

SHORT_THRESHOLD = 300  # 이보다 짧으면 변환을 의심해 본다

SOURCE_LABEL = {
    "pdf": "PDF",
    "hwp": "HWP",
    "hwpx": "HWPX",
    "xlsx": "XLSX",
    "xls": "XLS",
    "pptx": "PPTX",
    "html": "HTML",
    "zip": "ZIP",
}


@dataclass
class Entry:
    document_id: str
    title: str
    doc_number: str | None
    kind: str | None
    direction: str | None
    sender: str | None
    source_type: str | None
    converted_by: str | None
    characters: int
    relative_path: str

    @property
    def link(self) -> str:
        # 경로에 공백과 한글이 들어 있다. 퍼센트 인코딩하면 읽을 수 없으므로
        # 꺾쇠로 감싼다. 에디터의 미리보기에서 그대로 열린다.
        return f"<{self.relative_path}>"


@dataclass
class Catalog:
    entries: list[Entry] = field(default_factory=list)

    def by_direction(self, direction: str) -> list[Entry]:
        return [entry for entry in self.entries if entry.direction == direction]

    @property
    def short_entries(self) -> list[Entry]:
        return sorted(
            (e for e in self.entries if e.characters < SHORT_THRESHOLD),
            key=lambda e: e.characters,
        )


def read(markdown_dir: Path) -> Catalog:
    catalog = Catalog()
    for path in sorted(markdown_dir.rglob("*.md")):
        if path.name.startswith("_"):
            continue  # 목록 파일 자신
        meta, body = frontmatter.parse(path.read_text(encoding="utf-8", errors="replace"))
        catalog.entries.append(
            Entry(
                document_id=meta.get("document_id", ""),
                title=meta.get("title") or path.stem,
                doc_number=meta.get("doc_number"),
                kind=meta.get("kind"),
                direction=meta.get("direction"),
                sender=meta.get("sender"),
                source_type=meta.get("source_type"),
                converted_by=meta.get("converted_by"),
                characters=len(body.strip()),
                relative_path=path.relative_to(markdown_dir).as_posix(),
            )
        )
    return catalog


def _group_by_document(entries: list[Entry]) -> list[tuple[str, list[Entry]]]:
    """공문 번호로 묶는다. 본문이 먼저, 첨부가 뒤에 온다."""
    groups: dict[str, list[Entry]] = defaultdict(list)
    for entry in entries:
        groups[entry.doc_number or entry.title].append(entry)

    def sort_key(entry: Entry) -> tuple[int, str]:
        return (0 if entry.kind == "본문" else 1, entry.title)

    return sorted(
        ((key, sorted(items, key=sort_key)) for key, items in groups.items()),
        key=lambda item: item[0],
        reverse=True,
    )


def _entry_line(entry: Entry) -> str:
    parts = [entry.kind or "문서", SOURCE_LABEL.get(entry.source_type or "", entry.source_type or "?")]
    if entry.converted_by == "hancom":
        parts.append("한글 변환")
    parts.append(f"{entry.characters:,}자")
    return f"  - [{' · '.join(parts)} — {entry.title}]({entry.link})"


def load_report(path: Path) -> dict:
    """변환할 때 남긴 실패·건너뜀 기록. 없으면 빈 것으로 본다."""
    if not path or not path.exists():
        return {}
    try:
        with open(path, encoding="utf-8") as stream:
            return json.load(stream)
    except (json.JSONDecodeError, OSError):
        return {}


def _render_not_converted(report: dict) -> list[str]:
    """변환하지 못한 문서를 사유별로 묶어 보여 준다.

    담당자가 "이 문서는 왜 없지?"라고 물을 때 답이 되는 자리다. 암호가 걸린
    문서는 풀어서 다시 넣으면 되고, 오즈리포트나 이미지는 방법이 없다.
    """
    skipped = report.get("skipped") or []
    failed = report.get("failed") or []
    if not skipped and not failed:
        return []

    lines = ["", f"## 변환하지 못한 문서 ({len(skipped) + len(failed)}건)", ""]
    for label, items in (("건너뜀", skipped), ("실패", failed)):
        if not items:
            continue
        grouped: dict[str, list[str]] = defaultdict(list)
        for item in items:
            grouped[item.get("reason", "사유 없음")].append(item.get("file", ""))

        lines.append(f"### {label} ({len(items)}건)")
        lines.append("")
        for reason, files in sorted(grouped.items(), key=lambda kv: -len(kv[1])):
            lines.append(f"- **{reason}** — {len(files)}건")
            for name in sorted(files)[:10]:
                lines.append(f"  - {name}")
            if len(files) > 10:
                lines.append(f"  - … 그 외 {len(files) - 10}건")
        lines.append("")
    return lines


def render(catalog: Catalog, markdown_dir: Path, report: dict | None = None) -> str:
    entries = catalog.entries
    drafted = catalog.by_direction("drafted")
    received = catalog.by_direction("received")
    hancom = sum(1 for e in entries if e.converted_by == "hancom")
    characters = sum(e.characters for e in entries)

    lines = [
        "# 변환 결과 목록",
        "",
        f"업무목록 → `{markdown_dir.name}/` · {datetime.now():%Y-%m-%d %H:%M} 기준",
        "",
        f"- 문서 **{len(entries):,}건** / 글자 {characters:,}자",
        f"- 기안한문서 {len(drafted):,}건 · 접수한문서 {len(received):,}건",
        f"- 구버전 HWP를 한글 오피스로 변환 {hancom:,}건",
        "",
        "확장자별",
        "",
        "| 형식 | 건수 | 글자 수 |",
        "|---|---:|---:|",
    ]

    by_type: dict[str, list[Entry]] = defaultdict(list)
    for entry in entries:
        by_type[entry.source_type or "?"].append(entry)
    for source_type, items in sorted(by_type.items(), key=lambda kv: -len(kv[1])):
        total = sum(item.characters for item in items)
        lines.append(
            f"| {SOURCE_LABEL.get(source_type, source_type)} | {len(items):,} | {total:,} |"
        )

    short = catalog.short_entries
    if short:
        lines += [
            "",
            f"## 확인이 필요한 문서 ({len(short)}건)",
            "",
            f"변환 결과가 {SHORT_THRESHOLD}자 미만이다. 원본이 짧은 서식일 수도 있고,"
            " 변환이 제대로 안 된 것일 수도 있다.",
            "",
        ]
        for entry in short[:40]:
            lines.append(_entry_line(entry))
        if len(short) > 40:
            lines.append(f"  - … 그 외 {len(short) - 40}건")

    lines += _render_not_converted(report or {})

    for label, group in (("기안한문서", drafted), ("접수한문서", received)):
        lines += ["", f"## {label} ({len(group):,}건)", ""]
        for doc_number, items in _group_by_document(group):
            head = items[0]
            title = head.title
            sender = f" · {head.sender}" if head.sender else ""
            lines.append(f"### {doc_number} — {title}{sender}")
            for entry in items:
                lines.append(_entry_line(entry))
            lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def write_index(markdown_dir: Path, report_path: Path | None = None) -> tuple[Path, Catalog]:
    catalog = read(markdown_dir)
    report = load_report(report_path) if report_path else {}
    path = markdown_dir / "_INDEX.md"
    path.write_text(
        render(catalog, markdown_dir, report), encoding="utf-8", errors="replace"
    )
    return path, catalog
