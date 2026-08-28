import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { Chip } from "@/components/ui/Chip";
import { getTasks } from "@/services/tasksService";
import { useAssignment } from "@/state/AssignmentContext";
import { qk } from "@/state/queryKeys";
import { InfoIcon } from "@/lib/icons";
import { daysUntil, formatFull, formatShort } from "@/lib/dates";

/**
 * F14 업무 맥락 기반 AI Q&A — P2, boundary-only stub. Per docs/01 F14 and
 * docs/06 §9.11, this stays disabled input + suggested prompts until a
 * grounded-answer backend contract exists (BACKEND_CONTRACT_REQUIRED).
 */
export function AssistantPanel({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const { activeAssignmentId } = useAssignment();
  const tasksQuery = useQuery({
    queryKey: qk.tasks(activeAssignmentId ?? ""),
    queryFn: ({ signal }) => getTasks(activeAssignmentId ?? "", signal),
    enabled: !!activeAssignmentId,
  });
  const task = tasksQuery.data?.find((t) => t.id === taskId) ?? tasksQuery.data?.[0];

  return (
    <Panel
      titleId="assistant-panel-title"
      title="업무 도우미"
      onClose={onClose}
      footer={
        <>
          <div className="search" style={{ flex: 1, height: 40 }}>
            <input placeholder="이 업무에 대해 질문하기" aria-label="질문 입력" disabled />
          </div>
          <button className="btn btn-primary" disabled>
            질문
          </button>
        </>
      }
    >
      <div style={{ padding: "22px 24px" }}>
        <p className="t-cap" style={{ marginTop: -4, marginBottom: 20 }}>
          현재 업무 맥락 안에서만 답합니다. 근거 문서 없이 답하지 않습니다.
        </p>
        {task && (
          <>
            <span className="eyebrow">지금 이 업무</span>
            <div className="mini-note" style={{ marginTop: 10 }}>
              <Chip tone="navy">{task.category}</Chip>
              <p style={{ fontWeight: 640 }}>{task.title}</p>
              <span className="mf">
                공식 마감 {formatFull(task.officialDueDate)} · 작년 처리 {formatShort(task.previousActualDate)} · 남은
                기간 {daysUntil(task.officialDueDate)}일
              </span>
            </div>

            <span className="eyebrow" style={{ display: "block", marginTop: 24 }}>
              먼저 확인할 것
            </span>
            <div style={{ marginTop: 10 }}>
              <button className="sugg" disabled>
                작년 우리 학교는 이 업무를 어떻게 처리했나요?
                <span className="sm">근거 · 학교사례 문서 연결 예정</span>
              </button>
              <button className="sugg" disabled>
                올해 지침에서 달라진 부분만 알려주세요
                <span className="sm">근거 · 공식지침 문서 연결 예정</span>
              </button>
              <button className="sugg" disabled>
                지금 온 공문에서 제가 해야 할 일만 뽑아주세요
                <span className="sm">근거 · 접수 공문 연결 예정</span>
              </button>
            </div>
          </>
        )}

        <div className="notice info" style={{ marginTop: 24 }}>
          <InfoIcon />
          <span>
            도우미는 문서를 정리하고 제안합니다. <strong>판단과 승인은 담당자가 합니다.</strong> 답변에는 항상 사용한
            근거 문서가 함께 표시됩니다. 질문 기능은 준비 중입니다.
          </span>
        </div>
      </div>
    </Panel>
  );
}
