"""업무 네비게이터를 창 하나로 띄운다.

    python desktop.py

브라우저 주소창 없이 프로그램처럼 쓰기 위한 것이다. 안에서 도는 것은 웹으로
띄울 때와 같다. 서버(FastAPI)를 이 프로세스 안에서 조용히 올리고, 그 화면을
창에 담는다.

    ┌ 창 (pywebview → Windows WebView2) ┐
    │  frontend/index.html              │
    └──────────────┬────────────────────┘
                   │ http://127.0.0.1:<빈 포트>
    ┌──────────────▼────────────────────┐
    │  FastAPI (같은 프로세스의 백그라운드 스레드)  │
    └───────────────────────────────────┘

포트는 비어 있는 것을 골라 쓰므로, 이미 8000번으로 서버를 띄워 두었어도
부딪히지 않는다. 창을 닫으면 서버도 함께 내려간다.
"""

import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

WINDOW_TITLE = "업무 네비게이터"
WINDOW_SIZE = (1180, 860)
MIN_WINDOW_SIZE = (900, 640)
STARTUP_TIMEOUT_SECONDS = 30


def find_free_port() -> int:
    """빈 포트를 하나 얻는다. 다른 프로그램과 부딪히지 않게 한다."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class BackgroundServer:
    """창이 살아 있는 동안만 도는 서버."""

    def __init__(self, port: int) -> None:
        self.port = port
        self._server = None
        self._thread: threading.Thread | None = None

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start(self) -> None:
        import uvicorn

        from app.main import app

        config = uvicorn.Config(app, host="127.0.0.1", port=self.port, log_level="warning")
        self._server = uvicorn.Server(config)
        self._thread = threading.Thread(target=self._server.run, daemon=True)
        self._thread.start()

    def wait_until_ready(self, timeout: float = STARTUP_TIMEOUT_SECONDS) -> bool:
        """서버가 응답할 때까지 기다린다.

        문서 저장소와 벡터 저장소를 여는 데 몇 초가 걸린다. 준비되기 전에
        창을 열면 빈 화면이 잠깐 보인다.
        """
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(self.url + "/health", timeout=1) as response:
                    if response.status == 200:
                        return True
            except (urllib.error.URLError, OSError):
                time.sleep(0.2)
        return False

    def stop(self) -> None:
        if self._server is not None:
            self._server.should_exit = True
        if self._thread is not None:
            self._thread.join(timeout=5)


def main() -> None:
    import webview

    server = BackgroundServer(find_free_port())
    server.start()
    if not server.wait_until_ready():
        raise SystemExit(
            "서버가 시작되지 않았습니다.\n"
            "backend 폴더에서 다음을 실행해 무엇이 잘못됐는지 확인하세요.\n"
            "  .venv/Scripts/python.exe -m uvicorn app.main:app"
        )

    window = webview.create_window(
        WINDOW_TITLE,
        server.url,
        width=WINDOW_SIZE[0],
        height=WINDOW_SIZE[1],
        min_size=MIN_WINDOW_SIZE,
    )
    window.events.closed += server.stop

    try:
        webview.start()  # 창을 닫을 때까지 여기서 머문다
    finally:
        server.stop()


if __name__ == "__main__":
    main()
