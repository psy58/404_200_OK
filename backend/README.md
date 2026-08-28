# 업무 네비게이터

학교 업무 담당자가 "이 업무, 다음에 뭘 해야 하나요?"라고 물으면
다음 할 일과 근거 문서를 돌려주는 서비스.

## 지금 상태

**`/query`가 실제로 답한다.** 업무 문서 1,088건을 변환·색인해 두었고, 질문이
들어오면 두 인덱스에서 근거를 찾아 LLM이 안내 문장을 만든다. 나머지 6개
엔드포인트는 예시 데이터로 동작한다(계약은 확정, v0.2).

벡터 저장소나 API 키가 없으면 `/query`도 예시 응답으로 답한다. 프론트 개발자는
아무것도 준비하지 않아도 서버를 띄울 수 있다.

| 메서드 | 경로 |
|---|---|
| POST | `/api/v1/query` |
| GET | `/api/v1/workflows` |
| GET | `/api/v1/workflows/{workflow_id}` |
| POST | `/api/v1/workflows/{workflow_id}/steps/{step_id}/complete` |
| POST | `/api/v1/workflows/{workflow_id}/feedback` |
| GET | `/api/v1/documents/{document_id}` |
| GET | `/api/v1/documents/{document_id}/chunks/{chunk_id}` |

- 계약 문서: [docs/API.md](docs/API.md)
- 프론트용 Mock 응답: [docs/mock/](docs/mock/)
- OpenAPI 명세: [docs/openapi.json](docs/openapi.json)

단계 완료 처리는 서버가 살아 있는 동안 상태가 실제로 바뀐다.
Mock만으로도 완료 버튼을 눌러 흐름이 다음 단계로 넘어가는 화면까지 확인할 수 있다.

## 실행

```bash
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt   # Windows
.venv/Scripts/python.exe -m uvicorn app.main:app --reload
```

그리고 브라우저에서 **http://localhost:8000** 을 연다. 화면과 API가 같은 서버에서
나가므로 띄울 것은 이것 하나다.

- 화면: http://localhost:8000
- Swagger UI: http://localhost:8000/docs
- 헬스체크: http://localhost:8000/health

## 데스크톱 프로그램

`업무네비게이터.bat`를 두 번 누르면 창이 뜬다. 서버도 브라우저도 필요 없다.

```bash
cd backend
.venv/Scripts/python.exe gui.py
```

[gui.py](backend/gui.py) — Tkinter로 만든 창 하나짜리 프로그램이다.

```
┌──────────────────────────────────────────────┐
│ 질문 [                                ] [질문] │
│ 업무 [ 전체에서 찾기 ▾ ]                        │
├──────────────────────────────────────────────┤
│ 답변                                          │
├───────────────────────┬──────────────────────┤
│ 업무 흐름              │ 근거 문서              │
│  ✓ 학생 모집           │  0.59 지정 신청서      │
│  ▶ 참가 신청  [완료]    │  0.55 지정 계획       │
└───────────────────────┴──────────────────────┘
```

- 업무를 고르면 그 업무 안에서만 찾는다
- 단계를 골라 **완료**를 누르면 다음 단계로 넘어간다(두 번 누르면 되돌린다)
- 근거 문서를 두 번 누르면 원문 창이 열리고 앞뒤 문단으로 이동한다
- 답을 기다리는 2~5초 동안 창이 멎지 않도록 검색과 LLM 호출은 다른 스레드에서 돈다

백엔드는 HTTP를 거치지 않고 서비스 계층을 그대로 부른다. 포트도 서버도 없다.
나중에 백엔드를 다른 컴퓨터에 두게 되면 `gui.py`의 `Backend` 클래스만 HTTP 호출로
바꾸면 된다.

브라우저 창으로 띄우는 판(`desktop.py`, pywebview)도 있다.
`업무네비게이터(브라우저).bat`로 실행하면 아래 웹 화면이 창에 담겨 나온다.

## 웹 화면

`frontend/`에 있다. 빌드 도구가 없다 — HTML·CSS·JS 파일 세 개를 백엔드가 그대로
내보낸다. 고치고 새로고침하면 바로 반영된다.

