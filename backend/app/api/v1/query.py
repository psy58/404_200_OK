"""POST /api/v1/query"""

from fastapi import APIRouter

from ...models.common import ErrorResponse
from ...models.query import QueryRequest, QueryResponse
from ...services.query_service import answer_query

router = APIRouter()


@router.post(
    "/query",
    response_model=QueryResponse,
    summary="업무에 대해 묻고 다음 할 일과 근거 문서를 받는다",
    responses={422: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def post_query(request: QueryRequest) -> QueryResponse:
    return answer_query(request)
