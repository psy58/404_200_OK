#!/usr/bin/env python3 -m pytest
"""화면 파일이 백엔드에서 함께 나가는지.

빌드 도구 없이 파일을 그대로 내보내므로, 잘못 붙으면 API 경로가 가려진다.
"""

import re
from pathlib import Path

from app.main import FRONTEND_DIR

INDEX = FRONTEND_DIR / "index.html"
SCRIPT = FRONTEND_DIR / "app.js"


def test_frontend_files_exist() -> None:
    assert INDEX.exists() and SCRIPT.exists()
    assert (FRONTEND_DIR / "style.css").exists()


def test_page_is_served_at_the_root(client) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "업무 네비게이터" in response.text


def test_static_mount_does_not_hide_the_api(client) -> None:
    """/ 에 화면을 붙여도 /api/v1/* 이 먼저 잡혀야 한다."""
    assert client.post("/api/v1/query", json={"query": "테스트"}).status_code == 200
    assert client.get("/api/v1/workflows").status_code == 200
    assert client.get("/health").status_code == 200


def test_script_only_calls_paths_in_the_contract() -> None:
    """화면이 계약에 없는 경로를 부르면 여기서 걸린다."""
    script = SCRIPT.read_text(encoding="utf-8")
    called = set(re.findall(r'call\(\s*[`"](/[a-z]+)', script))
    assert called <= {"/query", "/workflows", "/documents"}


def test_every_element_the_script_needs_exists_in_the_page() -> None:
    html_ids = set(re.findall(r'id="([^"]+)"', INDEX.read_text(encoding="utf-8")))
    script_ids = set(re.findall(r'el\("([^"]+)"\)', SCRIPT.read_text(encoding="utf-8")))
    assert script_ids <= html_ids
