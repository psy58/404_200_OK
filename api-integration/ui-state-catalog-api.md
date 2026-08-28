# UI/API state catalog

`UI_API_BOUNDARY_V2`의 공통 상태를 디자인 구현에서 빠짐없이 표현하기 위한 계약표다. 최종 문구·컴포넌트·focus 동작은 디자인 handoff와 대조한다.

| 상태 | 의미 | 화면 표현 원칙 | 허용 동작 | 금지 |
|---|---|---|---|---|
| `idle` | 요청 전 | 필요한 입력·조건 표시 | 시작 | 완료처럼 표시 |
| `loading` | 최초 조회 | 핵심 구조를 유지한 loading, 적절한 announcement | 취소 가능 시 취소 | 이전 사용자 데이터 재표시 |
| `ready` | 검증된 전체 응답 | 기준 시점·근거 상태 표시 | 정상 조작 | mock/real 경계 은닉 |
| `empty` | 허용 범위에 데이터 없음 | 원인과 생성·요청·이동 경로 | 가능한 다음 행동 | 단순 `데이터 없음` |
| `no-result` | 검색·필터 결과 0 | 검색어·필터 유지, 초기화 | 필터 지우기·재검색 | empty와 혼동 |
| `partial` | 일부만 성공 | 성공·실패 항목과 기준 시점 분리 | 실패만 재시도 | 전체 성공 표현 |
| `stale` | 오래된 근거·cache | 마지막 검증일·재검토 요청 | 최신 확인 | 현재 공식 기준처럼 표시 |
| `unauthorized` | 401 | 입력 보존 가능 여부와 재인증 | 로그인 | 무한 retry |
| `forbidden` | 403 | 권한 부족·허용 이동·요청 경로 | 목록·권한 요청 | 버튼 숨김으로 보안 주장 |
| `not-found` | 404 | 삭제·이동·존재 은닉 가능성, 목록 복귀 | 목록 이동 | 같은 잘못된 URL retry |
| `conflict` | 409/412 | 최신 내용과 내 입력 구분 | 비교·재적용 | 새 내용 덮어쓰기 |
| `validation-error` | 422 | 오류 요약·field 오류·focus 이동 | 수정 후 재제출 | 입력 삭제 |
| `rate-limited` | 429 | 재시도 시각 | 제한 후 retry | 즉시 반복 요청 |
| `server-error` | 5xx | 입력 보존·support ID | 안전한 retry | 내부 stack·URL 노출 |
| `offline` | network 실패 | 입력·현재 맥락 유지 | 연결 후 retry | 가짜 성공 |
| `disabled` | backend/제품 조건 미충족 | 이유·필요 조건 | 허용된 대체 경로 | 작동 기능처럼 노출 |

## 기능별 추가 상태

### Mutation

`idle → submitting → success | error | conflict`

- success는 실제 response/runtime validation 후에만 표시한다.
- optimistic UI를 쓰면 실패 시 사용자 입력과 더 최신 mutation을 구분해 rollback한다.
- idempotency key와 expected version은 controller에서 생성·전달하고 화면에 노출하지 않는다.

### Upload/analysis

`idle → selecting → ready → uploading → quarantined → scanning → parsing → analyzing → review-required → partial | complete`

어느 단계든 `failed | cancelled | expired`가 될 수 있다. 현재 backend 계약이 없어 전체 기능은 `disabled/BACKEND_REQUIRED`다. mock animation을 실제 server scan·analysis로 표시하지 않는다.

### Notification

실제 P1 계약 전에는 `disabled`, unread `0`이다. 고정 badge·반복 toast·localStorage-only read를 `ready`로 승격하지 않는다.

### Assistant

`ready`는 claim-citation-document-page-authorization 검증이 함께 성공한 경우에만 가능하다. `partial`·`unsupported`는 공식 답변처럼 보이지 않아야 한다.
