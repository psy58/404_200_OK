"""1단계: 업무 문서를 Markdown 파일로 바꾼다.

    업무목록/기안한문서/(숭의여자고등학교-10129 (본문)) 운영 계획.pdf
        │  markitdown
        ▼
    backend/data/markdown/기안한문서/(숭의여자고등학교-10129 (본문)) 운영 계획.pdf.md

변환은 전부 markitdown 한 곳을 거친다. 구버전 HWP만 한 단계를 앞에 둔다.
한글 오피스로 HWPX를 만든 뒤(app/ingest/hwp_com.py) 그 HWPX를 markitdown에
넘긴다. 한글이 만든 HWPX는 표 구조가 남아 있어 Markdown 표로 바뀌지만,
파이썬만으로 HWP를 읽으면 표가 문단으로 흩어진다.

한글 오피스가 없는 환경에서는 등록해 둔 HwpConverter로 자동으로 물러선다
(app/ingest/hwp_converter.py). 결과 품질은 떨어지지만 변환은 된다.

Markdown 파일을 중간 산출물로 남기는 이유는 사람이 열어서 변환 품질을
확인할 수 있고, 뒤 단계(LangChain 적재)를 원본 없이 몇 번이든 다시
돌릴 수 있기 때문이다.
"""

import os
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from markitdown import MarkItDown, StreamInfo

from . import frontmatter, metadata
from .hwp_com import HancomSession, HancomUnavailable
from . import privacy
from .hwp_converter import HwpConverter

SKIP_DIRECTORIES = {".git", "__pycache__", ".venv"}

# 텍스트를 뽑을 방법이 없는 형식. 건너뛰되 이유를 남긴다.
UNSUPPORTED = {
    ".ozd": "오즈리포트 문서라 텍스트를 뽑을 수 없습니다.",
    ".ozr": "오즈리포트 문서라 텍스트를 뽑을 수 없습니다.",
    ".jpg": "이미지입니다. OCR이 필요합니다.",
    ".jpeg": "이미지입니다. OCR이 필요합니다.",
    ".png": "이미지입니다. OCR이 필요합니다.",
    ".gif": "이미지입니다. OCR이 필요합니다.",
}

MIN_CHARACTERS = 40  # 이보다 짧으면 알맹이가 없다고 본다

EMPTY_REASON = "빈 문서입니다. 글자가 들어 있지 않습니다."
SCANNED_PDF_REASON = "스캔한 이미지 PDF로 보입니다. 글자가 없어 OCR이 필요합니다."


def empty_reason(extension: str) -> str:
    """글자가 안 나온 이유. PDF는 스캔본인 경우가 대부분이다."""
    return SCANNED_PDF_REASON if extension == ".pdf" else EMPTY_REASON

# 변환기가 내는 예외를 담당자가 읽을 수 있는 말로 바꾼다.
# "무엇이 잘못됐는지"를 알아야 원본을 고치거나 다시 받을지 판단할 수 있다.
FAILURE_REASONS = (
    ("Workbook is encrypted", "암호가 걸린 문서입니다."),
    ("encrypted", "암호가 걸린 문서입니다."),
    ("File is not a zip file", "파일이 깨졌습니다. 확장자와 실제 형식이 다릅니다."),
    ("BadZipFile", "파일이 깨졌습니다. 확장자와 실제 형식이 다릅니다."),
    ("no such file", "파일을 열지 못했습니다."),
    ("UnsupportedFormat", "markitdown이 다루지 못하는 형식입니다(odt 등)."),
)


def describe_failure(error: Exception) -> str:
    # 예외 종류 이름도 함께 본다. 메시지에 단서가 없는 경우가 있다.
    message = f"{type(error).__name__}: {error}"
    for needle, reason in FAILURE_REASONS:
        if needle.lower() in message.lower():
            return reason
    return f"변환 중 오류: {type(error).__name__}"

HANCOM = "hancom"  # 한글 오피스로 HWPX를 거쳐 변환
PYTHON = "python"  # 파이썬만으로 변환


@dataclass
class ConversionReport:
    converted: int = 0
    skipped: int = 0
    failed: int = 0
    characters: int = 0
    by_extension: Counter = field(default_factory=Counter)
    by_backend: Counter = field(default_factory=Counter)
    # (파일 이름, 사유) — 나중에 목록에 그대로 실어 담당자가 확인한다
    skipped_files: list[tuple[str, str]] = field(default_factory=list)
    failures: list[tuple[str, str]] = field(default_factory=list)
    hancom_note: str | None = None

    @property
    def skip_reasons(self) -> Counter:
        return Counter(reason for _, reason in self.skipped_files)

    def to_dict(self) -> dict:
        return {
            "converted": self.converted,
            "skipped": [
                {"file": name, "reason": reason} for name, reason in self.skipped_files
            ],
            "failed": [
                {"file": name, "reason": reason} for name, reason in self.failures
            ],
            "by_extension": dict(self.by_extension),
            "by_backend": dict(self.by_backend),
        }

    def render(self) -> str:
        lines = [
            f"변환 {self.converted}건 / 건너뜀 {self.skipped}건 / 실패 {self.failed}건"
            f" / 글자 {self.characters:,}자",
            "",
            "확장자별 변환:",
        ]
        for extension, count in self.by_extension.most_common():
            lines.append(f"  {extension:6} {count}")
        if self.by_backend.get(HANCOM) or self.by_backend.get(PYTHON):
            lines.append("")
            lines.append("HWP 변환 방식:")
            for backend, count in self.by_backend.most_common():
                label = "한글 오피스(표 유지)" if backend == HANCOM else "파이썬(표 흩어짐)"
                lines.append(f"  {label} {count}건")
        if self.hancom_note:
            lines.append(f"  ※ {self.hancom_note}")
        if self.skip_reasons:
            lines.append("")
            lines.append("건너뛴 이유:")
            for reason, count in self.skip_reasons.most_common():
                lines.append(f"  {count:4}건  {reason}")
        if self.failures:
            lines.append("")
            lines.append(f"실패 {len(self.failures)}건 (앞의 10건):")
            for name, error in self.failures[:10]:
                lines.append(f"  {name}\n        {error}")
        return "\n".join(lines)


