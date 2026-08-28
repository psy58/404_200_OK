"""환경 설정.

값은 backend/.env 에서 읽는다. 예시는 .env.example 을 복사해 쓴다.
API 키는 코드나 저장소에 두지 않는다(.gitignore에 .env가 들어 있다).
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent

load_dotenv(BACKEND_DIR / ".env")

DATA_DIR = BACKEND_DIR / "data"
MARKDOWN_DIR = DATA_DIR / "markdown"
DOCUMENTS_PATH = DATA_DIR / "documents.json"


def env_flag(name: str, default: bool = False) -> bool:
    """환경변수의 명시적인 true 값만 켠다."""
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


# 실제 산출물이 없는 해커톤 컨테이너에서만 기존 추적 fixture를 읽는다.
# 기본값은 꺼짐이므로 일반 개발 실행과 테스트의 기존 동작은 바뀌지 않는다.
DEMO_SEED_ENABLED = env_flag("DEMO_SEED_ENABLED")
DEMO_SEED_DIR = Path(
    os.environ.get("DEMO_SEED_DIR") or ROOT_DIR / "public" / "mocks" / "backend"
)

# 업로드는 메모리에 올린 뒤 처리하므로 명시적인 상한이 필요하다.
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))


def _default_vector_dir() -> Path:
    """벡터 저장소 위치. 보통은 backend/data/vectors 다.

    다만 chromadb(1.x)는 Windows에서 경로에 한글이 있으면 색인 파일(hnsw)을
    쓰지 못한다. 기록은 sqlite에 남지만 색인이 없어, 다음에 열 때
    "Error loading hnsw index"로 읽지 못한다. 이 프로젝트는 폴더 이름을
    ASCII로 두어 이 문제를 피한다(02_hackathon). 프로젝트를 한글 경로 아래로
    옮기면 아래 대비책이 작동한다.

    위치를 직접 정하려면 .env에 VECTOR_DIR을 넣는다.
    """
    preferred = DATA_DIR / "vectors"
    if str(preferred).isascii():
        return preferred
    base = Path(os.environ.get("LOCALAPPDATA") or Path.home())
    return base / "work-navigator" / "vectors"


VECTOR_DIR = Path(os.environ.get("VECTOR_DIR") or _default_vector_dir())
VECTOR_DIR_IS_OUTSIDE_PROJECT = not str(VECTOR_DIR).startswith(str(DATA_DIR))
SOURCE_DIR = ROOT_DIR / "업무목록"

SUMMARIES_PATH = DATA_DIR / "summaries.json"

# 인덱스가 둘이고 쓰는 모델이 다르다.
#
#   Summary Index  문서 한 건당 요약 하나. 개수가 적고 "이 문서가 무슨 업무인가"를
#                  가려내는 자리라 품질이 중요하다 → text-embedding-3-large
#   Chunk Index    조각 7천 개. 개수가 많고 이미 좁혀진 문서 안에서 근거를 찾는
#                  자리라 비용이 중요하다 → text-embedding-3-small
SUMMARY_EMBEDDING_MODEL = os.environ.get(
    "SUMMARY_EMBEDDING_MODEL", "text-embedding-3-large"
)
CHUNK_EMBEDDING_MODEL = os.environ.get(
    "CHUNK_EMBEDDING_MODEL", "text-embedding-3-small"
)

# 문서 요약을 만드는 모델
SUMMARY_MODEL = os.environ.get("SUMMARY_MODEL", "gpt-4.1")

# 사용자에게 보여 줄 답변 문장을 만드는 모델.
# 질문마다 부르므로 요약 모델보다 가벼운 것을 쓴다.
ANSWER_MODEL = os.environ.get("ANSWER_MODEL", "gpt-4.1-mini")


def openai_api_key() -> str | None:
    return os.environ.get("OPENAI_API_KEY") or None


def require_openai_api_key() -> str:
    key = openai_api_key()
    if not key:
        raise SystemExit(
            "OPENAI_API_KEY가 없습니다.\n"
            f"  {BACKEND_DIR / '.env.example'} 를 {BACKEND_DIR / '.env'} 로 복사하고\n"
            "  OPENAI_API_KEY 값을 채운 뒤 다시 실행하세요."
        )
    return key
