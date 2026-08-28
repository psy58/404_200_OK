import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { Chip } from "@/components/ui/Chip";
import { SourceTag } from "@/components/ui/SourceTag";
import { getTasks } from "@/services/tasksService";
import { askAssistant } from "@/services/assistantService";
import { useAssignment } from "@/state/AssignmentContext";
import { qk } from "@/state/queryKeys";
import { InfoIcon } from "@/lib/icons";
import { formatFull } from "@/lib/dates";

type AiGamMode = "overview" | "document" | "compare" | "draft" | "question";

const QUICK_ACTIONS: Array<{ mode: Exclude<AiGamMode, "question">; label: string; question: string }> = [
  { mode: "overview", label: "업무 감 잡기", question: "이 업무가 어떤 흐름으로 진행되는지 정리해줘" },
  { mode: "document", label: "공문 읽기", question: "관련 공문에서 내가 해야 할 일만 뽑아줘" },
  { mode: "compare", label: "작년과 비교", question: "작년에는 어떤 순서로 진행했고 언제 처리했어?" },
  { mode: "draft", label: "초안 만들기", question: "근거 문서를 기준으로 업무 초안에 들어갈 항목을 정리해줘" },
];

export function AssistantPanel({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const { activeAssignmentId } = useAssignment();
  const [mode, setMode] = useState<AiGamMode | null>(null);
  const [question, setQuestion] = useState("");
  const tasksQuery = useQuery({ queryKey: qk.tasks(activeAssignmentId ?? ""), queryFn: ({ signal }) => getTasks(activeAssignmentId ?? "", signal), enabled: !!activeAssignmentId });
  const task = tasksQuery.data?.find((item) => item.id === taskId) ?? tasksQuery.data?.[0];
  const answer = useMutation({
    mutationFn: ({ prompt, selectedTaskId }: { prompt: string; selectedTaskId?: string }) => askAssistant(prompt, selectedTaskId),
  });

  useEffect(() => {
    setMode(null);
    setQuestion("");
  }, [taskId]);

  function submitQuestion(prompt: string, nextMode: AiGamMode) {
    const normalized = prompt.trim();
    if (!normalized) return;
    setMode(nextMode);
    answer.mutate({ prompt: normalized, selectedTaskId: task?.id });
  }

  function askQuestion() { submitQuestion(question, "question"); }

  return (
    <Panel titleId="ai-gam-panel-title" title="AI 감" onClose={onClose} footer={
      <form className="ai-question" onSubmit={(event) => { event.preventDefault(); askQuestion(); }}>
        <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="이 업무에서 궁금한 점을 물어보세요." aria-label="AI 감에게 질문하기" />
        <button className="btn ai-submit" type="submit" disabled={!question.trim()}>묻기</button>
      </form>
    }>
      <div className="ai-gam-panel">
        <p className="ai-gam-lead">지금 보고 있는 업무를 기준으로 도와드려요.</p>
        {task && <div className="ai-context"><span>현재 업무</span><strong>{task.title}</strong><small>{task.category} · 공식 마감 {formatFull(task.officialDueDate)}</small></div>}
        <div className="ai-actions" aria-label="AI 감 빠른 질문">
          {QUICK_ACTIONS.map((action) => <button key={action.mode} type="button" className="ai-action" aria-pressed={mode === action.mode} disabled={answer.isPending} onClick={() => submitQuestion(action.question, action.mode)}>{action.label}</button>)}
        </div>
        {answer.isPending ? <section className="ai-answer" aria-live="polite"><span className="ai-answer-label">AI 감</span><h3>답변 근거를 찾고 있어요</h3><p className="ai-answer-summary">현재 업무의 문서와 처리 흐름을 확인하고 있습니다.</p></section> : answer.isError ? <div className="notice" role="alert"><InfoIcon /><span>{(answer.error as Error).message}</span></div> : answer.data ? <section className="ai-answer" aria-live="polite">
          <span className="ai-answer-label">AI 감</span><h3>AI 감이 근거를 정리했어요 🍊</h3><p className="ai-answer-summary">{answer.data.message}</p>
          <div className="ai-answer-sections">
            {answer.data.sources.length > 0 && <div><strong>근거 문서</strong><p>{answer.data.sources.map((source) => source.title).join(" · ")}</p></div>}
            {answer.data.timeline.length > 0 && <div><strong>처리 흐름</strong><p>{answer.data.timeline.map((entry) => `${entry.title}${entry.date ? ` (${entry.date})` : ""}`).join(" → ")}</p></div>}
          </div>
          {answer.data.sources.length > 0 && <div className="ai-sources" aria-label="답변 근거"><span>근거</span><SourceTag type="official" /><Chip tone="gam">{answer.data.sources.length}건</Chip></div>}
        </section> : <div className="ai-suggestions"><span>이렇게 물어보세요</span><button type="button" onClick={() => { const prompt = "지금 내가 해야 할 게 뭐야?"; setQuestion(prompt); submitQuestion(prompt, "question"); }}>지금 내가 해야 할 게 뭐야?</button><button type="button" onClick={() => { const prompt = "작년이랑 달라진 점 알려줘"; setQuestion(prompt); submitQuestion(prompt, "question"); }}>작년이랑 달라진 점 알려줘</button><button type="button" onClick={() => { const prompt = "다른 선생님들은 어떻게 했어?"; setQuestion(prompt); submitQuestion(prompt, "question"); }}>다른 선생님들은 어떻게 했어?</button></div>}
        <div className="notice info ai-disclaimer"><InfoIcon /><span>AI 감은 근거를 정리·비교합니다. <strong>최종 판단은 담당자가 합니다.</strong></span></div>
      </div>
    </Panel>
  );
}
