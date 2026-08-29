import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { askAssistant } from "@/services/assistantService";
import { useSelectedTasks } from "@/state/useSelectedTasks";
import { InfoIcon } from "@/lib/icons";
import { formatFull } from "@/lib/dates";
import type { AssistantAnswer } from "@/domain/types";

/**
 * AI 감 — 디자인은 design 브랜치의 "AI 감" 콘셉트, 답변은 백엔드 RAG.
 * 빠른 질문 버튼과 자유 질문 모두 POST /api/v1/query 로 가서, 실제 공문
 * 1,088건에서 근거를 찾아 답한다. 답변에는 근거 문서와 작년 진행 흐름이
 * 함께 온다 (docs/BACKEND_INTEGRATION.md).
 *
 * `npm run dev`(정적 mock 모드)에서는 백엔드가 없어 질문 시 연결 안내가 뜬다.
 */

const QUICK_ACTIONS: Array<{ label: string; question: string }> = [
  { label: "업무 감 잡기", question: "이 업무가 어떤 흐름으로 진행되는지 정리해줘" },
  { label: "공문 읽기", question: "관련 공문에서 내가 해야 할 일만 뽑아줘" },
  { label: "작년과 비교", question: "작년에는 어떤 순서로 진행했고 언제 처리했어?" },
  { label: "서류 챙기기", question: "제출해야 하는 서류와 기한을 정리해줘" },
];

// 직접 추가한 새 업무(cust_) — 작년 기록이 없으니 "작년과 비교"를 묻게 하지 않는다.
// 백엔드도 이 업무는 올려 둔 현재 문서 안에서만 근거를 찾는다.
const NEW_TASK_ACTIONS: Array<{ label: string; question: string }> = [
  { label: "업무 감 잡기", question: "올린 자료를 기준으로 이 업무를 어떻게 진행하면 좋을지 정리해줘" },
  { label: "자료 훑기", question: "올린 자료에서 핵심 내용만 뽑아줘" },
  { label: "일정 챙기기", question: "올린 자료에 나온 날짜와 기한을 정리해줘" },
  { label: "서류 챙기기", question: "준비해야 하는 서류를 정리해줘" },
];

const SUGGESTIONS = ["지금 내가 해야 할 게 뭐야?", "작년이랑 달라진 점 알려줘", "제출 서류가 뭐야?"];
const NEW_TASK_SUGGESTIONS = ["지금 내가 해야 할 게 뭐야?", "올린 자료 요약해줘", "준비물이 뭐야?"];

