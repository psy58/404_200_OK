# main 디자인 → frontend-api 통합 보고

## Git

- 작업 branch: `frontend-api`
- API 보존 commit: `1ff1bd7`
- 병합한 main: `9c15191`
- merge commit: `2a23e80`
- 충돌: `.gitignore` 1건, 양쪽 제외 규칙 병합
- push·PR·main 수정·배포: 없음

## 최종 디자인 분석

- route: `/home`, `/map`, `/docs`, `/notes`, `/handover`, `/tasks/:taskId`
- shell: sidebar, topbar search, Assignment modal, notification/assistant panel
- 주요 mutation: Assignment 전환, checklist toggle, ExperienceNote 작성, upload 준비
- 원래 정적 경계: `public/mocks/backend/**` 직접 fetch, local Assignment, fake checklist/note, timer upload, static notification

## 재구성 결과

- V2 singleton service factory와 explicit mock/real mode 추가
- V2 VM → final design domain adapter 추가; wire DTO 필드는 presentation에 노출하지 않음
- full principal query key와 request coordinator 연결
- Assignment 전환 시 request 취소, principal cache 제거, server-shaped session 교체
- UI search를 V2 `search`로 교체하고 unsafe target fallback 적용
- fake upload/notification 성공을 backend gate로 교체
- 구형 public fixture/Zod service 경계를 사용처 확인 후 제거
- 임의 `Error.message`를 사용자 화면에 노출하지 않도록 generic safe fallback 적용
- 검색 입력에 deferred query를 사용하고 이전 검색 target이 새 검색어 결과로 노출되지 않게 차단
- upload·notification·assistant·overlay를 entry-time dynamic chunk로 분리
- Vite dev/preview를 loopback + localhost CORS로 제한

## 계약 상태

- endpoint/operationId: OpenAPI 부재로 확정하지 않음
- mock: session-only, `ui-api-boundary-v2.mock.1`
- real: `BACKEND_CONTRACT_REQUIRED`, fail-closed
- upload/analysis, notification, assistant: `BACKEND_REQUIRED`

## 검증·남은 항목

typecheck/lint/build/API test/dev server는 실행했다. API test는 70/70, build는 initial JS 310.58 kB(gzip 95.19 kB)와 overlay chunks로 통과했다. Browser/Playwright가 없어 visual·interaction·axe는 `USER_TEST_REQUIRED`; 실제 OpenAPI/backend/배포는 각각 `BACKEND_CONTRACT_REQUIRED`, `BACKEND_REQUIRED`, `DEPLOYMENT_REQUIRED`다. Vite 5 unsupported/High advisory와 React Router moderate advisory는 승인된 major upgrade가 필요하다.
