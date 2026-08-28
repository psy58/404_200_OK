# Test evidence

> 실행 기준: `frontend-api`, Node.js `v22.22.1`, design `9c15191`

| 명령 | 결과 | 범위 |
|---|---|---|
| `npm ci --ignore-scripts` | PASS, 205 packages | 기존 lockfile 복원; package 변경 없음 |
| `npm run typecheck` | PASS | 최종 React UI + V2 service/adapter 전체 strict TypeScript |
| `npm run lint` | PASS with 3 warnings, 0 errors | Fast Refresh 경고 3건: Assignment/Overlay/Toast context export 구조 |
| `npm run build` | PASS | Vite production build, 142 modules, initial JS 310.58 kB (gzip 95.19 kB) + 6 feature overlay chunks/shared modal chunks |
| `node --test --experimental-test-isolation=none tests/api/*.test.js` | PASS, 70/70 | runtime schema, adapter/service, cache/context, cancellation, problem, real transport, mode gate, Assignment version replay |
| `node --check src/api/*.js && node --check tests/api/*.test.js` | PASS | API/test JavaScript syntax |
| `git diff --check` | PASS | whitespace error 없음 |
| credential pattern scan | PASS, match 0 | 대표 AWS/OpenAI/GitHub/private-key 패턴; 값은 출력하지 않음 |
| `npm audit --omit=dev --json` | 2 moderate | React Router 6 advisory 2건; fix는 `react-router-dom@7.18.2` major. dynamic target은 protocol-relative·backslash·control character를 차단하고 SSR hydration은 미사용하지만 upgrade 대체 근거는 아님 |
| `npm audit --json` | 1 high, 3 moderate | Vite/esbuild 개발 서버 advisory + Router. Vite 8 major가 제안되며 패키지 변경 승인 전 미수행 |
| `npm run dev` | sandbox EPERM 후 승인된 loopback 실행 PASS | Vite 5.4.21, `127.0.0.1:5173`, `/home` 200 |
| dev `/src/services/apiClient.ts` 응답 확인 | PASS | development env에 explicit mock opt-in이 주입됨 |
| dev CORS response | PASS for mitigation | `Origin: http://localhost:5173`만 ACAO 반환; `https://evil.example`에는 ACAO 없음. 취약 버전 upgrade의 대체는 아님 |

## 실행일 공식 advisory·지원 대조

| 대상 | 설치·실행 버전 | 공식/registry 근거 | 판정 |
|---|---|---|---|
| React | `18.3.1` | React 공식 RSC advisory는 `react-server-dom-*` 19.x 서버 패키지 경로이며, 현재 SPA에는 해당 패키지·RSC가 없음 | 현재 경로 영향 없음; 일반 dependency 갱신은 별도 승인 |
| React Router | `6.30.6` | GitHub advisory + npm audit: open redirect bypass, SSR hydration constructor injection | `MEDIUM`, major upgrade required; client target validation/CSR-only는 제한적 완화 |
| Vite | `5.4.21` | Vite 공식 supported versions는 6.4/7.3/8.x이며 5.x 지원 종료; npm audit에 High dev-server advisory | `HIGH RELEASE BLOCKER`; loopback/CORS 제한은 임시 노출 축소 |
| Node | `22.22.1` | Node v22 LTS line, planned EOL 2027-04-30; official archive에는 더 최신 v22 patch 존재 | 지원 중이나 실행환경 patch 갱신 권고 |

확인 URL: React security blog `https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components`, React Router security advisories `https://github.com/remix-run/react-router/security/advisories`, Vite releases `https://vite.dev/releases`, Vite advisories `https://github.com/vitejs/vite/security/advisories`, Node releases `https://nodejs.org/en/about/previous-releases`.

## Browser limitation

Browser plugin은 제공되지 않았고 프로젝트에 Playwright가 없다. 따라서 `/home → Assignment 전환 → task-ai-week → checklist`, upload/notification disabled 상태의 실제 클릭·screenshot·axe·responsive visual 검증은 PASS로 판정하지 않는다. 다음 마스터 프롬프트나 사용자 브라우저 검증에서 실행해야 한다.

## Backend limitation

mock PASS는 실제 인증·인가·DB·CSRF·upload quarantine·notification persistence·AI retrieval 증거가 아니다. real mode는 확정 OpenAPI operation map이 없으면 요청 전에 중단한다.
