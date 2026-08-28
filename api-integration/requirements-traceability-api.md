# 404→200 OK API 요구사항 추적표

> 기준 브랜치: `frontend-api`
> 디자인 기준 commit: `origin/main` `9c15191`
> 계약 상태: `BACKEND_CONTRACT_REQUIRED`
> 디자인 상태: `INTEGRATED_BASELINE` — React/Vite 최종 디자인에 V2 controller/service 연결
> formal handoff: `frontend-design-handoff.md`, `ui-state-catalog.md` 미제공. 사용자의 현재 결정에 따라 병합된 `main`을 디자인 기준선으로 사용

이 표는 8개 기준 문서의 요구를 `UI_API_BOUNDARY_V2` capability에 연결한다. 실제 HTTP path, method, operationId, Pydantic field와 인증 방식은 서비스 OpenAPI가 제공되기 전까지 확정하지 않는다.

## 8개 기준 자료 반영표

| 자료 | API 통신 반영 | 코드·문서 증거 |
|---|---|---|
| 01 시스템 기준 명세 | F01~F17, 도메인 관계, authz chain, AI·감사·DoD | 아래 F01~F17 표, V2 contract, negative matrix |
| 02 UIUX 화면 비교 | B 골격+A 상호작용, stable ID, cursor, ETag/version, problem | final `main` UI wiring, query keys, transport/problem mapper |
| 03 구현 기준 | service/runtime schema/adapter/cache/race/rollback/header | `src/api/**`, `src/services/**`, app API header |
| 04 검증 기준 | 종단 흐름, 증거 수준, UX/Security 독립 gate | gate audit, test evidence, backend gate 원장 |
| 05 JSON 목업 보고서 | 5-file runtime boundary와 fail-closed baseline 원칙 | `mock-backend-validation.md`; 원 hash 파일은 `REFERENCE_MISSING` |
| 영상 디자인 지시서 | 앱 셸, P0 full upload, ExperienceNote, 실제 P1 알림 | 기존 시각 구조 유지, upload/notification disabled gate |
| 영상 검증 보충안 | upload/note/notification/cache/authz negative 상태 | UI state catalog, API tests, security matrix |
| 영상 구현 보충안 | long-running job·draft·partial·approval, mock/real 분리 | V2 capability/state, explicit mode factory, production mock 차단 |

## F01~F17 종단 추적

