# 404→200 OK API 요구사항 추적표

> 기준 브랜치: `frontend-api`
> 디자인 기준 commit: `5751fa9`
> 계약 상태: `BACKEND_CONTRACT_REQUIRED`
> 디자인 상태: `DESIGN_HANDOFF_PENDING` — 현재 `gam_dashboard_desktop.html` 단일 시안만 존재

이 표는 8개 기준 문서의 요구를 `UI_API_BOUNDARY_V2` capability에 연결한다. 실제 HTTP path, method, operationId, Pydantic field와 인증 방식은 서비스 OpenAPI가 제공되기 전까지 확정하지 않는다.

| Feature | 사용자 조작 | Controller/Hook | Query key 범위 | Service capability | operationId | AuthZ | 오류·rollback | 테스트·증거 | 현재 상태 |
|---|---|---|---|---|---|---|---|---|---|
| F01 담당 업무 | 허용 Assignment 조회·활성화 | `session/assignment controller` | user·school·session epoch | `getSession`, `setActiveAssignment`, `logout` | 미정 | session → school → assignment | 401·403·409, 전환 시 cache/request 폐기 | assignment/context/logout mock tests | `BACKEND_CONTRACT_REQUIRED` |
| F02 홈 | 최우선 행동·긴급·이번 달·30일 조회 | `home controller` | user·school·assignment | `getHome` | 미정 | assignment별 목록·집계 재인가 | empty·partial·stale·timeout | validated mock/adaptor/service tests | `MOCK_ONLY` |
| F03 연간 지도 | 학년도·필터·cursor 조회 | `annual controller` | context·academicYear·filter·cursor | `getAnnualMap` | 미정 | assignment·task 인가 | no-result·stale·pagination | mock derivation·assignment isolation | `MOCK_ONLY`·`BACKEND_CONTRACT_REQUIRED` |
| F04 문서 분석 | 파일 선택·upload·job·초안 승인 | `analysis controller` | context·jobId | prepare/transfer/create/get/cancel/retry/review/delete capability | 미정 | attachment·job·document·task 양쪽 | 취소·만료·partial·retry·unknown enum fail-closed | full state type·disabled capability tests | `SPEC_ALIGNMENT_REQUIRED`·`BACKEND_REQUIRED` |
| F05 근거 연결 | 근거·문서·연결 이유 조회 | `evidence controller` | context·taskId·evidenceId | task detail/document capability | 미정 | Task·Document·Evidence 양쪽 | 403·404·stale·conflict | `EvidenceVM` | `BACKEND_CONTRACT_REQUIRED` |
| F06 전년도 사례 | 전년도 활동·사례 확인 | `task controller` | context·taskId·academicYear | `getTaskDetail` | 미정 | task·activity·document | partial·stale | `ActivityVM`, `EvidenceVM` | `BACKEND_CONTRACT_REQUIRED` |
| F07 체크리스트 | 완료·메모 저장 | `checklist mutation` | context·taskId | `updateChecklist` | 미정 | property/action 인가, actor는 session | idempotency·409/412·입력 보존 | version/idempotency/context service tests | `MOCK_ONLY`·`BACKEND_CONTRACT_REQUIRED` |
| F08 알림 | 일정 사전 알림 | `notification controller` | context·cursor | list/single/all read capability | 미정 | target object 재인가 | stale target·dedupe·timezone | disabled/no fake unread tests | `BACKEND_REQUIRED` |
| F09 지침 비교 | 현재·과거 근거 비교 | `evidence comparison controller` | context·taskId·version | evidence capability | 미정 | evidence/document | stale·conflicted·review required | 모델만 정의 | `BACKEND_CONTRACT_REQUIRED` |
| F10 경험 메모 | 목록·작성·수정·삭제 | `experience controller` | context·taskId·filter·cursor | note list/create/update/delete | 미정 | visibility·property·action | 409/412·422·삭제 확인 | search/filter/CRUD/version/idempotency tests | `MOCK_ONLY`·`BACKEND_CONTRACT_REQUIRED` |
| F11 인수인계 | 승인 기록 기반 미리보기 | `handover controller` | context·academicYear | `getHandoverPreview` | 미정 | assignment·note visibility | partial·draft 제외 | `HandoverPreviewVM` | `BACKEND_CONTRACT_REQUIRED` |
| F12 예산·행정 | 공식 근거·학교 사례 연결 | `task/evidence controller` | context·taskId | evidence capability | 미정 | task/document | 근거 없음 fail-closed | P1 후속 | `BACKEND_CONTRACT_REQUIRED` |
| F13 양식 | 적용 가능한 양식 조회 | `template controller` | context·taskId·year | template capability 미정 | 미정 | template/document | stale·retired·403 | P1 후속 | `BACKEND_CONTRACT_REQUIRED` |
| F14 AI Q&A | 근거 기반 질문·취소 | `assistant controller` | context·taskId·requestId | `queryAssistant` | 미정 | retrieval ACL 재검사 | citation 누락·검색 실패 fail-closed | `AssistantVM`·disabled unsupported test | `BACKEND_REQUIRED` |
| F15 신규 공문 | 분석 초안 검토·승인 | `analysis controller` | context·jobId | analysis/review capability | 미정 | document/job/task | draft·partial·prompt injection | 보충안 행렬 | `BACKEND_REQUIRED` |
| F16 신규 업무 | 근거 기반 roadmap 초안 | `roadmap controller` | context·draftId | roadmap capability 미정 | 미정 | evidence·approval | unsupported·draft | P2 후속 | `BACKEND_REQUIRED` |
| F17 관리자 | 별도 overview 조회 | `admin controller` | admin principal·school | admin capability 미정 | 미정 | server admin role·school | 401·403·minimal fields | 현재 디자인 범위 밖 | `BACKEND_CONTRACT_REQUIRED` |

## 영상 보충 결정 반영

- 파일 전체 업로드·분석을 P0으로 취급하되 기준 명세의 metadata-only MVP와 충돌하므로 `SPEC_ALIGNMENT_REQUIRED`다.
- `선생님들의 감`은 ExperienceNote 목록·CRUD이며 좋아요·댓글·랭킹·공개 피드 API는 정의하지 않는다.
- 알림은 P1 실제 기능이다. 계약 전 고정 unread 수나 local-only 읽음 처리를 실제 기능으로 제출하지 않는다.
- 디자인 시안의 정적 데이터는 합성 fixture로만 취급하며 서버 인가·영속성·감사를 증명하지 않는다.

## 현재 차단·대기 원장

| 상태 | 필요한 증거 |
|---|---|
| `DESIGN_HANDOFF_PENDING` | 실제 앱 구조, `frontend-design-handoff.md`, `ui-state-catalog.md` 또는 동등한 코드·상태 자료 |
| `BACKEND_CONTRACT_REQUIRED` | 같은 revision의 서비스 OpenAPI, Pydantic model, 권한·오류 계약, contract test |
| `REFERENCE_MISSING` | 보고서에 기록된 5개 원본 JSON과 SHA-256 일치 파일 |
| `SPEC_ALIGNMENT_REQUIRED` | 파일 본문·첨부 P0 범위를 시스템 명세에 정식 반영한 승인 변경 |
| `USER_TEST_REQUIRED` | 실제 교직원의 5초·10초·30초 과업 관찰 |
| `DEPLOYMENT_REQUIRED` | 실제 배포 URL의 route·header·cache·접근성·console 검증 |