export function AssistantPanel({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const { tasks } = useSelectedTasks();
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [elapsed, setElapsed] = useState(0);

  // 업무 상세에서 열었을 때만 그 업무로 한정한다. 전역 버튼이면 전체에서 찾는다.
  // 선택한 담당 업무 전체에서 찾으므로 어느 담당 업무의 업무든 맥락이 잡힌다.
  const task = taskId ? tasks.find((item) => item.id === taskId) : undefined;
  // 새 업무: 직접 추가한 업무(cust_)와 학생맞춤통합지원 시연 업무(hak-). 작년 기록이 없다.
  const isNewTask = !!taskId && (taskId.startsWith("cust_") || taskId.startsWith("hak-"));
  const actions = isNewTask ? NEW_TASK_ACTIONS : QUICK_ACTIONS;
  const suggestions = isNewTask ? NEW_TASK_SUGGESTIONS : SUGGESTIONS;

  const mutation = useMutation<AssistantAnswer, Error, string>({
    mutationFn: (q) => askAssistant(q, taskId),
  });

  useEffect(() => {
    if (!mutation.isPending) return;
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 100);
    return () => clearInterval(timer);
  }, [mutation.isPending]);

  useEffect(() => {
    setQuestion("");
    setAsked("");
    mutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || mutation.isPending) return;
    setQuestion(trimmed);
    setAsked(trimmed);
    mutation.mutate(trimmed);
  };

  const answer = mutation.data;

  return (
    <Panel
      titleId="ai-gam-panel-title"
      title="AI 감"
      onClose={onClose}
      footer={
        <form
          className="ai-question"
          onSubmit={(event) => {
            event.preventDefault();
            submit(question);
          }}
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={task ? "이 업무에서 궁금한 점을 물어보세요." : "업무에 대해 물어보세요."}
            aria-label="AI 감에게 질문하기"
            disabled={mutation.isPending}
          />
          <button className="btn ai-submit" type="submit" disabled={!question.trim() || mutation.isPending}>
            {mutation.isPending ? "찾는 중" : "묻기"}
          </button>
        </form>
      }
    >
      <div className="ai-gam-panel">
        <p className="ai-gam-lead">
          {task
            ? isNewTask
              ? "새로 추가한 업무예요. 올려 둔 자료 안에서 찾아 답해요."
              : "지금 보고 있는 업무의 문서 안에서 찾아 답해요."
            : "전체 공문에서 찾아 답해요."}{" "}
          근거 없이 답하지 않아요.
        </p>
        {task && (
          <div className="ai-context">
            <span>현재 업무</span>
            <strong>{task.title}</strong>
            <small>
              {task.category} · 공식 마감 {formatFull(task.officialDueDate)}
            </small>
          </div>
        )}

        <div className="ai-actions" aria-label="AI 감 빠른 질문">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="ai-action"
              aria-pressed={asked === action.question}
              disabled={mutation.isPending}
              onClick={() => submit(action.question)}
            >
              {action.label}
            </button>
          ))}
        </div>

        {mutation.isPending && (
          <div className="notice info" style={{ marginTop: 18 }}>
            <InfoIcon />
            <span>공문에서 근거를 찾아 답을 만드는 중… {elapsed.toFixed(1)}초</span>
          </div>
        )}

        {mutation.isError && !mutation.isPending && (
          <div className="notice" style={{ marginTop: 18 }}>
            <InfoIcon />
            <span>{mutation.error.message}</span>
          </div>
        )}

        {answer && !mutation.isPending ? (
          <section className="ai-answer" aria-live="polite">
            <span className="ai-answer-label">AI 감</span>
            <h3>AI 감이 공문에서 찾아봤어요 🍊</h3>
            <p className="ai-answer-summary" style={{ whiteSpace: "pre-wrap" }}>
              {answer.message}
            </p>

            {answer.timeline.length > 1 && (
              <div className="ai-answer-sections">
                <div>
                  <strong>진행 흐름</strong>
                  {answer.timeline.map((entry, index) => (
                    <p key={index}>
                      {entry.date ?? "날짜 미상"} · [{entry.audience ?? entry.kind}] {entry.title}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {answer.nextActions.length > 0 && (
              <div className="ai-answer-sections">
                <div>
                  <strong>
                    다음 할 일
                    {answer.nextStage ? ` · 지금 단계: ${answer.nextStage}` : ""}
                  </strong>
                  {answer.nextActions.map((action, index) => (
                    <p key={action.stepId ?? index}>
                      {index + 1}. {action.title}
                      {action.description ? ` — ${action.description}` : ""}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {answer.sources.length > 0 && (
              <div className="ai-sources" aria-label="답변 근거">
                <span>근거 {answer.sources.length}건</span>
                {answer.sources.slice(0, 3).map((source) => (
                  <span className="chip" key={`${source.documentId}-${source.chunkId ?? ""}`}>
                    {source.title.length > 24 ? `${source.title.slice(0, 24)}…` : source.title}
                    {source.page ? ` p.${source.page}` : ""}
                  </span>
                ))}
              </div>
            )}
          </section>
        ) : (
          !mutation.isPending && (
            <div className="ai-suggestions">
              <span>이렇게 물어보세요</span>
              {suggestions.map((text) => (
                <button key={text} type="button" onClick={() => submit(text)}>
                  {text}
                </button>
              ))}
            </div>
          )
        )}

        <div className="notice info ai-disclaimer">
          <InfoIcon />
          <span>
            AI 감은 공문에서 근거를 찾아 정리합니다. <strong>최종 판단은 담당자가 합니다.</strong>
          </span>
        </div>
      </div>
    </Panel>
  );
}
