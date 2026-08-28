"""업무 네비게이터 API.

개발 중 명세는 http://localhost:8000/docs 에서 확인한다.
실행: uvicorn app.main:app --reload  (backend 디렉터리에서)
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.v1 import documents, query, workflows
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


@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok"}


# 화면을 백엔드가 함께 내보낸다. 빌드 도구 없이 파일 그대로 쓰므로
# uvicorn 하나만 띄우면 http://localhost:8000 에서 바로 열린다.
# API 경로를 먼저 등록했으므로 /api/v1/* 은 이 정적 파일에 가려지지 않는다.
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
