import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { getTasks } from "@/services/tasksService";
import { askAssistant } from "@/services/assistantService";
import { useAssignment } from "@/state/AssignmentContext";
import { qk } from "@/state/queryKeys";
import { InfoIcon } from "@/lib/icons";
import { formatFull } from "@/lib/dates";
import { getSafeErrorMessage } from "@/services/errorPresentation";

const QUICK_ACTIONS = [
  { label: "업무 감 잡기", question: "이 업무에서 지금 먼저 해야 할 일을 근거와 함께 알려줘." },
  { label: "공문 읽기", question: "이 업무와 관련된 공문에서 꼭 확인할 내용을 정리해줘." },
  { label: "작년과 비교", question: "이 업무를 작년에는 어떤 순서로 처리했는지 알려줘." },
  { label: "초안 만들기", question: "이 업무를 진행하기 위한 체크리스트 초안을 근거와 함께 제안해줘." },
] as const;

export function AssistantPanel({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const { context } = useAssignment();
  const [question, setQuestion] = useState("");
  const tasksQuery = useQuery({
    queryKey: context ? qk.tasks(context) : ["tasks", "disabled"],
    queryFn: ({ signal }) => getTasks(context!, signal),
    enabled: !!context,
  });
  const task = tasksQuery.data?.find((item) => item.id === taskId) ?? tasksQuery.data?.[0];
  const mutation = useMutation({
    mutationFn: (input: string) => {
      if (!context || !task) throw new Error("질문할 업무 맥락을 확인해 주세요.");
      return askAssistant(context, input, task.id);
    },
  });

  useEffect(() => {
    setQuestion("");
    mutation.reset();
    // mutation identity is intentionally excluded; reset only when task changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  function submit(input: string) {
    const normalized = input.trim();
    if (normalized && !mutation.isPending) mutation.mutate(normalized);
  }

  return (
    <Panel titleId="ai-gam-panel-title" title="AI 감" onClose={onClose} footer={
      <form className="ai-question" onSubmit={(event) => { event.preventDefault(); submit(question); }}>
        <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="이 업무에서 궁금한 점을 물어보세요." aria-label="AI 감에게 질문하기" />
        <button className="btn ai-submit" type="submit" disabled={!question.trim() || !task || mutation.isPending}>{mutation.isPending ? "확인 중" : "묻기"}</button>
      </form>
    }>
      <div className="ai-gam-panel">
        <p className="ai-gam-lead">현재 업무의 실제 백엔드 문서 범위에서 답을 확인합니다.</p>
        {task && <div className="ai-context"><span>현재 업무</span><strong>{task.title}</strong><small>{task.category} · 공식 마감 {formatFull(task.officialDueDate)}</small></div>}
        <div className="ai-actions" aria-label="AI 감 빠른 질문">
          {QUICK_ACTIONS.map((action) => <button key={action.label} type="button" className="ai-action" disabled={!task || mutation.isPending} onClick={() => { setQuestion(action.question); submit(action.question); }}>{action.label}</button>)}
        </div>

        {mutation.isPending && <div className="ai-suggestions" role="status"><span>백엔드에서 근거 문서를 확인하고 있습니다…</span></div>}
        {mutation.isError && <div className="notice" role="alert"><InfoIcon /><span><strong>답변을 가져오지 못했습니다.</strong> {getSafeErrorMessage(mutation.error)}</span></div>}
        {mutation.data && (
          <section className="ai-answer" aria-live="polite">
            <span className="ai-answer-label">AI 감 · 실 API</span>
            <h3>{mutation.data.grounding === "grounded" ? "근거 문서를 함께 확인했어요" : "확인 가능한 근거가 부족합니다"}</h3>
            <p className="ai-answer-summary">{mutation.data.answer}</p>
            {mutation.data.citations.length > 0 && (
              <div className="ai-answer-sections" aria-label="답변 근거">
                {mutation.data.citations.map((citation) => (
                  <div key={`${citation.documentId}:${citation.evidenceId}`}>
                    <strong>{citation.title ?? citation.documentId}</strong>
                    <p>{citation.page ? `${citation.page}쪽` : "페이지 정보 없음"} · 문서 ID {citation.documentId}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        {!mutation.data && !mutation.isPending && !mutation.isError && <div className="ai-suggestions"><span>위의 빠른 질문을 고르거나 직접 물어보세요.</span></div>}
        <div className="notice info ai-disclaimer"><InfoIcon /><span>개인정보를 입력하지 마세요. 외부 AI 사용은 서버의 명시적 허용 없이는 차단되며, <strong>최종 판단은 담당자가 합니다.</strong></span></div>
      </div>
    </Panel>
  );
}
