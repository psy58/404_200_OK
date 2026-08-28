"""에러 응답을 한 가지 형태로 통일한다.

    {"error": {"code": "workflow_not_found", "message": "..."}}

FastAPI 기본 형식({"detail": ...})을 그대로 내보내면 프론트가 상태 코드마다
다른 본문을 파싱해야 한다. 검증 실패(422)까지 같은 형태로 감싼다.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .models.common import ErrorDetail, ErrorResponse


class ApiError(Exception):
    """업무 관점에서 이름 붙인 에러.

    code는 프론트가 분기에 쓰는 값이므로 함부로 바꾸지 않는다.
    """

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def not_found(code: str, message: str) -> ApiError:
    return ApiError(404, code, message)


def _error_response(status_code: int, code: str, message: str, details=None) -> JSONResponse:
    payload = ErrorResponse(
        error=ErrorDetail(code=code, message=message, details=details)
    )
    return JSONResponse(status_code=status_code, content=payload.model_dump(mode="json"))


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(_: Request, exc: ApiError) -> JSONResponse:
        return _error_response(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return _error_response(
            422,
            "validation_error",
            "요청 형식이 올바르지 않습니다.",
            details=[
                {"field": ".".join(str(part) for part in error["loc"]), "reason": error["msg"]}
                for error in exc.errors()
            ],
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "not_found" if exc.status_code == 404 else "http_error"
        return _error_response(exc.status_code, code, str(exc.detail))
