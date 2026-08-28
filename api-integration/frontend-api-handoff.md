# Frontend API handoff

## 결론

`origin/main` `9c15191`의 최종 React 디자인을 `frontend-api`에 병합하고, 화면의 정적 JSON/시연 mutation을 기존 `UI_API_BOUNDARY_V2` 서비스 경계로 교체했다. 디자인 route·컴포넌트·CSS는 유지했다. 실제 OpenAPI가 없으므로 real mode는 요청 전 `BACKEND_CONTRACT_REQUIRED`로 차단되고, 개발 preview만 명시적 mock opt-in을 사용한다.

## Git 기준

- branch: `frontend-api`
- 병합 전 API 보존 commit: `1ff1bd7`
- 병합 commit: `2a23e80`
- 병합한 design commit: `9c15191`
- 충돌: `.gitignore` add/add 1건. `/docs/` 로컬 제외와 Node/Vite 제외 규칙을 모두 보존했다.
- push·PR·main 수정·배포: 수행하지 않음

## 데이터 흐름

```text
final React UI
→ React Query / AssignmentContext
→ final-design domain adapter
→ request coordinator
→ FrontendApiService
→ strict V2 mock runtime boundary | OpenAPI-gated real service
```

주요 구현은 `src/services/apiClient.ts`, `src/services/mockApiFactory.ts`, `src/services/requestExecution.ts`, `src/domain/adapters.ts`, `src/state/AssignmentContext.tsx`, `src/state/queryKeys.ts`다.

## 연결 상태

- session·Assignment 전환: 연결. 전환 전 request 취소와 principal cache purge 수행
- home·annual·task detail·documents·search: V2 mock 연결
- checklist: expected version·idempotency·optimistic rollback 연결
- ExperienceNote list/create: session-only V2 mock 연결. update/delete UI는 후속
- handover: 전용 read-only preview capability 연결
- upload/analysis: 실제 파일 선택 UI는 유지하되 backend gate에서 전송 전 중단
- notification: 고정 badge·local read 제거, 실제 P1 계약 전 disabled
- assistant: 디자인의 disabled P2 상태 유지

## 남은 조건

- `BACKEND_CONTRACT_REQUIRED`: OpenAPI revision, operationId, Pydantic, session/CSRF, problem, pagination, version/idempotency
- `BACKEND_REQUIRED`: upload quarantine/job/draft approval, notification persistence/deep-link authz, AI retrieval/citation
- `USER_TEST_REQUIRED`: 실제 교직원 5초·10초·30초 과업
- `DEPLOYMENT_REQUIRED`: 배포 route/header/cache/console/accessibility
- Browser plugin/Playwright 부재로 screenshot·interaction·axe·visual regression은 미실행

## 실행일 framework/supply-chain 상태

- React `18.3.1`: client-only SPA이며 React Server Components 패키지를 사용하지 않아 2025~2026 RSC advisory 경로에는 해당하지 않는다.
- React Router `6.30.6`: `npm audit --omit=dev`에서 moderate 2건. search/deep-link 입력은 protocol-relative·backslash·control character를 runtime boundary에서 거부하고 SSR hydration API는 사용하지 않지만, 이는 버전 수정의 대체가 아니다.
- Vite `5.4.21`: 공식 지원 종료이며 전체 audit에서 High 1건을 포함한 advisory가 확인됐다. dev/preview는 loopback과 localhost CORS로 제한했지만 major upgrade 승인 전 release gate는 해제하지 않는다.
- Node `22.22.1`: LTS line이나 현재 공식 v22 최신 patch보다 낮다. 실행환경 갱신은 repository package 변경과 별도 운영 결정이다.
- overlay 동적 import 뒤 initial JS는 `310.58 kB`(gzip `95.19 kB`), 142 modules로 build됐다.

formal `frontend-design-handoff.md`와 `ui-state-catalog.md`는 제공되지 않았다. 사용자의 현재 결정에 따라 `origin/main` `9c15191`을 디자인 기준선으로 사용했으며, 승인 screenshot 대조는 `DESIGN_HANDOFF_PENDING`/`USER_TEST_REQUIRED`다.