| Feature | 사용자 조작 | Controller/Hook | Query key 범위 | Service capability | Schema/VM | operationId | AuthZ | 오류·rollback | 테스트·증거 | 현재 상태 |
|---|---|---|---|---|---|---|---|---|---|---|
| F01 담당 업무 | 허용 Assignment 조회·활성화 | `AssignmentContext`, `AssignmentModal` | session; user·school·assignment·session epoch | `getSession`, `setActiveAssignment`; `logout`은 lifecycle test만 | `SessionContextVM`, `AssignmentSummaryVM` | 미정 | session → school → assignment | 401·403·409/412, 전환 시 cache/request 폐기 | assignment version/context/logout mock tests | 조회·전환 `MOCK_ONLY`; logout UI·real 계약 대기 |
| F02 홈 | 최우선 행동·긴급·이번 달·30일 조회 | `HomePage`, `tasksService` | user·school·assignment·session epoch | `getHome` | `HomeVM`, `TaskSummaryVM` | 미정 | assignment별 목록·집계 재인가 | empty·partial·stale·timeout | build + validated mock/service tests | `MOCK_ONLY`·UI 연결 |
| F03 연간 지도 | 학년도·필터·cursor 조회 | `AnnualMapPage`, `getAnnualTasks` | context·academicYear | `getAnnualMap` | `AnnualMapVM`, `AnnualTaskVM` | 미정 | assignment·task 인가 | no-result·stale·pagination | build + assignment isolation | `MOCK_ONLY`·UI 연결 |
| F04 문서 분석 | 파일 선택·upload·job·초안 승인 | `UploadModal`, `uploadService` | context·jobId | prepare/transfer/create/get/cancel/retry/review/delete capability | `UploadAnalysisVM`, `AnalysisDraftVM` | 미정 | attachment·job·document·task 양쪽 | fake success 제거, 계약 전 전송 차단 | full state type·disabled capability tests | `SPEC_ALIGNMENT_REQUIRED`·`BACKEND_REQUIRED` |
| F05 근거 연결 | 근거·문서·연결 이유 조회 | `TaskDetailPage`, `EvidenceChain` | context·taskId·evidenceId | task detail/document capability | `EvidenceVM`, `TaskDetailVM` | 미정 | Task·Document·Evidence 양쪽 | 403·404·stale·conflict | seeded mock evidence + runtime validation | `MOCK_ONLY` partial·`BACKEND_CONTRACT_REQUIRED` |
| F06 전년도 사례 | 전년도 활동·사례 확인 | `TaskDetailPage`, `PreviousTimeline` | context·taskId·academicYear | `getTaskDetail` | `ActivityVM`, `EvidenceVM` | 미정 | task·activity·document | partial·stale | seeded detail fixture | `MOCK_ONLY` partial·`BACKEND_CONTRACT_REQUIRED` |
| F07 체크리스트 | 완료·메모 저장 | `ChecklistSection`, `checklistService` | context·taskId | `updateChecklist` | `ChecklistMutation`, `TaskDetailVM` | 미정 | property/action 인가, actor는 session | optimistic rollback·idempotency·409/412 | version/idempotency/context service tests | `MOCK_ONLY`·UI 연결 |
| F08 알림 | 일정 사전 알림 | `NotificationPanel`, `notificationsService` | context·cursor | list/single/all read capability | `NotificationCenterVM`, `NotificationReadMutation` | 미정 | target object 재인가 | fixed unread/local read 제거 | disabled/no fake unread tests | `BACKEND_REQUIRED`·UI gate 연결 |
| F09 지침 비교 | 현재·과거 근거 비교 | proposed evidence comparison controller | context·taskId·version | evidence capability | `EvidenceVM` | 미정 | evidence/document | stale·conflicted·review required | 모델만 정의 | `BACKEND_CONTRACT_REQUIRED` |
| F10 경험 메모 | 목록·작성·수정·삭제 | `NotesPage`, `NoteComposerModal` | context·taskId·filter·cursor | note list/create/update/delete | `ExperienceNotesVM`, create/update/delete mutation | 미정 | visibility·property·action | 입력 보존·409/412·422 | CRUD/version/idempotency tests; UI list/create | `MOCK_ONLY`, update/delete UI 후속 |
| F11 인수인계 | 승인 기록 기반 미리보기 | `HandoverPage`, `handoverService` | context·academicYear | `getHandoverPreview` | `HandoverPreviewVM` | 미정 | assignment·note visibility | partial·draft 제외 | build + approved non-private note test | `MOCK_ONLY` read-only UI |
| F12 예산·행정 | 공식 근거·학교 사례 연결 | proposed task/evidence controller | context·taskId | evidence capability | 미정 | 미정 | task/document | 근거 없음 fail-closed | P1 후속 | `BACKEND_CONTRACT_REQUIRED` |
| F13 양식 | 적용 가능한 양식 조회 | proposed template controller | context·taskId·year | template capability 미정 | 미정 | 미정 | template/document | stale·retired·403 | P1 후속 | `BACKEND_CONTRACT_REQUIRED` |
| F14 AI Q&A | 근거 기반 질문·취소 | `AssistantPanel` disabled gate | context·taskId·requestId | `queryAssistant` | `AssistantVM`, `AssistantQuery` | 미정 | retrieval ACL 재검사 | citation 누락·검색 실패 fail-closed | disabled unsupported test | `BACKEND_REQUIRED` |
| F15 신규 공문 | 분석 초안 검토·승인 | proposed analysis controller | context·jobId | analysis/review capability | `AnalysisDraftReview`, `UploadAnalysisVM` | 미정 | document/job/task | draft·partial·prompt injection | 보충안 행렬 | `BACKEND_REQUIRED` |
| F16 신규 업무 | 근거 기반 roadmap 초안 | proposed roadmap controller | context·draftId | roadmap capability 미정 | 미정 | 미정 | evidence·approval | unsupported·draft | P2 후속 | `BACKEND_REQUIRED` |
| F17 관리자 | 별도 overview 조회 | 없음 | admin principal·school | admin capability 미정 | 미정 | 미정 | server admin role·school | 401·403·minimal fields | 현재 디자인 범위 밖 | `BACKEND_CONTRACT_REQUIRED` |

## 영상 보충 결정 반영

- 파일 전체 업로드·분석을 P0으로 취급하되 기준 명세의 metadata-only MVP와 충돌하므로 `SPEC_ALIGNMENT_REQUIRED`다.
- `선생님들의 감`은 ExperienceNote 목록·CRUD이며 좋아요·댓글·랭킹·공개 피드 API는 정의하지 않는다.
- 알림은 P1 실제 기능이다. 계약 전 고정 unread 수나 local-only 읽음 처리를 실제 기능으로 제출하지 않는다.
- 디자인 시안의 정적 데이터는 합성 fixture로만 취급하며 서버 인가·영속성·감사를 증명하지 않는다.

## 현재 차단·대기 원장

| 상태 | 필요한 증거 |
|---|---|
| `USER_TEST_REQUIRED` | Browser/Playwright 기반 interaction·responsive·axe·visual regression과 실제 교직원 과업 관찰 |
| `BACKEND_CONTRACT_REQUIRED` | 같은 revision의 서비스 OpenAPI, Pydantic model, 권한·오류 계약, contract test |
| `REFERENCE_MISSING` | 보고서 commit `05fa1da…` 객체와 SHA-256 일치 원본 5개 JSON; 현재 repo와 `/mnt/d/work_demo` 검색 결과 없음 |
| `DESIGN_HANDOFF_PENDING` | formal `frontend-design-handoff.md`와 `ui-state-catalog.md`; 현재는 사용자 승인에 따라 병합된 `main`을 기준선으로 사용 |
| `SPEC_ALIGNMENT_REQUIRED` | 파일 본문·첨부 P0 범위를 시스템 명세에 정식 반영한 승인 변경 |
| `DEPLOYMENT_REQUIRED` | 실제 배포 URL의 route·header·cache·접근성·console 검증 |
