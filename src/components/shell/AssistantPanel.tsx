import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { Chip } from "@/components/ui/Chip";
import { SourceTag } from "@/components/ui/SourceTag";
import { askAssistant } from "@/services/assistantService";
import { useSelectedTasks } from "@/state/useSelectedTasks";
import { InfoIcon } from "@/lib/icons";
import { formatFull } from "@/lib/dates";

type AiGamMode = "overview" | "document" | "compare" | "draft" | "question";

const QUICK_ACTIONS: Array<{ mode: Exclude<AiGamMode, "question">; label: string; question: string }> = [
  { mode: "overview", label: "업무 감 잡기", question: "이 업무가 어떤 흐름으로 진행되는지 정리해줘" },
  { mode: "document", label: "공문 읽기", question: "관련 공문에서 내가 해야 할 일만 뽑아줘" },
  { mode: "compare", label: "작년과 비교", question: "작년에는 어떤 순서로 진행했고 언제 처리했어?" },
  { mode: "draft", label: "초안 만들기", question: "근거 문서를 기준으로 업무 초안에 들어갈 항목을 정리해줘" },
];

const NEW_TASK_ACTIONS: Array<{ mode: Exclude<AiGamMode, "question">; label: string; question: string }> = [
  { mode: "overview", label: "업무 감 잡기", question: "올린 자료를 기준으로 이 업무를 어떻게 진행하면 좋을지 정리해줘" },
  { mode: "document", label: "자료 훑기", question: "올린 자료에서 핵심 내용만 뽑아줘" },
  { mode: "compare", label: "일정 챙기기", question: "올린 자료에 나온 날짜와 기한을 정리해줘" },
  { mode: "draft", label: "서류 챙기기", question: "준비해야 하는 서류를 정리해줘" },
];

const SUGGESTIONS = ["지금 내가 해야 할 게 뭐야?", "작년이랑 달라진 점 알려줘", "다른 선생님들은 어떻게 했어?"];
const NEW_TASK_SUGGESTIONS = ["지금 내가 해야 할 게 뭐야?", "올린 자료 요약해줘", "준비물이 뭐야?"];

export function AssistantPanel({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const { tasks } = useSelectedTasks();
  const [mode, setMode] = useState<AiGamMode | null>(null);
  const [question, setQuestion] = useState("");
  const task = taskId ? tasks.find((item) => item.id === taskId) : undefined;
  const isNewTask = !!taskId && (taskId.startsWith("cust_") || taskId.startsWith("hak-"));
  const actions = isNewTask ? NEW_TASK_ACTIONS : QUICK_ACTIONS;
  const suggestions = isNewTask ? NEW_TASK_SUGGESTIONS : SUGGESTIONS;
  const answer = useMutation({
    mutationFn: ({ prompt, selectedTaskId }: { prompt: string; selectedTaskId?: string }) => askAssistant(prompt, selectedTaskId),
  });

  useEffect(() => {
    setMode(null);
    setQuestion("");
    answer.reset();
    // task 전환 때 이전 답변을 지우되 mutation 객체 변경으로 다시 실행하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  function submitQuestion(prompt: string, nextMode: AiGamMode) {
    const normalized = prompt.trim();
    if (!normalized || answer.isPending) return;
    setQuestion(normalized);
    setMode(nextMode);
    answer.mutate({ prompt: normalized, selectedTaskId: taskId });
  }

  function askQuestion() {
    submitQuestion(question, "question");
  }

  return (
    <Panel titleId="ai-gam-panel-title" title="AI 감" onClose={onClose} footer={
      <form className="ai-question" onSubmit={(event) => { event.preventDefault(); askQuestion(); }}>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={task ? "이 업무에서 궁금한 점을 물어보세요." : "업무에 대해 물어보세요."}
          aria-label="AI 감에게 질문하기"
          disabled={answer.isPending}
        />
        <button className="btn ai-submit" type="submit" disabled={!question.trim() || answer.isPending}>
          {answer.isPending ? "찾는 중" : "묻기"}
        </button>
      </form>
    }>
      <div className="ai-gam-panel">
        <p className="ai-gam-lead">
          {task
            ? isNewTask
              ? "새로 추가한 업무예요. 올려 둔 자료 안에서 찾아 답해요."
              : "지금 보고 있는 업무의 문서 안에서 찾아 답해요."
            : "선택한 담당 업무 전체의 공문에서 찾아 답해요."}
        </p>
        {task && <div className="ai-context"><span>현재 업무</span><strong>{task.title}</strong><small>{task.category} · 공식 마감 {formatFull(task.officialDueDate)}</small></div>}
        <div className="ai-actions" aria-label="AI 감 빠른 질문">
          {actions.map((action) => <button key={action.mode} type="button" className="ai-action" aria-pressed={mode === action.mode} disabled={answer.isPending} onClick={() => submitQuestion(action.question, action.mode)}>{action.label}</button>)}
        </div>
        {answer.isPending ? <section className="ai-answer" aria-live="polite"><span className="ai-answer-label">AI 감</span><h3>답변 근거를 찾고 있어요</h3><p className="ai-answer-summary">현재 업무의 문서와 처리 흐름을 확인하고 있습니다.</p></section> : answer.isError ? <div className="notice" role="alert"><InfoIcon /><span>{(answer.error as Error).message}</span></div> : answer.data ? <section className="ai-answer" aria-live="polite">
          <span className="ai-answer-label">AI 감</span><h3>AI 감이 근거를 정리했어요 🍊</h3><p className="ai-answer-summary" style={{ whiteSpace: "pre-wrap" }}>{answer.data.message}</p>
          <div className="ai-answer-sections">
            {answer.data.sources.length > 0 && <div><strong>근거 문서</strong><p>{answer.data.sources.map((source) => source.title).join(" · ")}</p></div>}
            {answer.data.timeline.length > 0 && <div><strong>처리 흐름</strong><p>{answer.data.timeline.map((entry) => `${entry.title}${entry.date ? ` (${entry.date})` : ""}`).join(" → ")}</p></div>}
            {answer.data.nextActions.length > 0 && <div><strong>다음 할 일{answer.data.nextStage ? ` · 지금 단계: ${answer.data.nextStage}` : ""}</strong>{answer.data.nextActions.map((action, index) => <p key={action.stepId ?? index}>{index + 1}. {action.title}{action.description ? ` — ${action.description}` : ""}</p>)}</div>}
          </div>
          {answer.data.sources.length > 0 && <div className="ai-sources" aria-label="답변 근거"><span>근거</span><SourceTag type="official" /><Chip tone="gam">{answer.data.sources.length}건</Chip></div>}
        </section> : <div className="ai-suggestions"><span>이렇게 물어보세요</span>{suggestions.map((prompt) => <button key={prompt} type="button" onClick={() => submitQuestion(prompt, "question")}>{prompt}</button>)}</div>}
        <div className="notice info ai-disclaimer"><InfoIcon /><span>AI 감은 근거를 정리·비교합니다. <strong>최종 판단은 담당자가 합니다.</strong></span></div>
      </div>
    </Panel>
  );
}
