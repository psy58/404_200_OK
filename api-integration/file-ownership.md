# Frontend integration file ownership

기준 디자인은 `origin/main` `9c15191`의 React/Vite 앱이다. 이번 통합에서는 디자인 구조와 CSS를 기준선으로 유지하고 데이터 경계만 재작성했다.

| 경로·영역 | 소유·기준 | 변경 규칙 | 상태 |
|---|---|---|---|
| `src/components/**`, `src/features/**`, `src/styles/**` | `main` 디자인 기준 | 마크업·CSS·상호작용 유지, API wiring과 안전 상태만 최소 변경 | `INTEGRATED` |
| `src/api/**` | Codex API 통합 | 계약·runtime schema·adapter·cache·race·security | `CODEX_OWNED` |
| `src/services/**` | Codex API 통합 | 화면이 endpoint/mock을 직접 알지 않도록 V2 service만 호출 | `CODEX_OWNED` |
| `src/state/AssignmentContext.tsx`, `src/state/queryKeys.ts` | 공유 경계 | session/context 전환과 principal-scoped cache만 담당 | `INTEGRATED` |
| `src/domain/**` | 공유 경계 | V2 VM을 최종 디자인 domain model로 변환 | `INTEGRATED` |
| `mocks/backend/**` | Codex API 통합 | 합성 `MOCK_ONLY`, 실제 backend 증거로 사용 금지 | `CODEX_OWNED` |
| `tests/api/**` | Codex API 통합 | 삭제·skip·assertion 완화 금지 | `CODEX_OWNED` |
| `api-integration/**` | Codex API 통합 | API 지도·충돌·검증 증거 동시 갱신 | `CODEX_OWNED` |
| 서비스 OpenAPI·backend·DB·인가 | backend 담당 | 임의 endpoint/schema/정책 확정 금지 | `BACKEND_OWNED` |

삭제한 `public/mocks/backend/**`, `src/domain/raw-schemas.ts`, `src/services/mockClient.ts`, `src/services/feedService.ts`는 최종 디자인이 직접 정적 JSON을 읽던 구형 병렬 경계다. 전체 사용처와 대체 V2 service를 확인한 뒤 제거했다.
