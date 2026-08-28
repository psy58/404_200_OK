# API 계약

버전: v0.3 (2026-08-28)
확정 범위: 아래 7개 엔드포인트 전부.

v0.3에서 `/query` 응답의 `data`에 **`timeline`**이 늘었다. 기존 필드는 그대로다.

| 메서드 | 경로 | 용도 |
|---|---|---|
| POST | `/api/v1/query` | 업무에 대해 묻고 다음 할 일과 근거 문서를 받는다 |
| GET | `/api/v1/workflows` | 등록된 업무 목록 |
| GET | `/api/v1/workflows/{workflow_id}` | 업무 흐름 조회 (시각화용) |
| POST | `/api/v1/workflows/{workflow_id}/steps/{step_id}/complete` | 단계 완료 처리 |
| POST | `/api/v1/workflows/{workflow_id}/feedback` | 실제 업무가 등록된 흐름과 다를 때 알린다 |
| GET | `/api/v1/documents/{document_id}` | 문서 정보 조회 |
| GET | `/api/v1/documents/{document_id}/chunks/{chunk_id}` | 문서 조각 조회 (원문 보기) |

살아 있는 명세: http://localhost:8000/docs
기계가 읽는 명세: [openapi.json](openapi.json)
프론트 Mock: [mock/](mock/)

## 공통 규약

- 모든 경로는 `/api/v1` 아래에 둔다.
- JSON 키는 **snake_case**로 통일한다.
- 인코딩은 UTF-8이며 응답 본문에서 한글을 이스케이프하지 않는다.
- 날짜·시각은 ISO 8601을 쓴다. 시각은 UTC(`2026-08-25T09:00:00Z`), 날짜는 `2026-01-15`.
- 값이 없으면 필드를 빼지 않고 `null` 또는 빈 배열을 보낸다. 프론트가 키 존재 여부를 확인할 필요가 없게 한다.
- 에러는 상태 코드와 무관하게 한 가지 형태다.

```json
{
  "error": {
    "code": "workflow_not_found",
    "message": "업무 no_such_workflow 를 찾을 수 없습니다.",
    "details": null
  }
}
```

| code | 상태 | 상황 |
|---|---|---|
| `validation_error` | 422 | 요청 형식이 틀림. `details`에 필드별 사유가 담긴다 |
| `workflow_not_found` | 404 | 없는 `workflow_id` |
| `step_not_found` | 404 | 없는 `step_id` |
| `document_not_found` | 404 | 없는 `document_id` |
| `chunk_not_found` | 404 | 없는 `chunk_id` |
| `internal_error` | 500 | LLM·벡터 저장소 호출 실패 |

프론트는 `error.code`로 분기하고, 사용자에게는 `error.message`를 보여준다.

---

## POST /api/v1/query

사용자가 업무에 대해 묻고, **다음에 할 일**과 **근거 문서**를 받는다.

### Request

