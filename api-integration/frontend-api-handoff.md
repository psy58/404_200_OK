# Frontend API handoff — 진행 중

## 결론

프레임워크 독립 API 경계와 mock vertical slice를 구현했다. 실제 앱 구조와 서비스 OpenAPI가 없으므로 디자인 화면 wiring과 real API 통신은 아직 시작하지 않았다.

## 기준

- branch: `frontend-api`
- design base: `5751fa9`
- design artifact: `gam_dashboard_desktop.html`; `origin/main` `5bb3836`에 logo PNG 4개 추가
- service OpenAPI: 없음
- backend 참고 문서: `/mnt/d/work_demo/langchain_frontend_api_collaboration.md`, `/mnt/d/work_demo/langchain_frontend_api_prompt.md` — 읽기 전용
- original JSON baseline: 제공 경로에서 찾지 못함 (`REFERENCE_MISSING`)

## 구현된 산출물

- `src/api/ui-api-boundary-v2.ts`: presentation-facing canonical TypeScript contract
- `src/api/runtime-schema.js`: `unknown` mock payload runtime validation
- `src/api/adapters.js`: snake_case mock DTO → camelCase view model
- `src/api/cache-keys.js`: user·school·Assignment·session epoch cache isolation
- `src/api/request-coordinator.js`: cancel·latest-request-wins·session memory cache
- `src/api/context-lifecycle.js`: session 설치·Assignment 전환·logout 시 request/cache purge
- `src/api/problem-mapper.js`: 401/403/404/409/412/422/429/5xx UI mapping
- `src/api/real-transport.js`: OpenAPI operation map·runtime response parser 전까지 fail-closed
- `src/api/service-factory.js`: 명시적 mock/real 선택, production accidental mock 차단
- `src/api/mock-service.js`: session-only mock service, version·idempotency·context guard·ExperienceNote CRUD·logout
- `mocks/backend/*.json`: 새 `mock.1` 합성 fixture 5개
- `tests/api/*.test.js`: runtime·service·cache·transport negative tests

## 아직 연결하지 않은 이유

2026-08-28 재조회한 `origin/main` `5bb3836`에는 여전히 단일 HTML 시안과 logo/icon/wordmark 변형 자산만 있고 앱 framework, route, component, query library, state catalog과 디자인 handoff가 없다. 이 파일에 직접 wiring하면 디자인 담당자의 실제 앱 구조가 도착한 뒤 재작성해야 하므로 `gam_dashboard_desktop.html`은 수정하지 않았다.

## 현재 검증 요약

- Node API 회귀 테스트: 60/60 PASS
- cached TypeScript 5.9.3: boundary strict typecheck와 JS 구조 check PASS
- Codex Security diff scan: 현재 프런트 source 15개에서 reportable finding 0
- 미검증: 실제 app wiring/build/browser/accessibility/visual E2E와 backend authorization·CSRF·upload/retrieval/notification controls

## 디자인 구현 도착 후 통합 순서

1. 새 `origin/main`을 `frontend-api`에 merge한다.
2. framework·route·query/cache·test 도구와 generated file 경계를 확인한다.
3. `UI_API_BOUNDARY_V2` props와 디자인 state catalog를 대조한다.
4. framework adapter/controller/hook을 추가한다.
5. static fixture import를 `mock-service` 뒤로 이동한다.
6. home→annual→task/evidence→search→check/note 순으로 wiring한다.
7. upload/analysis와 P1 notification은 실제 backend 계약 없이는 disabled를 유지한다.
8. 승인 시안과 desktop·390px 렌더를 비교하고 접근성·visual regression을 실행한다.

## backend에 필요한 다음 자료

- 같은 revision의 `/openapi.json`
- Pydantic model과 operationId
- session·cookie/OAuth·CSRF·CORS 계약
- tenant/object/property/action authorization와 403/404 정책
- problem details, cursor, idempotency, ETag/version
- upload/quarantine/job/draft approval
- ExperienceNote와 Notification 계약
- contract·role×tenant negative test
