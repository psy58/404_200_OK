"""프론트에 넘기는 Mock 응답 목록.

여기 한 곳만 고치면 docs/mock/*.json 생성과 계약 회귀 테스트가 함께 따라온다.
"""

SAMPLES: list[dict] = [
    {
        "file": "query.response.json",
        "method": "POST",
        "path": "/api/v1/query",
        "json": {"query": "과학대회 참가하려면 뭐부터 해야 하나요?"},
    },
    {
        "file": "workflows.list.json",
        "method": "GET",
        "path": "/api/v1/workflows",
    },
    {
        "file": "workflow.detail.json",
        "method": "GET",
        "path": "/api/v1/workflows/science_competition",
    },
    {
        "file": "feedback.response.json",
        "method": "POST",
        "path": "/api/v1/workflows/science_competition/feedback",
        "json": {
            "type": "missing_step",
            "after_step_id": "2",
            "suggested_step_name": "개인정보 동의",
            "description": "학생들에게 개인정보 동의서를 먼저 받았습니다.",
        },
    },
    {
        "file": "document.json",
        "method": "GET",
        "path": "/api/v1/documents/doc_2026_competition_guide",
    },
    {
        "file": "chunk.json",
        "method": "GET",
        "path": "/api/v1/documents/doc_2026_competition_guide/chunks/chunk_0142",
    },
    {
        "file": "error.not_found.json",
        "method": "GET",
        "path": "/api/v1/workflows/no_such_workflow",
        "status": 404,
    },
]
