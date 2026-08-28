import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { Chip } from "@/components/ui/Chip";
import { SourceTag } from "@/components/ui/SourceTag";
import { getTasks } from "@/services/tasksService";
import { useAssignment } from "@/state/AssignmentContext";
import { qk } from "@/state/queryKeys";
import { InfoIcon } from "@/lib/icons";
import { daysUntil, formatFull, formatShort } from "@/lib/dates";
import type { TaskInstance } from "@/domain/types";

type AiGamMode = "overview" | "document" | "compare" | "draft" | "question";

const QUICK_ACTIONS: Array<{ mode: Exclude<AiGamMode, "question">; label: string }> = [
  { mode: "overview", label: "업무 감 잡기" },
  { mode: "document", label: "공문 읽기" },
  { mode: "compare", label: "작년과 비교" },
  { mode: "draft", label: "초안 만들기" },
];

function buildAnswer(mode: AiGamMode, task?: TaskInstance, question?: string) {
  const due = task ? formatFull(task.officialDueDate) : "현재 업무의 공식 마감일";
  const previous = task ? formatShort(task.previousActualDate) : "전년도 처리 기록";
  const start = task ? formatShort(task.recommendedStartDate) : "권장 준비 시점";
  const title = task?.title ?? "현재 업무";
  const remaining = task ? daysUntil(task.officialDueDate) : null;

  if (mode === "document") return { heading: "AI 감이 해야 할 일만 정리했어요 🍊", summary: `${title}와 관련된 공문·매뉴얼을 기준으로 확인할 항목입니다.`, sections: [{ title: "확인할 일", content: "담당 항목을 대조하고, 제출 전 검토 일정을 확보하세요." }, { title: "공식 마감", content: due }, { title: "관련 자료", content: "현재 공문과 업무 매뉴얼은 근거 연결에서 확인할 수 있습니다." }] };
  if (mode === "compare") return { heading: "AI 감이 작년 기록과 비교했어요 🍊", summary: "최신 공식 지침을 우선으로 확인하세요.", sections: [{ title: "올해 확인할 점", content: `공식 마감은 ${due}입니다.` }, { title: "작년 우리 학교", content: `실제 처리는 ${previous}에 기록되어 있습니다.` }, { title: "확인 필요", content: "전년도 양식과 올해 공문이 다르면 올해 공문 기준으로 진행하세요." }] };
  if (mode === "draft") return { heading: "AI 감이 초안 준비를 도와드려요 🍊", summary: "아래 항목을 바탕으로 필요한 문서 초안을 만들 수 있습니다.", sections: [{ title: "먼저 정할 것", content: "기안문, 안내문, 체크리스트, 계획서 중 만들 문서를 선택하세요." }, { title: "반영할 정보", content: `공식 마감 ${due}, 전년도 처리 ${previous}` }, { title: "검토", content: "AI가 생성한 초안은 최종 제출 전 담당자가 확인해야 합니다." }] };
  if (mode === "question") return { heading: "AI 감이 정리했어요 🍊", summary: question || "현재 업무를 기준으로 정리했습니다.", sections: [{ title: "지금 할 일", content: `권장 준비 시점은 ${start}입니다. 현재 필요한 자료와 담당 항목을 먼저 확인하세요.` }, { title: "언제까지", content: remaining === null ? due : `${due} · ${remaining}일 남음` }, { title: "작년에는", content: `${previous}에 실제 처리 기록이 있습니다.` }] };
  return { heading: "AI 감이 업무 흐름을 정리했어요 🍊", summary: task?.rationale || `${title}의 일정과 근거를 함께 확인하세요.`, sections: [{ title: "지금 할 일", content: `권장 준비 시작일은 ${start}입니다.` }, { title: "공식 마감", content: due }, { title: "작년 우리 학교", content: `${previous}에 실제 처리했습니다.` }] };
}

export function AssistantPanel({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const { activeAssignmentId } = useAssignment();
  const [mode, setMode] = useState<AiGamMode | null>(null);
  const [question, setQuestion] = useState("");
  const tasksQuery = useQuery({ queryKey: qk.tasks(activeAssignmentId ?? ""), queryFn: ({ signal }) => getTasks(activeAssignmentId ?? "", signal), enabled: !!activeAssignmentId });
  const task = tasksQuery.data?.find((item) => item.id === taskId) ?? tasksQuery.data?.[0];
  const answer = mode ? buildAnswer(mode, task, question) : null;

  useEffect(() => {
    setMode(null);
    setQuestion("");
  }, [taskId]);

  function askQuestion() { if (question.trim()) setMode("question"); }

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
          {QUICK_ACTIONS.map((action) => <button key={action.mode} type="button" className="ai-action" aria-pressed={mode === action.mode} onClick={() => setMode(action.mode)}>{action.label}</button>)}
        </div>
        {answer ? <section className="ai-answer" aria-live="polite">
          <span className="ai-answer-label">AI 감</span><h3>{answer.heading}</h3><p className="ai-answer-summary">{answer.summary}</p>
          <div className="ai-answer-sections">{answer.sections.map((section) => <div key={section.title}><strong>{section.title}</strong><p>{section.content}</p></div>)}</div>
          <div className="ai-sources" aria-label="답변 근거"><span>근거</span><SourceTag type="official" /><SourceTag type="school_case" /><Chip tone="gam">선생님들의 감</Chip></div>
        </section> : <div className="ai-suggestions"><span>이렇게 물어보세요</span><button type="button" onClick={() => { setQuestion("지금 내가 해야 할 게 뭐야?"); setMode("question"); }}>지금 내가 해야 할 게 뭐야?</button><button type="button" onClick={() => { setQuestion("작년이랑 달라진 점 알려줘"); setMode("question"); }}>작년이랑 달라진 점 알려줘</button><button type="button" onClick={() => { setQuestion("다른 선생님들은 어떻게 했어?"); setMode("question"); }}>다른 선생님들은 어떻게 했어?</button></div>}
        <div className="notice info ai-disclaimer"><InfoIcon /><span>AI 감은 근거를 정리·비교합니다. <strong>최종 판단은 담당자가 합니다.</strong></span></div>
      </div>
    </Panel>
  );
}
