# Contract conflict and decision ledger

| ID | 영역 | 근거 A | 근거 B | 위험 | 현재 처리 | 필요한 결정 |
|---|---|---|---|---|---|---|
| CONTRACT-001 | Query principal | backend 참고 예시는 request body의 `user_id` 사용 | 시스템 명세·API 통합 프롬프트는 session principal 사용 | 사용자 위조·학교 간 접근 | real transport가 authority field를 요청 body에서 거부 | 인증·session 계약과 OpenAPI 확정 |
| CONTRACT-002 | `next_actions` | Pydantic 예시 `list[str]` | 다른 sample은 `{id,title,status}[]` | runtime schema·UI 파손 | `AssistantVM`과 구조화 task action을 분리, wire DTO 미확정 | 하나의 Pydantic/OpenAPI schema 선택 |
| CONTRACT-003 | aggregate mapping | backend `Workflow/Step/Feedback` | 제품 `TaskInstance/ChecklistItem/ExperienceNote` | ID·version·보존 의미 손실 | UI boundary에서 서로 다른 모델 유지 | aggregate·ID lifecycle·status mapping 확정 |
| CONTRACT-004 | P0 import | 시스템 명세는 metadata-only·본문 제외 | 영상 보충 결정은 파일 전체 upload·분석 P0 | 범위·보안·일정 불일치 | `SPEC_ALIGNMENT_REQUIRED`, backend 없이는 disabled | 정식 명세 변경과 upload/job 계약 |
| CONTRACT-005 | notification | 영상 보충은 실제 P1 기능 | backend 참고 문서에는 capability 없음 | 가짜 unread·local-only state | mock service는 unread 0·disabled | notification operation·timezone·dedupe·retention |
| CONTRACT-006 | Assignment/home/search | 제품 P0 필수 | backend 참고 경로에는 구체 operation 없음 | 프론트 가상 endpoint 고착 | capability만 정의, real transport fail-closed | OpenAPI operationId·schema·error 계약 |
| CONTRACT-007 | file security | P0 full upload | quarantine·MIME/signature·malware·parser sandbox 증거 없음 | 개인정보·악성 파일·DoS | frontend 완료 판정 차단 | backend code·test·운영 증거 |
| CONTRACT-008 | original document | 디자인에 문서/양식 표시 | original URI·download 정책·권한 미정 | 가짜 열기 또는 정보 노출 | `originalAvailable=false` fixture | 문서 원문·download·404/403 정책 |
| CONTRACT-009 | mock baseline | 완료 보고서는 5개 JSON과 SHA-256 기록 | 현재 저장소와 제공 경로에 원본 없음 | 과거 PASS 오인 | 현재 fixture는 새 `mock.1`, `REFERENCE_MISSING` | 원본 파일 제공 또는 새 기준선 승인 |

백엔드 참고 문서는 수정하지 않았다. 위 충돌은 서비스 OpenAPI·Pydantic·contract test가 제공되기 전까지 해결된 것으로 표시하지 않는다.
