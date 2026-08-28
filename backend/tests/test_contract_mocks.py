#!/usr/bin/env python3 -m pytest
"""docs/mock/*.json 이 실제 응답과 어긋나지 않아야 한다.

프론트가 이 파일들로 개발하므로 계약이 바뀌면 함께 갱신되어야 한다.
실패하면 backend에서 `python scripts/export_contract.py`를 다시 돌린다.
"""

import json

import pytest

from samples import SAMPLES
from tests.conftest import MOCK_DIR


@pytest.mark.parametrize("sample", SAMPLES, ids=lambda s: s["file"])
def test_mock_file_matches_live_response(client, sample: dict) -> None:
    path = MOCK_DIR / sample["file"]
    assert path.exists(), "scripts/export_contract.py를 먼저 실행하세요."

    response = client.request(sample["method"], sample["path"], json=sample.get("json"))
    assert response.status_code == sample.get("status", 200)
    assert json.loads(path.read_text(encoding="utf-8")) == response.json()
