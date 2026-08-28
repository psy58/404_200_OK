"""업무 네비게이터 API.

개발 중 명세는 http://localhost:8000/docs 에서 확인한다.
실행: uvicorn app.main:app --reload  (backend 디렉터리에서)
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api import frontend as frontend_api
from .api.v1 import documents, query, statutes, workflows
from .errors import register_error_handlers

FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"

app = FastAPI(
    title="업무 네비게이터 API",
    version="0.2.0",
    description=(
        "학교 업무 담당자의 질문에 다음 할 일과 근거 문서를 돌려주는 API. "
        "지금은 모든 엔드포인트가 예시 데이터로 동작한다."
    ),
)

# 프론트 개발 서버에서 바로 호출할 수 있게 열어 둔다. 배포 시 좁힌다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)

app.include_router(query.router, prefix="/api/v1", tags=["query"])
app.include_router(workflows.router, prefix="/api/v1", tags=["workflows"])
app.include_router(documents.router, prefix="/api/v1", tags=["documents"])
app.include_router(statutes.router, prefix="/api/v1", tags=["statutes"])

# React 프론트엔드가 쓰는 화면 형태 그대로의 응답. 정적 mock 경로의 별칭도
# 함께 등록해 두어, 프론트는 fetch 경로를 바꾸지 않아도 실데이터를 받는다.
# (명시적 라우트가 아래 정적 마운트보다 먼저 잡힌다.)
app.include_router(frontend_api.router, prefix="/api/frontend", tags=["frontend"])
app.include_router(frontend_api.alias, prefix="/mocks/backend", tags=["frontend"])


@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok"}


# 화면을 백엔드가 함께 내보낸다. 빌드 도구 없이 파일 그대로 쓰므로
# uvicorn 하나만 띄우면 http://localhost:8000 에서 바로 열린다.
# API 경로를 먼저 등록했으므로 /api/v1/* 은 이 정적 파일에 가려지지 않는다.
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
