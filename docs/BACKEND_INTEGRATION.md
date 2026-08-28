# 프론트–백엔드 연동

프론트는 `/mocks/backend/*.json` 을 fetch 해 zod 로 검증한 뒤 화면을 그린다.
백엔드가 **같은 경로, 같은 형태**로 실데이터를 응답하므로, 연동에 프론트 코드
수정이 없다. 켜고 끄는 것은 실행 명령뿐이다.

```
npm run dev            정적 mock JSON (백엔드 없이, 지금까지와 동일)
npm run dev:backend    /mocks/backend/* 를 백엔드로 프록시 → 실데이터
```

## 백엔드 띄우기

```bash
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m uvicorn app.main:app --reload   # http://localhost:8000
```

데이터 산출물(`backend/data/`)이 없으면 목록이 비어서 나온다. 산출물을 만드는
방법은 `backend/README.md` 의 인제스트 절차 참고 (원본 공문은 개인정보라
저장소에 없다 — 백엔드 담당자에게 받는다).

## 경로 대응

| 프론트가 fetch 하는 경로 | 백엔드 응답 (동일 형태) | 데이터 출처 |
|---|---|---|
| `/mocks/backend/assignments.json` | 동일 경로 + `/api/frontend/assignments` | 워크플로 자동 생성 결과 |
| `/mocks/backend/tasks.json` | 〃 `/api/frontend/tasks` | 공문 1,088건 → 업무 32개 |
| `/mocks/backend/task-details/{id}.json` | 〃 `/api/frontend/task-details/{id}` | 단계·근거 문서·작년 타임라인 |
| `/mocks/backend/feed.json` | 〃 `/api/frontend/feed` | 최근 접수 공문 |
| `/mocks/backend/documents.json` | 〃 `/api/frontend/documents` | 공문 분석 결과 |
| `/mocks/backend/notifications.json` | 〃 `/api/frontend/notifications` | "다음 할 일" 단계에서 파생 |
| `/mocks/backend/experience-notes.json` | 〃 (빈 목록) | 저장 기능 전까지 비움 |

응답 형태의 기준은 `src/domain/raw-schemas.ts`(zod)다. 백엔드는
`backend/app/models/frontend.py` 로 같은 형태를 강제하고,
`backend/tests/test_frontend_api.py` 가 어긋남을 잡는다.
**zod 를 바꾸는 PR은 그 두 파일도 함께 바꾼다.**

## BACKEND_CONTRACT_REQUIRED 표식별 상태

| 표식 위치 | 상태 |
|---|---|
| AssistantPanel (F14 AI Q&A) | **연결됨** — 패널이 `POST /api/v1/query` 를 호출한다(`src/services/assistantService.ts`). `npm run dev:backend` 에서 실제 답변·근거·진행 흐름이 나오고, mock 모드에서는 연결 안내 오류가 뜬다 |
| SearchBox 서버 검색 | `/api/v1/query` 의 검색이 대신함. 클라이언트 필터로도 당장은 충분 |
| 체크리스트 저장 | 미구현 — `POST /api/v1/workflows/{id}/steps/{step_id}/complete` 가 준비돼 있으니 task-detail 연동 시 교체 |
| 경험 노트 저장 | 미구현 (빈 목록으로 정직하게 응답) |
| 알림 읽음 영속화 | 미구현 |
| 업로드 | 미구현 |

## 근거 법령 (공문 → 매뉴얼 → 법령 연결)

공문 본문의 「법령」 인용을 뽑아 국가법령정보센터(law.go.kr) 한글주소로 잇는다.
법령 77종 중 66종은 한글주소 실존을 확인했고, 나머지는 통합검색 링크다
(개정·폐지된 옛 이름). 대장은 `docs/STATUTES.md`.

- 업무 상세의 `evidence_chain` 에 `level: "근거 법령"` 항목으로 실려 온다.
  이 항목에는 `url`(optional)이 있고, EvidenceChain 이 새 탭 링크로 그린다.
- 문서별 조회: `GET /api/v1/documents/{id}/statutes` (인용 없으면 빈 목록)
- 대장 전체: `GET /api/v1/statutes`
- 재생성: `python scripts/build_statutes.py --verify` (법령 이름만 조회하며,
  문서 본문은 어디에도 보내지 않는다)

## AI 질의 (업무 도우미 패널 활성화용)

```
POST /api/v1/query
{ "query": "이 업무 다음에 뭐 해야 하나요?", "workflow_id": "wf_1d9f9dedc5" }
→ { "message": "...", "data": { "documents": [...], "timeline": [...], ... } }
```

응답 형태 전체는 `docs/API.md`, 예시는 `docs/mock/query.response.json`.
이 엔드포인트는 OpenAI 키가 필요하다(`backend/.env`). 키·데이터가 없으면
예시 응답으로 동작하므로 화면 개발은 그것으로 가능하다.
