# Frontend integration file ownership

동시 작업 충돌을 피하기 위한 현재 소유권이다. 실제 앱 구조가 도착하면 새 파일을 이 표에 추가하고, 공용 presentation 파일은 디자인 담당자의 handoff를 확인한 뒤 최소 wiring만 적용한다.

| 경로·영역 | 현재 소유자 | 변경 규칙 | 상태 |
|---|---|---|---|
| `src/api/**` | Codex API 통합 | 계약·service·schema·adapter·cache·race·security만 변경 | `CODEX_OWNED` |
| `mocks/backend/**` | Codex API 통합 | 합성 `MOCK_ONLY`; 실제 계약·인가 증거로 사용 금지 | `CODEX_OWNED` |
| `tests/api/**` | Codex API 통합 | test 삭제·skip·assertion 완화 금지 | `CODEX_OWNED` |
| `api-integration/**` | Codex API 통합 | API 지도·충돌·검증 증거 동시 갱신 | `CODEX_OWNED` |
| `gam_dashboard_desktop.html` | 디자인 담당 | Codex가 현재 수정하지 않음 | `DESIGN_OWNED` |
| GAM logo PNG 4개 | 디자인 담당 | 자산명·픽셀·사용 위치는 handoff 후 반영 | `DESIGN_OWNED` |
| 미래 app shell·route·component·style | 디자인 담당, wiring만 Codex와 공유 | 같은 파일 동시 수정 금지; 디자인 위계 재해석 금지 | `HANDOFF_PENDING` |
| 서비스 OpenAPI·Pydantic·backend·DB·인가 정책 | backend 담당 | Codex 읽기·연결만; 임의 endpoint/schema/정책 확정 금지 | `BACKEND_OWNED` |
| `docs/01...07` 및 영상 보충 문서 | 기준 문서 소유자 | 구현 근거로만 사용; 자동 개정 금지 | `READ_ONLY_REFERENCE` |
| `.gitignore` | 기존 사용자 변경 | 현재 작업에서 수정·commit하지 않음 | `USER_OWNED_DIRTY` |

## 공용 파일 변경 절차

1. 디자인의 최종 app revision, handoff, state catalog와 검증 screenshot을 확인한다.
2. route/component/service 연결 지점을 API 지도에 기록한다.
3. presentation 파일에는 controller/hook 주입만 최소 적용한다.
4. 시각 회귀가 생기면 CSS를 임의 수정하지 않고 `DESIGN_CHANGE_REQUEST`로 분리한다.
5. merge·commit·push·PR·배포는 각각 승인된 경우에만 수행한다.
