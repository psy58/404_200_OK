# Frontend API Map

> Contract SOT: 서비스 OpenAPI 미제공 — `BACKEND_CONTRACT_REQUIRED`
> Presentation contract: `src/api/ui-api-boundary-v2.ts` (`PROPOSED`)
> Current UI: `gam_dashboard_desktop.html` (`DESIGN_HANDOFF_PENDING`, wiring 전)

| Feature | Route/Surface | Entry component | API service capability | OpenAPI operation | Request/Response | AuthZ | Query key | Error/rollback | Owner/status |
|---|---|---|---|---|---|---|---|---|---|
| Session·Assignment | app shell·assignment modal | 미정 | `getSession`, `setActiveAssignment` | 미정 | `SessionContextVM` | session→school→assignment | `session(user, epoch)` | 401·403·409, switch purge | Codex / proposed |
| Home | `/` 또는 확정 route | 미정 | `getHome` | 미정 | `HomeVM` | assignment | `home(context)` | partial·stale·timeout | Codex / proposed |
| Annual map | `/annual` 또는 확정 route | 미정 | `getAnnualMap` | 미정 | `AnnualMapVM` | assignment·task | `annual(context, year, filter, cursor)` | no-result·pagination | Codex / proposed |
| Task detail | `/tasks/:id` 또는 확정 route | 미정 | `getTaskDetail` | 미정 | `TaskDetailVM` | task·related document | `task(context, id)` | 403·404·stale | Codex / proposed |
| Checklist | task detail | 미정 | `updateChecklist` | 미정 | `ChecklistMutation` → `TaskDetailVM` | property·action | task key invalidate | idempotency·409/412 | Codex / proposed |
| Documents | 문서함 | 미정 | `listDocuments` | 미정 | `DocumentListVM` | document·search result | `documents(context, filters)` | 403·404·429·partial | Codex / proposed |
| Search | app shell search | 미정 | `search` | 미정 | `SearchVM` | result·snippet ACL | `search(context, query)` | no-result·cancel | Codex / proposed |
| Experience notes | 선생님들의 감·task detail | 미정 | note list/create/update/delete | 미정 | `ExperienceNotesVM` | visibility·property | `notes(context, filters)` | 409/412·422 | Codex / proposed |
| Upload·analysis | upload modal/route | 미정 | upload/job/review capability | 미정 | `UploadAnalysisVM` | attachment·job·document | `analysis(context, jobId)` | cancel·expired·partial | Codex / backend required |
| Handover | handover preview | 미정 | `getHandoverPreview` | 미정 | `HandoverPreviewVM` | approved records only | `handover(context, year)` | partial·draft exclusion | Codex / proposed |
| Notifications | app shell notification center | 미정 | notification list/read/settings | 미정 | `NotificationCenterVM` | target object reauth | `notifications(context, cursor)` | stale target·dedupe | Codex / P1 backend required |
| Assistant | task detail drawer | 미정 | grounded query capability | 미정 | `AssistantVM` | retrieval ACL | `assistant(context, task, request)` | citation fail-closed | Codex / P2 backend required |

## Real transport activation gate

실제 network transport는 아래 항목이 모두 제공되기 전에는 요청을 보내지 않는다.

1. 서비스 OpenAPI revision과 호환 toolchain
2. capability별 안정적인 `operationId`
3. request/response/Pydantic schema
4. session·CSRF·CORS 계약
5. tenant·object·property·action authorization 결정
6. RFC 9457 또는 실제 problem schema
7. pagination·idempotency·version/ETag 규칙
8. 같은 revision의 contract·negative test