```json
{
  "query": "과학대회 참가하려면 뭐부터 해야 하나요?",
  "workflow_id": null,
  "session_id": "sess_8f2c"
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `query` | string (1~1000자) | O | 자연어 질문 |
| `workflow_id` | string \| null | X | 사용자가 이미 특정 업무 화면에 있을 때 그 업무. 비우면 백엔드가 질문에서 추정한다 |
| `session_id` | string \| null | X | 이어지는 질문을 묶는 식별자. 첫 질문에서는 비운다 |

검색 개수(top_k), 리랭커 사용 여부 같은 값은 요청에 넣지 않는다. 내부 구현이지 업무가 아니다.

### Response 200

전체 예시는 [mock/query.response.json](mock/query.response.json).

```json
{
  "query_id": "qry_01HZX3K9",
  "message": "학생 선발이 완료되었으므로 다음 단계는 참가 신청입니다. ...",
  "data": {
    "workflow": { "workflow_id": "science_competition", "name": "과학대회 참가" },
    "current_stage": { "step_id": "2", "name": "학생 선발" },
    "next_stage": { "step_id": "3", "name": "참가 신청" },
    "next_actions": [
      { "step_id": "3", "title": "참가 신청서 제출", "description": "학생 명단을 첨부해..." },
      { "step_id": null, "title": "보호자 동의서 수합", "description": "개인정보 제공 동의서를..." }
    ],
    "documents": [
      {
        "document_id": "doc_2026_competition_guide",
        "chunk_id": "chunk_0142",
        "title": "2026 학생 교외대회 참가 지침",
        "page": 12,
        "snippet": "교외대회 참가 신청은 대회 개최일 30일 전까지...",
        "relevance": 0.87
      }
    ],
    "timeline": [
      {
        "document_id": "doc_school_2025_10129",
        "title": "2025학년도 토요과학교실(3차) 운영 계획",
        "date": "2025-08-14",
        "kind": "계획",
        "direction": "drafted",
        "doc_number": "숭의여자고등학교-10129"
      }
    ]
  }
}
```

최상위는 세 개뿐이다.

| 필드 | 설명 |
|---|---|
| `query_id` | 이 응답의 식별자. 로그 추적과 피드백 연결에 쓴다 |
| `message` | **LLM이 만든 자연어 설명.** 화면에 그대로 보여준다 |
| `data` | **애플리케이션 로직이 채우는 구조화 정보.** LLM이 자유롭게 만들지 않는다 |

`data`의 필드:

| 필드 | 타입 | 설명 |
|---|---|---|
| `workflow` | object \| null | 질문이 해당하는 업무. 단계 전체가 필요하면 `GET /workflows/{id}`를 따로 호출한다 |
| `current_stage` | object \| null | `{step_id, name}` |
| `next_stage` | object \| null | `{step_id, name}` |
| `next_actions` | array | `{step_id, title, description}`. `step_id`가 있으면 완료 처리 API를 호출할 수 있다 |
| `documents` | array | 근거 문서 조각. **relevance 내림차순 정렬** 보장 |
| `timeline` | array | 이 질문과 관련된 문서를 **시간순**으로 늘어놓은 것 |

`timeline`은 "이 업무가 어떻게 진행됐나"에 답하기 위한 것이다. 검색으로 찾은 문서에서
출발해 공문의 관련 참조와 내용 유사도로 이어진 문서를 모아 날짜순으로 정렬한다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `date` | string \| null | 결재일 > 시행일 > 접수일 순으로 있는 것. 날짜를 모르는 문서는 **뒤에** 온다 |
| `kind` | string | `계획` / `지침` / `안내·공모` / `결과보고` / `지출·정산` / `회의` |
| `direction` | string \| null | `drafted`(우리가 기안) / `received`(받은 공문) |

빈 서식과 명단은 흐름에 넣지 않는다. 사업이 어떻게 진행됐는지 말해 주지 않기 때문이다.
관련 문서가 하나뿐이면 빈 배열이다.

`documents[]`의 `document_id`·`chunk_id`는 그대로 문서 조회 API 경로에 넣어 쓴다.
`page`, `chunk_id`, `snippet`은 문서 종류에 따라 null일 수 있으므로 프론트는 없을 때를 그려야 한다.

### 프론트가 반드시 처리해야 하는 경우

1. **업무를 못 찾음** — `workflow`, `current_stage`, `next_stage`가 모두 null이고 `next_actions`가 빈 배열. `documents`만 있을 수 있다. 이때도 200이며 `message`에 안내 문장이 담긴다.
2. **근거 문서 없음** — `documents`가 빈 배열.
3. **마지막 단계** — `next_stage`가 null이고 `current_stage`만 있다.

없음을 404나 빈 응답으로 알리지 않는다. 질문이 처리된 이상 200이다.

---

## GET /api/v1/workflows

등록된 업무 목록. 단계 배열은 담지 않는다. 전체는 [mock/workflows.list.json](mock/workflows.list.json).

```json
{
  "workflows": [
    {
      "workflow_id": "science_competition",
      "name": "과학대회 참가",
      "description": "교외 과학대회에 학생을 참가시키는 업무",
      "step_count": 5,
      "completed_step_count": 2,
      "current_step": "참가 신청"
    }
  ],
  "total": 2
}
```

`current_step`은 진행 중인 단계의 **이름**이다. 시작 전이거나 모두 끝났으면 null이다.
목록 화면의 진행률은 `completed_step_count / step_count`로 그린다.

---

## GET /api/v1/workflows/{workflow_id}

업무 흐름 시각화에 필요한 전부. 전체는 [mock/workflow.detail.json](mock/workflow.detail.json).

```json
{
  "workflow_id": "science_competition",
  "name": "과학대회 참가",
  "description": "교외 과학대회에 학생을 참가시키는 업무",
  "steps": [
    { "step_id": "1", "name": "학생 모집", "status": "completed",
      "description": null, "completed_at": "2026-08-25T09:00:00Z", "document_ids": [] },
    { "step_id": "3", "name": "참가 신청", "status": "current",
      "description": "학생 명단을 첨부해 참가 신청서를 제출한다.",
      "completed_at": null, "document_ids": ["doc_2026_competition_guide"] }
  ],
  "updated_at": "2026-08-25T09:00:00Z"
}
```

`status`는 `completed` / `current` / `pending` 셋 중 하나다.

계약으로 보장하는 것:

- `steps`는 **업무 진행 순서대로** 정렬되어 온다. 프론트가 다시 정렬하지 않는다.
- `current`인 단계는 **최대 하나**다. 모든 단계가 끝나면 하나도 없다.
- `completed_at`은 `status`가 `completed`일 때만 값이 있다.

`document_ids`는 그 단계에서 참고하거나 작성하는 문서다. 문서 API로 제목을 가져와 링크로 건다.

---

## POST /api/v1/workflows/{workflow_id}/steps/{step_id}/complete

```json
{ "completed": true, "note": "명단 확정 후 제출함" }
```

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `completed` | boolean | `true` | `false`로 보내면 완료를 되돌린다 |
| `note` | string \| null (~500자) | `null` | 담당자 메모. 업무 Trace에 함께 기록된다 |

응답은 **갱신된 업무 흐름 전체**(`GET /workflows/{id}`와 같은 형태)다.
프론트는 응답으로 화면을 다시 그리면 되고, 완료 후 따로 조회하지 않아도 된다.

- **멱등하다.** 이미 완료된 단계를 다시 완료해도 200이다. 중복 클릭이나 재전송을 걱정하지 않아도 된다.
- 완료 처리하면 그다음 미완료 단계가 자동으로 `current`가 된다.

---

## POST /api/v1/workflows/{workflow_id}/feedback

실제로 한 일이 등록된 흐름과 달랐을 때 담당자가 알린다.

```json
{
  "type": "missing_step",
  "after_step_id": "2",
  "suggested_step_name": "개인정보 동의",
  "description": "학생들에게 개인정보 동의서를 먼저 받았습니다.",
  "query_id": null
}
```

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `type` | enum | O | `missing_step` / `unnecessary_step` / `wrong_order` / `wrong_document` / `other` |
| `after_step_id` | string \| null | X | 기준 단계. 이 단계 **다음**에 차이가 있다는 뜻. null이면 맨 앞 |
| `suggested_step_name` | string \| null (~100자) | X | `missing_step`일 때 실제로 했던 일의 이름 |
| `description` | string (1~1000자) | O | 담당자가 직접 쓴 설명 |
| `query_id` | string \| null | X | 이 피드백을 유발한 `/query` 응답이 있으면 그 식별자 |

응답 ([mock/feedback.response.json](mock/feedback.response.json)):

```json
{
  "feedback_id": "fb_0001",
  "workflow_id": "science_competition",
  "type": "missing_step",
  "diff": {
    "expected": ["학생 선발", "참가 신청"],
    "reported": ["학생 선발", "개인정보 동의", "참가 신청"]
  },
  "message": "의견이 접수되었습니다. 워크플로 개선 검토에 반영됩니다."
}
```

`diff`의 두 배열을 나란히 놓으면 설계 문서 9항의 **예상 / 실제** 비교 화면이 그대로 나온다.
차이가 난 부분 주변만 담기므로 전체 흐름을 다시 그릴 필요는 없다.

---

## GET /api/v1/documents/{document_id}

```json
{
  "document_id": "doc_2026_competition_guide",
  "title": "2026 학생 교외대회 참가 지침",
  "source_type": "hwpx",
  "doc_number": "서울특별시교육청-2026-1043",
  "issued_on": "2026-01-15",
  "page_count": 24,
  "chunk_count": 3,
  "original_url": "/api/v1/documents/doc_2026_competition_guide/original",
  "content": null
}
```

- `source_type`: `hwpx` / `hwp` / `pdf` / `xlsx` / `other`. 아이콘 선택에 쓴다.
- `doc_number`: 공문서 번호(예: `숭의여자고등학교-10129`). 학교 문서가 아니면 null.
- `content`: 기본은 null이다. 본문 전체가 필요하면 `?include_content=true`로 요청한다. 큰 문서를 매번 실어 보내지 않기 위한 것이다.
- `original_url`: 원본 파일 경로. **아직 구현되지 않았다** (미확정 항목 참고).

## GET /api/v1/documents/{document_id}/chunks/{chunk_id}

`/query` 응답의 근거 조각을 원문으로 펼쳐 보여줄 때 쓴다.

```json
{
  "document_id": "doc_2026_competition_guide",
  "chunk_id": "chunk_0142",
  "title": "2026 학생 교외대회 참가 지침",
  "page": 12,
  "content": "참가 신청은 대회 개최일 30일 전까지 학교장 결재를 거쳐 제출한다. ...",
  "prev_chunk_id": "chunk_0141",
  "next_chunk_id": "chunk_0143"
}
```

`prev_chunk_id` / `next_chunk_id`로 앞뒤 문단 이동 버튼을 만든다. 끝이면 null이다.

---

## 이번에 내린 결정

설계 문서에서 서로 어긋나거나 비어 있던 부분을 다음과 같이 정리했다.

### /query (v0.1에서 결정)

1. **응답 구조는 `data` + `message` 분리를 따른다** (문서 13항). 12항의 평평한 `QueryResponse`는 쓰지 않는다. 13항이 협업 원칙(20항)에도 들어 있는 방침이라 그쪽을 계약으로 삼았다.
2. **키는 snake_case로 통일한다.** 16항 Mock 예시가 camelCase(`currentStage`)였는데 12항 Pydantic 모델과 어긋난다. 백엔드 표기로 맞추고, 필요하면 프론트 클라이언트 레이어에서 변환한다.
3. **`next_actions`는 문자열 배열이 아니라 객체 배열로 한다.** 12항은 `list[str]`이었지만 8항의 완료 처리 API가 `step_id`를 요구한다. 문자열만 받으면 프론트가 참가 신청이라는 글자에서 step_id를 되찾을 방법이 없다.
4. **`answer` 대신 `message`.** 13항 예시의 이름을 따랐다.
5. **문서 조각에 `chunk_id`와 `snippet`을 추가했다.** 10항의 chunk 조회 API와 원문 보기 UI를 지원하려면 필요하다.
6. **`query_id`를 추가했다.** 피드백을 특정 응답에 붙이고 로그를 추적하려면 응답에 식별자가 있어야 한다.

### workflows / documents (v0.2에서 결정)

7. **단계 식별자는 `step_id`로 통일한다.** 7항 예시는 `id`였지만 완료 처리 경로가 `steps/{step_id}`이고 `/query` 응답도 `step_id`를 쓴다. 같은 것을 두 이름으로 부르지 않는다.
8. **목록 응답은 배열이 아니라 `{workflows, total}` 봉투로 감싼다.** 최상위를 배열로 두면 나중에 페이지네이션 필드를 넣을 자리가 없다.
9. **완료 처리 응답은 갱신된 워크플로 전체다.** 성공 여부만 돌려주면 프론트가 곧바로 다시 조회해야 한다. 왕복을 한 번으로 줄인다.
10. **완료 처리는 멱등하며, `completed: false`로 되돌릴 수 있다.** 8항 요청 본문에 boolean이 있는 이유를 되돌리기로 정했다. 잘못 누른 경우를 위한 별도 엔드포인트를 만들지 않는다.
11. **에러 형태를 하나로 통일했다.** 422 검증 실패까지 `{"error": {...}}`로 감싼다. v0.1에서 미확정으로 남겼던 항목을 이렇게 확정한다. FastAPI 기본 형식은 프론트에 나가지 않는다.
12. **피드백 응답에 `diff`를 담는다.** 9항이 말한 예상/실제 차이를 백엔드가 기록만 하고 끝내지 않고, 화면에 바로 보여줄 수 있는 형태로 돌려준다.
13. **`after_step`(이름) 대신 `after_step_id`(식별자) + `suggested_step_name`.** 9항 예시는 단계를 이름으로 가리켰는데, 이름이 같거나 바뀌면 어긋난다. 기준 단계는 식별자로 받고, 새로 제안하는 단계는 아직 식별자가 없으므로 이름으로 받는다.
14. **문서 본문은 기본으로 보내지 않는다.** `?include_content=true`일 때만 채운다. 목록이나 카드 렌더링에 수십 페이지 본문이 따라오지 않게 한다.
15. **조각에 `prev_chunk_id` / `next_chunk_id`를 넣었다.** 원문 보기에서 앞뒤 문단으로 이동하려면 필요하고, 없으면 프론트가 조각 목록을 따로 받아야 한다.

## 아직 확정하지 않은 것

- **인증과 사용자 식별.** 8항의 업무 Trace에 누가 완료했는지 남기려면 필요하다. 현재 요청에는 사용자 정보가 없다.
- **원본 파일 다운로드** `GET /documents/{id}/original`. `original_url` 자리는 잡아 뒀지만 구현하지 않았다.
- **SSE 스트리밍**(15항)의 이벤트 이름과 순서. 구조화된 `data`는 한 번에 보내고 `message`만 스트리밍하는 안이 유력하다.
- **목록 페이지네이션.** 업무가 수십 개를 넘어가면 `limit` / `offset`을 추가한다. `total`은 그때를 위해 미리 넣어 두었다.
- **`session_id`로 이어지는 대화**의 처리 방식.
- **`relevance` 점수**의 정규화 기준과 화면 노출 여부.
