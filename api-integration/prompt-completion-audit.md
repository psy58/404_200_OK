# 통합 기준선 Gate 감사표

## 현재 authoritative state

- design: `origin/main` `9c15191`, React 18/Vite/TypeScript 최종 디자인
- integration branch: `frontend-api`, merge commit `2a23e80`
- service OpenAPI/backend repository: 없음
- API boundary: `UI_API_BOUNDARY_V2`, mock revision `ui-api-boundary-v2.mock.1`

| Gate | 증거 | 판정 |
|---|---|---|
| A0 Git/toolchain | branch/base/dirty/fetch/merge 기록, package-lock 기반 설치·build | `PASS` |
| A1 추적·API map | requirements trace, API map, ownership | `PASS_FOR_BASELINE` |
| A2 V2 mock/real 경계 | explicit mode factory, production mock 차단, final UI adapter | `PASS_FOR_BASELINE` |
| A3 오류·충돌·rollback·cache | problem mapper, coordinator, version/idempotency, optimistic rollback | `PASS_FOR_MOCK` |
| A4 session/home/annual/task/evidence | 최종 디자인 route에 연결 | `PASS_FOR_MOCK` |
| A5 documents/search/check/note | 최종 디자인 route/modal에 연결 | `PASS_FOR_MOCK`; note update/delete UI 후속 |
| A6 upload/analysis | fake timer/success 제거, V2 disabled gate 연결 | `BACKEND_REQUIRED` |
| A7 notification | fixed badge/local read 제거, V2 disabled gate 연결 | `BACKEND_REQUIRED` |
| A8 privacy/supply chain/performance | runtime validation, scoped keys, request cancel, safe generic error fallback, deferred search, overlay split; Vite High/unsupported·Router moderate advisory | `BLOCKED_FOR_RELEASE`, dependency upgrade approval required |
| A9 design merge/wiring/visual | main merge·wiring 완료; browser screenshot/axe 미실행 | `PARTIAL`, `USER_TEST_REQUIRED` |
| A10 docs/evidence | handoff, map, integration report, test evidence | `PASS_FOR_BASELINE` |

API 계층 기준선은 유지되지만, 실제 통합 완료·운영 릴리스 준비 상태는 아니다. OpenAPI/backend 증거와 승인된 Vite/Router upgrade, browser·사용자 검증이 필요하다.
