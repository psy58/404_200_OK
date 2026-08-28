# MOCK_ONLY backend boundary validation

이 저장소의 fixture는 과거 완료 보고서에 기록된 원본 5개 파일이 아니다. 제공 경로에서 원본을 찾지 못해 `REFERENCE_MISSING`으로 유지하고, 현재 디자인의 합성 내용을 새 schema revision `ui-api-boundary-v2.mock.1`로 재구성했다.

## Boundary

```text
mocks/backend/*.json
→ unknown JSON
→ strict runtime validation
→ DTO adapter
→ UI_API_BOUNDARY_V2 view model
→ session-only mock service
```

## Current SHA-256

| 파일 | SHA-256 |
|---|---|
| `contract.json` | `0ae3962106799d9f8e400e258382323e609afe084e4caad9d661e0b61440c8af` |
| `home.json` | `4085012c798a4d5bd2b0639859e7cfd7ae3cc1a52fafb59b88a81a8b5ffb752e` |
| `problems.json` | `b141804f6d0e89d3c5b16ec0cf8fc3fb59e4b96972b94346f2cf6a33f1dbe2fd` |
| `search-results.json` | `a642e730300eb9ad19ef648a62417f9d62207062cfcc17fced4cd1e18037d428` |
| `task-detail.student-competition.json` | `f9693d439a4f7cfff3059fe39df2c1bcfc75842fb54b226b71c5810a67cead2f` |

## Verified behavior

- 모든 fixture JSON parse와 strict runtime schema 통과
- unknown enum, extra field, 잘못된 날짜, 중복 checklist ID, 수량 불변조건 fail-closed
- DTO snake_case를 presentation camelCase로 한 곳에서 변환
- session 응답이 완전한 user·school·Assignment·sessionEpoch context 제공
- Assignment 전환이 session version을 증가시키고 같은 idempotency key replay에서 중복 증가하지 않음
- contract/home/task/search fixture 간 context 불일치 시 시작 실패
- 다른 school context 거부
- Assignment 전환 뒤 이전 데이터·cache 분리
- 전환·logout 시작 시 request/cache 선폐기, 실패·늦은 응답 시 이전 session 비노출
- AbortSignal 요청 취소와 same-scope latest-request-wins
- checklist expected version 412, 동일 요청 replay와 idempotency payload 충돌 409
- ExperienceNote search/filter/CRUD, note version 충돌과 삭제
- problem 412·422 UI issue mapping
- mock logout 뒤 session/home 재접근 401
- 실제 P1 notification과 P0 full-file analysis는 backend 계약 없이 disabled
- real transport는 OpenAPI revision·operation map·response parser 없이는 network 요청 전 차단
- path/query/body authority selector, 위험 method·경로, 성공 응답 schema 오류 fail-closed
- explicit mode 선택과 non-production opt-in 없이는 mock 시작 불가, production mock 금지

## Not proven by this mock

- 실제 authentication·tenant/object/property/action authorization
- DB transaction·persistence·audit·retention
- cookie/OAuth·CSRF·CORS·logout
- upload quarantine·malware·parser sandbox
- RAG ACL·chunk/vector/cache namespace·삭제 전파
- 실제 notification 생성·중복 방지·timezone·deep-link 재인가
- 배포 cache·보안 header·field performance
