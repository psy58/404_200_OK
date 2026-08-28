import { adaptAssistantAnswer } from "@/domain/adapters";
import { RawAssistantAnswerSchema } from "@/domain/raw-schemas";
import type { AssistantAnswer } from "@/domain/types";
import { postApi } from "./mockClient";

/**
 * F14 업무 맥락 기반 AI Q&A — 백엔드 POST /api/v1/query (docs/API.md,
 * docs/BACKEND_INTEGRATION.md). task id가 곧 백엔드의 workflow_id 이므로
 * 그대로 넘기면 그 업무로 한정해 근거 문서·진행 흐름과 함께 답한다.
 *
 * 근거 검색과 답변 생성에 2~5초 걸린다. 호출부는 로딩 상태를 보여 줄 것.
 */
export async function askAssistant(
  question: string,
  taskId?: string,
  signal?: AbortSignal,
): Promise<AssistantAnswer> {
  const raw = await postApi(
    "/api/v1/query",
    { query: question, workflow_id: taskId ?? null },
    RawAssistantAnswerSchema,
    { signal },
  );
  return adaptAssistantAnswer(raw);
}
