# 역할·학교·자원·행동 부정 테스트 원장

현재 저장소에는 backend가 없으므로 아래 `MOCK PASS`는 프론트 회귀 방지 근거일 뿐 운영 인가 증거가 아니다.

| 주체·상황 | 자원·행동 | 기대 | 현재 증거 | 판정 |
|---|---|---:|---|---|
| 비로그인 | 모든 user-scoped 조회 | 401 | mock logout 후 session/home 401 test | `MOCK PASS`·`BACKEND_REQUIRED` |
| 배정 담당자 | 활성 Assignment 홈 조회 | 허용 | synthetic context mock test | `MOCK PASS` |
| 같은 학교 미배정자 | Task 직접 URL | 403 또는 threat model상 404 | backend 없음 | `BACKEND_REQUIRED` |
| 다른 학교 사용자 | Home·Task·Document·Search 조회 | 404/403, data 0 | 다른 `schoolId` mock 차단 test | `MOCK PASS`·`BACKEND_REQUIRED` |
| 허용되지 않은 Assignment | 활성화 mutation | 403 | `setActiveAssignment` allow-list mock test 기반 코드 | `MOCK PASS` |
| 다른 Assignment | 이전 Assignment cache·response·직접 Task ID | 노출 없음·404 | context key·request cancellation·empty view·직접 Task 404 tests | `MOCK PASS` |
| 배정 담당자 | stale checklist mutation | 409/412 | expected version mock test | `MOCK PASS` |
| 배정 담당자 | 동일 idempotency key 재전송 | 중복 이력 없음 | mock service test | `MOCK PASS` |
| 사용자 조작 body/query/path | `role/user_id/school_id/owner_id/approval_status` 추가 | 권한 변화 없음 | real transport가 fetch 전 거부 | `CLIENT DEFENSE PASS`·`BACKEND_REQUIRED` |
| 변조된 OpenAPI mapping | protocol-relative path·TRACE·schema 없는 응답 | network/UI 반영 차단 | real transport path/method/runtime parser tests | `CLIENT DEFENSE PASS` |
| production build | 누락된 설정이 mock으로 fallback | 앱 시작 차단 | explicit mode·production mock factory tests | `CLIENT DEFENSE PASS` |
| 모든 역할 | 검색 자동완성·건수·제목·snippet | 원문 ACL과 동일 | backend search 없음 | `BACKEND_REQUIRED` |
| 모든 역할 | Document·Evidence 관계 ID 한쪽 교체 | 관계 양쪽 재인가 | backend 없음 | `BACKEND_REQUIRED` |
| 학교 관리자 | 개인 ExperienceNote 조회 | 정책상 최소 범위 | 정책·backend 없음 | `DECISION_REQUIRED` |
| 비관리자 | Admin route·method 변경 | 403/404 | admin 구현 없음 | `BACKEND_REQUIRED` |
| 배정 담당자 | 파일 upload·분석 승인 | Attachment·Job·Document·Task 재인가 | backend 없음, UI capability disabled | `BACKEND_REQUIRED` |
| 배정 담당자 | Notification deep link | target object 재인가 | backend 없음, UI capability disabled | `BACKEND_REQUIRED` |

## 서버 contract test에 반드시 추가할 조합

- 다른 학교 ID와 같은 학교 미배정자의 직접 URL
- Task·Document·Evidence·Attachment 관계 양쪽 ID 교체
- 검색·자동완성·total·title·snippet·notification 문구
- download·export·bulk action·method 변경
- DTO extra field와 property-level mass assignment
- logout·권한 회수·Assignment 전환 직후 진행 중 request/SSE/poll 완료
