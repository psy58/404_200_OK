"""구버전 HWP를 markitdown에 붙이는 변환기.

markitdown은 HWPX만 다루고 구버전 HWP(OLE 바이너리)는 모른다. 업무 문서의
5분의 1이 구버전 HWP라 버릴 수 없는데, 그렇다고 변환 경로를 따로 두면
"모든 문서는 markitdown으로 Markdown이 된다"는 규칙이 깨진다.

그래서 별도 경로를 만드는 대신 markitdown에 변환기 하나를 등록한다.
바깥에서 보면 hwp도 다른 형식과 똑같이 MarkItDown().convert()로 처리된다.
"""

import io
from typing import Any, BinaryIO

from markitdown import DocumentConverter, DocumentConverterResult, StreamInfo

from . import hwp

ACCEPTED_FILE_EXTENSIONS = [".hwp"]
ACCEPTED_MIME_TYPE_PREFIXES = [
    "application/x-hwp",
    "application/haansofthwp",
]


class HwpConverter(DocumentConverter):
    """HWP 5.0 문서를 Markdown으로 바꾼다.

    서식 정보는 버리고 문단만 남기므로 결과는 문단이 줄바꿈으로 이어진
    평범한 텍스트다. 표는 셀 내용이 문단으로 흩어진다.
    """

    def accepts(
        self, file_stream: BinaryIO, stream_info: StreamInfo, **kwargs: Any
    ) -> bool:
        extension = (stream_info.extension or "").lower()
        if extension in ACCEPTED_FILE_EXTENSIONS:
            return True

        mimetype = (stream_info.mimetype or "").lower()
        return any(mimetype.startswith(prefix) for prefix in ACCEPTED_MIME_TYPE_PREFIXES)

    def convert(
        self, file_stream: BinaryIO, stream_info: StreamInfo, **kwargs: Any
    ) -> DocumentConverterResult:
        text = hwp.extract_text_from_stream(io.BytesIO(file_stream.read()))
        title = next((line.strip() for line in text.splitlines() if line.strip()), None)
        return DocumentConverterResult(markdown=text.strip(), title=title)