def build_markitdown() -> MarkItDown:
    """한글 오피스를 쓸 수 없을 때를 대비해 HWP 변환기를 등록해 둔 인스턴스."""
    converter = MarkItDown(enable_plugins=False)
    converter.register_converter(HwpConverter())
    return converter


def convert_one(markitdown: MarkItDown, source: Path) -> str:
    """파일 하나를 Markdown 문자열로 바꾼다.

    경로 대신 스트림을 넘긴다. markitdown의 경로 처리 경로는 .hwp를 만나면
    스스로 한글 COM을 부르면서 원본 폴더에 .hwpx를 만들어 버린다. HWP는
    이 모듈이 캐시 폴더에 따로 변환해 두므로 그 경로를 타지 않게 한다.
    """
    with open(long_path(source), "rb") as stream:
        result = markitdown.convert_stream(
            stream,
            stream_info=StreamInfo(
                extension=source.suffix.lower(),
                filename=source.name,
            ),
        )
    # 주민번호는 md 가 되기 전에 지운다. 여기가 일괄 변환과 업로드가 모두
    # 지나는 단일 관문이다.
    masked, count = privacy.mask_rrns(result.markdown or "")
    if count:
        print(f"[변환] {source.name}: 주민등록번호 {count}건 마스킹")
    return masked


def long_path(path: Path) -> str:
    """Windows의 260자 경로 제한을 우회한다.

    업무 문서는 이름이 길어 제한을 넘는 파일이 실제로 있다.
    """
    text = os.path.abspath(str(path))
    if sys.platform == "win32" and not text.startswith("\\\\?\\"):
        return "\\\\?\\" + text
    return text


def iter_files(root: Path):
    for current, directories, files in os.walk(root):
        directories[:] = [d for d in directories if d not in SKIP_DIRECTORIES]
        for name in sorted(files):
            yield Path(current) / name


def markdown_path(source: Path, root: Path, out_dir: Path) -> Path:
    """원본과 같은 폴더 구조를 유지한 .md 경로."""
    relative = source.relative_to(root)
    return out_dir / relative.parent / f"{relative.name}.md"


def convert_tree(
    root: Path,
    out_dir: Path,
    limit: int | None = None,
    extensions: set[str] | None = None,
    overwrite: bool = False,
    use_hancom: bool = True,
    hwpx_cache: Path | None = None,
    progress_every: int = 50,
) -> ConversionReport:
    report = ConversionReport()
    markitdown = build_markitdown()
    hwpx_cache = hwpx_cache or out_dir.parent / "hwpx_cache"

    session: HancomSession | None = None
    try:
        for source in iter_files(root):
            extension = source.suffix.lower()
            if extensions and extension not in extensions:
                continue
            if limit is not None and report.converted >= limit:
                break

            target = markdown_path(source, root, out_dir)
            if target.exists() and not overwrite:
                continue

            if extension in UNSUPPORTED:
                report.skipped += 1
                report.skipped_files.append((source.name, UNSUPPORTED[extension]))
                continue

            backend = None
            try:
                if extension == ".hwp":
                    if use_hancom and session is None:
                        try:
                            session = HancomSession(hwpx_cache).__enter__()
                        except HancomUnavailable as exc:
                            use_hancom = False
                            report.hancom_note = f"한글 오피스를 쓸 수 없어 파이썬으로 변환합니다: {exc}"

                    if use_hancom and session is not None:
                        try:
                            hwpx = session.to_hwpx(
                                source, session.target_path(source, root)
                            )
                            body = convert_one(markitdown, hwpx).strip()
                            backend = HANCOM
                        except Exception as exc:
                            # 한 문서가 안 열린다고 버리지 않는다. 파이썬으로 받는다.
                            report.failures.append(
                                (source.name, f"한글 변환 실패 → 파이썬 사용: {exc}")
                            )
                            body = convert_one(markitdown, source).strip()
                            backend = PYTHON
                    else:
                        body = convert_one(markitdown, source).strip()
                        backend = PYTHON
                else:
                    body = convert_one(markitdown, source).strip()
            except Exception as exc:  # 한 파일 때문에 전체가 멈추지 않게 한다
                report.failed += 1
                report.failures.append((source.name, describe_failure(exc)))
                continue

            if len(body) < MIN_CHARACTERS:
                report.skipped += 1
                report.skipped_files.append((source.name, empty_reason(extension)))
                continue

            target.parent.mkdir(parents=True, exist_ok=True)
            meta = metadata.parse(source, root)
            document = frontmatter.dump(
                {
                    "document_id": meta.document_id,
                    "title": meta.title,
                    "doc_number": meta.doc_number,
                    "kind": meta.kind,
                    "sender": meta.sender,
                    "direction": meta.direction,
                    "source_path": meta.relative_path,
                    "source_type": extension.lstrip("."),
                    "converted_by": backend or PYTHON,
                },
                body,
            )
            with open(long_path(target), "w", encoding="utf-8", errors="replace") as stream:
                stream.write(document)

            report.converted += 1
            report.characters += len(body)
            report.by_extension[extension] += 1
            if backend:
                report.by_backend[backend] += 1
            if progress_every and report.converted % progress_every == 0:
                print(f"  ... {report.converted}건 변환", flush=True)
    finally:
        if session is not None:
            session.close()

    return report