| 화면 | 하는 일 |
|---|---|
| 질문 상자 | `POST /query`. Enter로 보내고, 답이 올 때까지 걸린 시간을 보여 준다 |
| 왼쪽 업무 목록 | `GET /workflows`. 고르면 그 업무로 한정해 질문한다 |
| 업무 흐름 | 단계별 상태와 완료 버튼(`POST .../complete`). 누르면 다음 단계로 넘어간다 |
| 다음에 할 일 | `data.next_actions` |
| 근거 문서 | 관련도와 발췌. **원문 보기**를 누르면 조각 원문이 열리고 앞뒤 문단으로 이동한다 |
| 실제 업무와 다른가요? | `POST .../feedback`. 예상 흐름과 실제 흐름의 차이를 돌려받아 보여 준다 |

화면은 [docs/API.md](docs/API.md)의 계약으로만 백엔드와 이야기한다. 검색이 어떻게
도는지, 어떤 모델을 쓰는지는 화면이 알지 못한다.

## 테스트

```bash
cd backend
.venv/Scripts/python.exe -m pytest tests -q
```

계약을 바꿨다면 산출물을 다시 만든다. 하지 않으면 테스트가 실패한다.

```bash
cd backend
.venv/Scripts/python.exe scripts/export_contract.py
```

## 문서 인제스트

두 단계로 나눠 돌린다. 가운데에 **Markdown 파일**이 남는 것이 핵심이다.
사람이 열어서 변환 품질을 확인할 수 있고, 조각 크기를 바꿔 가며 2단계만
몇 번이든 다시 돌릴 수 있다.

```
업무목록/**/*          1단계             backend/data/markdown/**/*.md
  (pdf, hwp, hwpx,  ──markitdown──▶     (YAML 머리말 + 본문)
   xlsx, pptx, ...)                            │
                                               │ 2단계
                                          LangChain
                                     (헤더 분할 → 크기 분할)
                                               ▼
                                    backend/data/documents.json
                                               │
                                          문서 조회 API
```

```bash
cd backend
.venv/Scripts/python.exe -m pip install -r requirements-ingest.txt

# 1단계: 모든 문서를 Markdown으로
.venv/Scripts/python.exe scripts/convert_to_markdown.py
.venv/Scripts/python.exe scripts/convert_to_markdown.py --limit 20   # 빠른 확인

# 2단계: Markdown을 LangChain으로 읽어 조각 저장소 만들기
.venv/Scripts/python.exe scripts/build_index.py
```

1단계는 이미 만든 `.md`를 건너뛰므로 중간에 멈춰도 이어서 돌리면 된다
(`--limit`은 새로 변환할 건수, `--overwrite`로 다시 만든다).

### 변환 결과 확인하기

`.md` 파일이 1,088개라 폴더를 뒤져서는 확인이 안 된다. 변환이 끝나면 목록을 만든다.

**[backend/data/markdown/_INDEX.md](backend/data/markdown/_INDEX.md)** ← 이 파일 하나만 열면 된다

- 공문 한 건(본문 + 첨부들)을 묶어서 보여 주고, 각 파일로 바로 열리는 링크가 달려 있다
- 확장자별 건수와 글자 수, 한글 오피스로 변환한 건수
- **확인이 필요한 문서** — 변환 결과가 300자 미만인 파일 (현재 20건)
- **변환하지 못한 문서** — 건너뛴 147건과 실패한 8건을 사유별로 묶어 파일 이름까지 적는다

사유는 담당자가 무엇을 해야 할지 알 수 있는 말로 남긴다.

| 사유 | 건수 | 어떻게 할 수 있나 |
|---|---:|---|
| 오즈리포트 문서(ozd) | 89 | 방법 없음. 한글이나 PDF로 다시 받아야 한다 |
| 이미지(jpg/png) | 30 | OCR을 붙이면 가능 |
| 스캔한 이미지 PDF | 28 | 위와 같음 |
| 파일이 깨짐(확장자와 실제 형식이 다름) | 6 | 원본을 다시 받는다 |
| 암호가 걸린 문서 | 1 | 암호를 풀어 다시 넣는다 |
| markitdown이 다루지 못하는 형식(odt) | 1 | 한글이나 PDF로 변환해 넣는다 |

기록은 `backend/data/conversion_report.json`에도 남는다.
목록만 다시 만들려면 `python scripts/markdown_index.py`.

