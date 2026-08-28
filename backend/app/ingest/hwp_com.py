"""구버전 HWP를 한글 오피스로 HWPX로 바꾼다.

파이썬만으로 HWP를 읽으면 문단 글자만 남고 표가 흩어진다. 한글 오피스에
맡기면 표가 표로 남고, 그 HWPX를 markitdown이 Markdown 표로 바꿔 준다.
업무 문서에는 일정표·예산표가 많아 이 차이가 크다.

    (숭의여자고등학교-10129 (첨부)) 1. 운영기획서.hwp
        │  한글 오피스 COM (SaveAs HWPX)
        ▼
    backend/data/hwpx_cache/기안한문서/....hwpx
        │  markitdown
        ▼
    Markdown (표 포함)

필요한 것
    - Windows + 한글 오피스 설치
    - pywin32
    - 보안 모듈 등록: HKCU\\Software\\HNC\\HwpAutomation\\Modules 아래
      FilePathCheckerModule 값이 FilePathCheckerModule.dll을 가리켜야 한다.
      (markit_down_hwpx 저장소 루트에 이 DLL이 들어 있다.)
      등록되어 있지 않으면 문서를 열 때마다 보안 대화상자가 떠서 자동화가 멈춘다.

변환한 HWPX는 원본 폴더가 아니라 data/hwpx_cache/ 아래에 쌓는다. 업무 문서
폴더를 건드리지 않기 위해서다. 이미 만들어 둔 것은 다시 만들지 않는다.
"""

import hashlib
import shutil
import sys
from pathlib import Path

MAX_HANCOM_PATH = 240  # 한글은 긴 경로를 열지 못한다


class HancomUnavailable(Exception):
    """한글 오피스나 pywin32가 없어 COM 변환을 쓸 수 없다."""


class HancomSession:
    """한글 인스턴스 하나로 여러 문서를 변환한다.

    문서마다 한글을 새로 띄우면 파일당 8초쯤 걸린다. 한 번 띄워 두고
    열기·저장·닫기만 반복하면 훨씬 빠르다.
    """

    def __init__(self, cache_dir: Path) -> None:
        self.cache_dir = cache_dir
        self._hwp = None
        self._temp_dir = cache_dir / "_tmp"

    def __enter__(self) -> "HancomSession":
        if sys.platform != "win32":
            raise HancomUnavailable("Windows에서만 한글 COM을 쓸 수 있습니다.")
        try:
            import pythoncom
            import win32com.client as win32
        except ImportError as exc:
            raise HancomUnavailable(f"pywin32가 필요합니다: {exc}") from exc

        try:
            pythoncom.CoInitialize()
            self._hwp = win32.gencache.EnsureDispatch("HWPFrame.HwpObject")
        except Exception as exc:
            raise HancomUnavailable(f"한글 오피스를 띄우지 못했습니다: {exc}") from exc

        try:
            self._hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
        except Exception:
            # 등록에 실패해도 진행은 된다. 다만 보안 대화상자가 뜰 수 있다.
            pass
        return self

    def __exit__(self, *exc_info) -> None:
        self.close()

    def close(self) -> None:
        if self._hwp is None:
            return
        try:
            self._hwp.Quit()
        except Exception:
            pass
        self._hwp = None
        shutil.rmtree(self._temp_dir, ignore_errors=True)

    def target_path(self, source: Path, root: Path) -> Path:
        """원본 폴더 구조를 유지한 캐시 경로."""
        relative = source.relative_to(root)
        return self.cache_dir / relative.parent / f"{relative.stem}.hwpx"

    def _openable_path(self, source: Path) -> tuple[Path, bool]:
        """한글이 열 수 있는 경로. 너무 길면 짧은 임시 파일로 복사한다."""
        absolute = source.resolve()
        if len(str(absolute)) <= MAX_HANCOM_PATH:
            return absolute, False

        self._temp_dir.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha1(str(absolute).encode("utf-8")).hexdigest()[:12]
        short = self._temp_dir / f"{digest}.hwp"
        shutil.copy2(absolute, short)
        return short.resolve(), True

    def to_hwpx(self, source: Path, target: Path) -> Path:
        """HWP 하나를 HWPX로 저장한다. 이미 있으면 그대로 쓴다."""
        if target.exists() and target.stat().st_size > 0:
            return target

        if self._hwp is None:
            raise HancomUnavailable("세션이 열려 있지 않습니다.")

        target.parent.mkdir(parents=True, exist_ok=True)
        openable, is_copy = self._openable_path(source)
        try:
            # 한글은 상대 경로를 열지 못한다. 반드시 절대 경로로 넘긴다.
            if not self._hwp.Open(str(openable)):
                raise RuntimeError("한글이 문서를 열지 못했습니다.")
            if not self._hwp.SaveAs(str(target.resolve()), "HWPX"):
                raise RuntimeError("HWPX로 저장하지 못했습니다.")
        finally:
            try:
                self._hwp.Run("FileClose")
            except Exception:
                pass
            if is_copy:
                openable.unlink(missing_ok=True)

        if not target.exists() or target.stat().st_size == 0:
            raise RuntimeError("HWPX가 만들어지지 않았습니다.")
        return target
