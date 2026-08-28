"""구버전 HWP(바이너리) 문서에서 본문 텍스트를 뽑는다.

markitdown은 HWPX(ZIP+XML)만 다루고 구버전 HWP는 지원하지 않는다.
업무 문서의 5분의 1이 구버전 HWP라 그냥 버릴 수 없어 직접 읽는다.

HWP 5.0 파일은 OLE 복합 문서이고, 본문은 BodyText/Section* 스트림에
레코드 열로 들어 있다. 레코드 헤더 4바이트에서 태그와 크기를 읽고,
문단 텍스트 태그(HWPTAG_PARA_TEXT)의 내용만 모은다.
서식, 표 구조, 그림은 버리고 글자만 남긴다.
"""

import struct
import zlib
from pathlib import Path
from typing import BinaryIO

import olefile

HWPTAG_PARA_TEXT = 67

# 확장 제어 문자. 뒤에 15개의 UTF-16 단위가 따라오므로 통째로 건너뛴다.
_EXTENDED_CONTROLS = {1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23}
_LINE_BREAKS = {10, 13}


class NotAHwpFile(Exception):
    pass


def _body_sections(source) -> list[bytes]:
    """BodyText 스트림을 압축이 풀린 상태로 모은다.

    source는 파일 경로나 열린 스트림 둘 다 받는다. markitdown은 스트림을
    넘기고, 직접 부를 때는 경로가 편하다.
    """
    try:
        ole = olefile.OleFileIO(source)
    except Exception as exc:  # olefile은 형식이 아니면 여러 예외를 낸다
        raise NotAHwpFile(f"OLE 복합 문서가 아닙니다: {exc}") from exc

    try:
        if not ole.exists("FileHeader"):
            raise NotAHwpFile("FileHeader 스트림이 없습니다. HWP 5.0 문서가 아닙니다.")

        header = ole.openstream("FileHeader").read()
        if len(header) < 37:
            raise NotAHwpFile("FileHeader가 너무 짧습니다.")
        compressed = bool(header[36] & 0x01)

        sections = []
        for entry in sorted(ole.listdir()):
            if entry[0] != "BodyText":
                continue
            data = ole.openstream(entry).read()
            if compressed:
                data = zlib.decompress(data, -15)  # raw deflate
            sections.append(data)
        return sections
    finally:
        ole.close()


def _records(data: bytes):
    """레코드 열을 (태그, 내용)으로 끊어 낸다."""
    position = 0
    while position + 4 <= len(data):
        (header,) = struct.unpack_from("<I", data, position)
        tag = header & 0x3FF
        size = (header >> 20) & 0xFFF
        position += 4
        if size == 0xFFF:  # 크기가 12비트를 넘으면 다음 4바이트에 실제 크기가 있다
            (size,) = struct.unpack_from("<I", data, position)
            position += 4
        yield tag, data[position : position + size]
        position += size


def _decode_paragraph(payload: bytes) -> str:
    """UTF-16LE 글자 열에서 제어 문자를 걸러 낸다.

    남길 글자는 2바이트 단위 그대로 모아 두었다가 한 번에 디코딩한다.
    한 단위씩 chr()로 바꾸면 BMP 밖 글자의 서로게이트 쌍이 깨져서
    나중에 UTF-8로 저장할 때 터진다.
    """
    kept = bytearray()
    index = 0
    while index + 1 < len(payload):
        code = payload[index] | (payload[index + 1] << 8)
        if code in _EXTENDED_CONTROLS:
            index += 16  # 제어 문자 1개 + 따라오는 7개 단위
            continue
        if code in _LINE_BREAKS:
            kept += "\n".encode("utf-16-le")
        elif code >= 32:
            kept += payload[index : index + 2]
        index += 2
    return bytes(kept).decode("utf-16-le", errors="replace")


def extract_text(path: Path) -> str:
    """HWP 파일 하나의 본문 텍스트. 문단은 빈 줄로 구분한다."""
    return _extract(str(path))


def extract_text_from_stream(stream: BinaryIO) -> str:
    """열린 스트림에서 본문 텍스트를 뽑는다. markitdown 변환기가 쓴다."""
    return _extract(stream)


def _extract(source) -> str:
    paragraphs: list[str] = []
    for section in _body_sections(source):
        for tag, payload in _records(section):
            if tag != HWPTAG_PARA_TEXT:
                continue
            text = _decode_paragraph(payload).strip()
            if text:
                paragraphs.append(text)
    return "\n\n".join(paragraphs)
