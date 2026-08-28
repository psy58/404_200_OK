import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(BACKEND_DIR / "scripts"))

from app.main import app  # noqa: E402
from app.services import query_service, state_store, workflow_service  # noqa: E402

MOCK_DIR = ROOT_DIR / "docs" / "mock"


@pytest.fixture(autouse=True)
def fresh_state():
    """테스트끼리 간섭하지 않게 한다.

    /query 는 고정 응답 엔진으로 고정한다. 실제 엔진은 OpenAI를 부르고 답이
    매번 달라지므로, 계약을 보는 테스트에 쓸 수 없다.
    """
    # 계약을 보는 테스트는 예시 업무 두 건으로 고정한다. 문서에서 만들어 낸
    # 업무는 문서가 늘면 바뀌므로 계약 검사에 쓸 수 없다.
    workflow_service.reset(use_generated=False)
    query_service.set_engine(query_service.SampleQueryEngine())
    yield
    workflow_service.reset(use_generated=False)
    query_service.set_engine(None)


@pytest.fixture(autouse=True)
def isolated_user_state(tmp_path):
    """담당자 상태(체크·노트·읽음·업로드)를 테스트마다 빈 임시 파일로.

    없으면 테스트가 실제 data/user_state.json 을 오염시킨다.
    """
    state_store.reset(tmp_path / "user_state.json")
    yield
    state_store.reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
