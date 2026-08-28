"""계약 산출물을 docs/ 아래에 다시 만든다.

    python scripts/export_contract.py        (backend 디렉터리에서 실행)

만들어지는 파일
    docs/mock/*.json    프론트가 Mock으로 쓰는 응답들
    docs/openapi.json   OpenAPI 명세 (TS 타입 생성 등에 사용)

계약을 바꾸면 이 스크립트를 다시 돌린다. 돌리지 않으면 테스트가 실패한다.
"""

import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(BACKEND_DIR / "scripts"))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services import query_service, workflow_service  # noqa: E402
from samples import SAMPLES  # noqa: E402

DOCS_DIR = ROOT_DIR / "docs"
MOCK_DIR = DOCS_DIR / "mock"
OPENAPI_PATH = DOCS_DIR / "openapi.json"


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def call(client: TestClient, sample: dict):
    return client.request(sample["method"], sample["path"], json=sample.get("json"))


def main() -> None:
    workflow_service.reset(use_generated=False)  # 예시 데이터로 뽑는다
    # Mock은 계약 형태를 보여 주는 것이므로 고정 응답으로 뽑는다.
    query_service.set_engine(query_service.SampleQueryEngine())
    client = TestClient(app)

    for sample in SAMPLES:
        response = call(client, sample)
        expected_status = sample.get("status", 200)
        if response.status_code != expected_status:
            raise SystemExit(
                f"{sample['path']} 이 {expected_status}가 아니라 "
                f"{response.status_code}를 돌려주었습니다."
            )
        write_json(MOCK_DIR / sample["file"], response.json())
        print(f"wrote docs/mock/{sample['file']}")

    write_json(OPENAPI_PATH, app.openapi())
    print("wrote docs/openapi.json")


if __name__ == "__main__":
    main()
