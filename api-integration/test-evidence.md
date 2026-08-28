# Test evidence

> 실행 기준: `frontend-api`, Node.js `v22.22.1`

## Passed

| 명령 | 결과 | 범위 |
|---|---|---|
| `node --test tests/api/*.test.js` | PASS, 60/60 | runtime schema, Gregorian calendar validation, adapter/service behavior, context lifecycle/race, collision-safe cache isolation, request cancellation, production mock gate, real transport schema/security/circular-input gates |
| cached TypeScript `5.9.3` strict `tsc --noEmit` | PASS | `ui-api-boundary-v2.ts`, `ES2022,DOM`, bundler module resolution |
| cached TypeScript `5.9.3` `allowJs/checkJs` | PASS with `strict=false`, `noImplicitAny=false` | `src/api/*.js` 구조·JSDoc option 경계; strict JS typecheck 주장은 아님 |
| `node --check src/api/*.js` 개별 실행 | PASS | JavaScript syntax |
| JSON parse + runtime parsers | PASS | 합성 fixture 5개 |
| `git diff --check` | PASS | whitespace errors 없음 |
| credential pattern scan | PASS, match 0 | AWS/OpenAI/GitHub/private-key 대표 패턴 |
| Codex Security diff scan | PASS for current frontend source scope, reportable findings 0 | 15개 `src/api/**`·`mocks/backend/**` 파일; backend·OpenAPI·app wiring은 범위 밖 |

## Required after design app arrives

- repository format·lint·typecheck·unit·component·contract·build scripts
- 실제 project `tsconfig`과 dependency graph 기준 전체 typecheck
- framework controller/query/mutation hook tests
- home·annual·task/evidence·search·check/note E2E
- 390px·200% 확대·keyboard·focus·axe
- 승인 디자인과 browser screenshot visual comparison
- static mock가 production real mode로 우발 활성화되지 않는지 build test

## Environment limitations

- 현재 저장소에는 package manifest·lockfile·build toolchain이 없어 project lint/typecheck/build/audit 명령이 없다.
- 프로젝트에는 TypeScript dependency나 `tsconfig`가 없다. 프로젝트를 변경하지 않고 npm cache의 TypeScript `5.9.3` tarball을 임시 디렉터리에 풀어 boundary 파일만 strict 검증했으며, 이는 실제 app 전체 typecheck를 대체하지 않는다.
- Browser plugin은 제공되지 않았다. Playwright cache의 Chromium binary는 `libnspr4.so` 부재로 시작되지 않아 screenshot/interaction 검증을 수행하지 못했다. 시스템 package 설치는 승인 범위 밖이라 진행하지 않았다.
- Codex Security 결과는 프런트 소스 패치의 정적·negative-test 범위에 한정된다. 실제 server session·학교/Assignment/object/property/action 인가, CSRF/CORS, upload sandbox와 retrieval ACL은 backend가 없어 통과로 판정하지 않았다.

위 미실행 항목은 PASS가 아니며 `DESIGN_HANDOFF_PENDING` 또는 `DEPLOYMENT_REQUIRED`로 남는다.
