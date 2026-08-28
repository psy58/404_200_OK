# Frontend API Map

> Design SOT: `origin/main` `9c15191`
> Contract SOT: `src/api/ui-api-boundary-v2.ts`
> Service OpenAPI: 미제공 (`BACKEND_CONTRACT_REQUIRED`)

| 기능 | Route/Surface | UI·controller | V2 capability | operationId/endpoint | Query key | 상태 |
|---|---|---|---|---|---|---|
| Session·Assignment | app shell, modal | `AssignmentContext`, `AssignmentModal` | `getSession`, `setActiveAssignment` | 미정 | `session-context`; 전환 뒤 principal key purge | `MOCK_ONLY` |
| Home | `/home` | `HomePage`, `tasksService` | `getHome` | 미정 | `principal/.../task-summaries` | `MOCK_ONLY` |
| Annual map | `/map` | `AnnualMapPage`, `getAnnualTasks` | `getAnnualMap` | 미정 | `annual(context, academicYear)` | `MOCK_ONLY` |
| Task detail | `/tasks/:taskId` | `TaskDetailPage`, `tasksService` | `getTaskDetail` | 미정 | `task(context, taskId)` | `MOCK_ONLY`, fixture 1건 |
| Checklist | task detail | `ChecklistSection`, `checklistService` | `updateChecklist` | 미정 | task key + task summaries invalidate | `MOCK_ONLY`, version/idempotency |
| Documents | `/docs` | `DocumentsPage`, `documentsService` | `listDocuments` | 미정 | `documents(context)` | `MOCK_ONLY` |
| Search | topbar | `SearchBox`, `searchService` | `search` | 미정 | `search(context, query)` | `MOCK_ONLY`, server-shaped search |
| ExperienceNote | `/notes`, task/home modal | `NotesPage`, `NoteComposerModal` | list/create note | 미정 | `notes(context)` | `MOCK_ONLY`, session persistence |
| Handover | `/handover` | `HandoverPage`, `handoverService` | `getHandoverPreview` | 미정 | `handover(context, year)` | `MOCK_ONLY`, read-only |
| Upload·analysis | upload modal | `UploadModal`, `uploadService` | `prepareUpload` | 미정 | `analysis(context, jobId)` | `BACKEND_REQUIRED`, fail-closed |
| Notifications | panel | `NotificationPanel`, `notificationsService` | `getNotifications` | 미정 | `notifications(context)` | `BACKEND_REQUIRED`, unread 0 |
| Assistant | panel | `AssistantPanel` | `queryAssistant` | 미정 | 정의 전 | `BACKEND_REQUIRED`, disabled |

`logout` capability와 cache 선폐기 동작은 framework-independent lifecycle test에 존재하지만, 확정된 인증/logout 계약과 재로그인 route가 없어 final UI에는 가짜 동작으로 노출하지 않았다. 실제 session operation이 확정되면 `AssignmentContext`의 public action과 topbar 사용자 메뉴를 함께 연결해야 한다.

## Runtime/mode 경계

- `.env.development`: 합성 preview에만 `VITE_API_MODE=mock`, `VITE_ALLOW_MOCK=true`
- production: mock 금지. 설정이 없으면 real mode를 선택하지만 확정 OpenAPI service가 없어 network 요청 전에 중단
- UI는 mock/real 분기를 포함하지 않으며 동일 `FrontendApiService`를 사용
- network/mock DTO는 `unknown → runtime parser → V2 adapter → final design adapter` 순서를 거친다.
- app bootstrap header는 `src/main.tsx`, transport/mode 대표 header는 `src/services/apiClient.ts`, `src/api/real-transport.js`, `src/api/mock-service.js`에 있다.
- upload·notification·assistant와 overlay modal은 final UI 진입 시 동적 import되어 초기 shell bundle에 포함되지 않는다.
