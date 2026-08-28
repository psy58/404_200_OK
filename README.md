# 404 → 200 OK

학교 업무 담당자가 작년 업무 기록과 근거 문서를 바탕으로 올해의 다음 할 일을
찾도록 돕는 React/FastAPI 웹앱이다.

## Docker Compose 시연 실행

필수 준비:

1. `backend/.env.example`을 참고해 Git에서 제외된 `backend/.env`에
   `OPENAI_API_KEY`를 설정한다. 키를 Dockerfile이나 `compose.yaml`에 넣지 않는다.
2. 이 서버처럼 Docker socket을 직접 사용할 권한이 없으면 아래 명령 앞에
   `sudo`를 붙인다.

```bash
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs -f
```

중지할 때는 다음을 실행한다. named volume의 애플리케이션 데이터는 유지된다.

```bash
docker compose down
```

- 내부 확인: `http://127.0.0.1:8000/`
- 외부 시연: `https://aiteacher01.jps.sc.kr/`
- 헬스체크: `http://127.0.0.1:8000/health`
- API는 host port를 직접 열지 않고 `web` 컨테이너의 `/api/*` reverse proxy만 통한다.

현재 서버 자체에는 cloudflared나 system Nginx가 없다. 별도 게이트웨이의 기존
Cloudflare Tunnel connector(`10.56.76.232`)가 이 호스트의 8000번을 origin으로
사용하므로 기본 web bind는 `0.0.0.0:8000`이다. connector가 같은 호스트로
이전되는 환경에서는 `.env`의 `WEB_BIND_ADDRESS=127.0.0.1`로 제한할 수 있다.

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | 없음 | `backend/.env`에서만 주입하는 OpenAI 키 |
| `WEB_BIND_ADDRESS` | `0.0.0.0` | Docker web host bind 주소 |
| `WEB_PORT` | `8000` | 기존 Cloudflare Tunnel이 연결하는 Docker web host port |
| `DEMO_SEED_ENABLED` | `true` | 실제 산출물이 없을 때 기존 추적 demo fixture 사용 |
| `MAX_UPLOAD_BYTES` | `20971520` | 업로드 한 건의 최대 바이트(기본 20MiB) |

`DEMO_SEED_ENABLED=true`는 해커톤 시연용이다. `backend/data/workflows.json` 등
실제 산출물이 있으면 그것이 우선하며, 산출물이 없을 때만
`public/mocks/backend`의 기존 예시 데이터를 FastAPI가 계약 검증 후 제공한다.
이는 실제 학교 데이터나 실제 AI 검색 결과로 간주하면 안 된다.

OpenAI 키와 vector index가 모두 있으면 `/api/v1/query`가 RAG/LLM을 사용한다.
vector index가 없으면 서버 시작과 비-AI UI는 정상 동작하며, 질의 endpoint는
저장소에 이미 있던 계약 예시 응답을 사용한다.

## 데이터 보존

Compose named volume `aiteacher01-demo_api-data`가 `/app/backend/data`에 연결된다.
다음 runtime 데이터가 컨테이너 재생성 후에도 남는다.

- `user_state.json`: 체크리스트, 경험 노트, 알림 읽음, 직접 추가 업무
- `uploads/`, `markdown/`, `documents.json`: 업로드와 변환 산출물
- `vectors/`, `summaries.json`: RAG index와 요약

원본 `업무목록/`, 로컬 `backend/data/`, `.env` 파일은 Docker build context와
Git에서 제외된다.

## 개발 검증

```bash
npm ci
npm run typecheck
npm run lint
npm run build
node --test tests/api/*.test.js

cd backend
python -m venv .venv
.venv/bin/python -m pip install -r requirements.txt -r requirements-ingest.txt -r requirements-rag.txt
.venv/bin/python -m pytest tests -q --ignore=tests/test_gui.py
```

GUI launcher 테스트는 서버에 `tkinter`가 설치된 경우 별도로 실행한다. Docker 웹/API
시연 경로에는 GUI launcher가 포함되지 않는다.

`frontend/`의 HTML/CSS/JS는 FastAPI 단독 실행용 fallback이다. 최종 Docker 시연 UI는
루트의 React/Vite 앱이며, Nginx가 SPA deep-link fallback과 same-origin API proxy를
담당한다.