| 형식 | 처리 |
|---|---|
| pdf, hwpx, xlsx, xls, pptx, docx, html, zip | markitdown ([markit_down_hwpx 포크](https://github.com/llA1ll/markitdown_hwpx) — requirements-ingest.txt가 GitHub에서 바로 설치) |
| hwp (구버전) | 한글 오피스로 HWPX를 만든 뒤 markitdown ([hwp_com.py](backend/app/ingest/hwp_com.py)) |
| ozd, jpg, png | 지원하지 않음. 이유를 남기고 건너뛴다 |

### 구버전 HWP를 한글 오피스로 변환하는 이유

파이썬만으로 HWP를 읽으면 문단 글자만 남아 **표가 문단으로 흩어진다.**
한글 오피스에 맡기면 표가 표로 남고, markitdown이 그것을 Markdown 표로 바꾼다.
업무 문서에는 일정표·예산표가 많아 이 차이가 크다.

필요한 것:

1. Windows + 한글 오피스 설치
2. `pywin32` (requirements-ingest.txt에 들어 있다)
3. **보안 모듈 등록** — 없으면 문서를 열 때마다 대화상자가 떠서 자동화가 멈춘다.
   레지스트리 `HKCU\Software\HNC\HwpAutomation\Modules`에 문자열 값
   `FilePathCheckerModule`을 만들고 `FilePathCheckerModule.dll`의 전체 경로를 넣는다.
   (관리자 권한은 필요 없다.) 이 DLL은 pip 설치에는 딸려 오지 않으므로,
   [markit_down_hwpx 포크](https://github.com/llA1ll/markitdown_hwpx)를 클론해서
   그 안의 것을 쓴다. 한글 오피스 변환을 안 쓰면 이 단계 전체가 필요 없다.

한글이 없는 환경에서는 자동으로 파이썬 변환([hwp_converter.py](backend/app/ingest/hwp_converter.py))으로
물러선다. `--no-hancom`으로 강제할 수도 있다. 어느 쪽으로 변환했는지는 각 `.md`
머리말의 `converted_by`에 남는다.

변환한 HWPX는 원본 폴더가 아니라 `backend/data/hwpx_cache/`에 쌓인다.
`업무목록/`은 읽기만 하고 건드리지 않는다.

> **주의**: 원본 문서와 인제스트 결과에는 학생·교직원 이름과 연락처가 들어 있다.
> `업무목록/`과 `backend/data/`는 `.gitignore`에 있으며 저장소에 올리지 않는다.

## 공문 분석과 문서 연결

학교 공문은 서식이 정해져 있어 기계가 읽을 수 있다.
[official.py](backend/app/ingest/official.py)가 제목·수신·관련·시행·접수·결재일자를 뽑고,
[relations.py](backend/app/ingest/relations.py)가 그것으로 문서를 잇는다.

```bash
cd backend
.venv/Scripts/python.exe scripts/build_relations.py    # OpenAI를 부르지 않는다
```

| 연결 | 근거 | 개수 |
|---|---|---|
| 본문 ↔ 첨부 | 파일 이름의 문서번호가 같다 | 604 |
| 관련 (앞선 문서) | 본문 "1. 관련"의 번호 = 다른 문서의 시행·접수 번호 | 50 |
| 후속 (뒤따른 문서) | 위 연결을 반대 방향에서 본 것 | 50 |
| 같은 사업 (**추정**) | 요약 임베딩 유사도 0.78 이상 | 445 |
| 후속 (**추정**) | 받은 공문 뒤 30일 안의 기안 문서, 유사도 0.65 이상 | 14 |

앞의 셋은 문서번호로 이은 것이라 확실하고, 뒤의 둘은 내용과 날짜로 추정한 것이다
([similarity.py](backend/app/ingest/similarity.py)). 추정 연결에는 유사도 점수가 함께
담기므로 화면에서 구분해 보여 줄 수 있다. 이미 만들어 둔 요약 임베딩을 쓰므로 추가
비용은 들지 않는다.

유사도 기준값도 실제 문서로 재서 정했다.

| 유사도 | 무엇이 걸리나 |
|---|---|
| 0.85 이상 | 같은 사업의 회차 문서 (토요과학교실 1차 / 2차 / 3차) |
| 0.70~0.75 | 같은 종류의 다른 사업 (이 사업 강사비 ↔ 저 사업 강사비) |
| 0.62~0.65 | 같은 분야일 뿐 (토요과학교실 ↔ 반일제 체험 협의회비) |

같은 사업만 묶으려면 0.78 위로 잡아야 한다. `--no-suggest`로 추정 연결을 뺄 수 있다.

문서 1,088건 중 473건이 공문 서식을 갖췄고(시행 번호 있음), 502건에서 결재일자를 읽었다.
관련 참조 296건 중 50건이 우리가 가진 문서로 이어진다. 나머지는 우리가 받은 적 없는
다른 기관 문서를 가리킨다.

이 연결이 곧 업무의 흐름이다. 실제로 이어진 사슬:

```
[2025-08-18] 받음  AI·정보교육 중심학교 2차 공모 선정 결과
└─▶ [2025-08-20] 받음  중심학교 운영비 교부
    └─▶ [2025-09-19] 기안  예산 및 운영 계획서
```

결재자·담당자 이름은 뽑지 않는다. 문서를 잇는 데 필요하지 않고, 이 정보는 본문보다
여러 곳으로 퍼진다.

## 검색 (RAG)

인덱스를 둘로 나눈다.

| 인덱스 | 무엇을 담나 | 모델 | 이유 |
|---|---|---|---|
| Summary Index | 문서 한 건당 요약 하나 (약 1,100개) | `text-embedding-3-large` | 개수가 적고, "이 문서가 무슨 업무인가"를 가려내는 자리라 품질이 중요 |
| Chunk Index | 조각 본문 (약 7,300개) | `text-embedding-3-small` | 개수가 많고, 이미 좁혀진 문서 안에서 근거를 찾는 자리라 비용이 중요 |

검색은 두 단계다.

```
질문
 ├─ 1단계  Summary Index에서 관련 문서 10건을 고른다
 └─ 2단계  그 문서들 안에서만 Chunk Index를 뒤져 근거 조각을 뽑는다
```

조각만 뒤지면 업무가 전혀 다른 문서에 우연히 비슷한 문장이 있을 때 그 조각이
근거로 올라온다. 문서를 먼저 고르면 그런 일이 줄어든다.

```bash
cd backend
.venv/Scripts/python.exe -m pip install -r requirements-rag.txt
cp .env.example .env          # OPENAI_API_KEY 를 채운다

# 문서 요약 만들기 (Summary Index의 재료)
.venv/Scripts/python.exe scripts/build_summaries.py --dry-run   # 요금 먼저 확인
.venv/Scripts/python.exe scripts/build_summaries.py

# 두 인덱스 만들기
.venv/Scripts/python.exe scripts/build_embeddings.py --dry-run
.venv/Scripts/python.exe scripts/build_embeddings.py

# 검색해 보기
.venv/Scripts/python.exe scripts/search.py "과학대회 참가 신청 서류가 뭔가요"
```

돈이 드는 단계라 모든 스크립트에 `--dry-run`이 있다. 무엇을 몇 개, 얼마에
처리할지 먼저 보여 준다. 이미 만든 요약·벡터는 건너뛰므로 중간에 끊겨도
다시 돌리면 이어서 한다.

> **주의**: 이 단계에서 문서 본문이 OpenAI로 전송된다. 요약 프롬프트에는
> 사람 이름과 연락처를 넣지 말라고 지시해 두었지만, 조각 임베딩은 본문
> 그대로를 보낸다.

### 폴더 이름이 ASCII인 이유

chromadb는 Windows에서 **경로에 한글이 있으면 색인 파일을 쓰지 못한다.**
기록은 sqlite에 남지만 색인이 없어, 다음에 열 때 `Error loading hnsw index`로
읽지 못한다. 그래서 프로젝트 폴더를 `02_hackathon`으로 두고, 벡터 저장소는
`backend/data/vectors`에 그대로 쌓는다.

한글 경로 아래로 옮겨야 한다면 `.env`의 `VECTOR_DIR`에 ASCII 경로를 지정한다.
지정하지 않으면 `%LOCALAPPDATA%\work-navigatorectors`로 자동으로 비켜 간다.

## /query 가 답을 만드는 흐름

```
질문
 ├─ 검색   두 인덱스에서 근거 조각 5개            → data.documents
 ├─ 업무   요청의 workflow_id, 없으면 임베딩으로 추정 → data.workflow / stage / next_actions
 └─ 문장   LLM이 근거만 읽고 설명을 쓴다           → message
```

업무 추정([workflow_matcher.py](backend/app/services/workflow_matcher.py))은 업무 설명과
단계 이름을 각각 임베딩해 두고 질문과의 코사인 유사도로 고른다. 업무 점수는
"업무 설명과의 유사도"와 "그 업무 단계 중 가장 가까운 단계와의 유사도" 중 큰 값이다.
업무 이름은 안 나오고 단계 이름만 나오는 질문("강사비 지출할 때 서류가...")이 흔해서다.

유사도가 0.40에 못 미치면 **아무 업무도 붙이지 않는다**. 엉뚱한 업무를 붙이면 화면에
잘못된 다음 단계가 뜨는데, 그건 업무를 못 찾은 것보다 나쁘다. 실제 질문으로 재 보면
관련 질문은 0.42~0.86, 무관한 질문은 0.11~0.37이다.

질문이 가리키는 단계는 진행 상태와 별개로 다룬다. 담당자가 아직 오지 않은 단계를
미리 물어보면, `next_stage`(진행 상태)는 그대로 두고 `next_actions` 맨 앞에 그 단계를 올린다.

구조화 정보(`data`)는 애플리케이션이 채우고 자연어 설명(`message`)만 LLM이 만든다.
근거를 하나도 못 찾으면 LLM을 부르지 않고 "관련 문서를 찾지 못했습니다"라고 답한다.
근거 없이 그럴듯한 문장을 지어내는 것이 이 서비스에서 가장 나쁜 실패이기 때문이다.
LLM 호출이 실패해도 근거 문서는 그대로 돌려준다.

응답은 2~5초 걸린다. 계약 15항의 SSE 스트리밍을 검토할 근거가 된다.

## 구조

```
02_hackathon/
├── backend/
│   ├── app/
│   │   ├── api/v1/        API Layer   - 경로와 상태 코드만 담당
│   │   ├── services/      Application - 지금은 예시 데이터, 이후 LangGraph / DB
│   │   ├── ingest/        1단계 converter, 2단계 splitter, 공문 분석 official/relations
│   │   ├── rag/           요약(summarizer), 임베딩(embedder), 두 인덱스(store), 검색(retriever)
│   │   ├── models/        요청·응답 계약 (Pydantic)
│   │   ├── settings.py    .env 읽기
│   │   └── errors.py      에러 응답 형태 통일
│   ├── scripts/           계약 산출물, 인제스트 2단계, 요약·임베딩·검색
│   ├── data/              markdown/, documents.json, summaries.json, vectors/ (올리지 않음)
│   └── tests/             계약·인제스트 회귀 테스트
│   ├── gui.py             데스크톱 프로그램 (Tkinter)
│   └── desktop.py         같은 화면을 창으로 (pywebview)
├── frontend/              웹 화면 (index.html, app.js, style.css — 빌드 없음)
├── docs/                  API.md, openapi.json, mock/
└── 업무목록/               기안·접수 문서 원본 (올리지 않음)

문서 → Markdown 변환기는 별도 저장소
[markit_down_hwpx](https://github.com/llA1ll/markitdown_hwpx)이며,
`requirements-ingest.txt`가 GitHub에서 바로 설치한다.
```

`app/services/` 안쪽이 LangGraph와 Workflow DB로 바뀌어도 `app/models/`의 계약과
프론트 코드는 그대로 유지된다. 이것이 계층을 나눈 이유다.

## 다음에 할 일

1. 문서 사슬에서 업무 흐름을 뽑아내 `workflow_service`의 예시 2건을 대체하기
   (`data/relations.json`이 입력). 업무가 늘면 추정 기준값(0.40)을 다시 재야 한다
4. 문서 목록 조회 API 추가 검토 — 인제스트한 문서를 프론트에서 찾아볼 방법이 아직 없다
5. 미확정 항목 확정: 인증, 원본 파일 다운로드, SSE 스트리밍 ([docs/API.md](docs/API.md) 참고)
