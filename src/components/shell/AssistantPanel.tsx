import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui/Panel";
import { Chip } from "@/components/ui/Chip";
import { getTasks } from "@/services/tasksService";
import { askAssistant } from "@/services/assistantService";
import { useAssignment } from "@/state/AssignmentContext";
import { qk } from "@/state/queryKeys";
import { InfoIcon } from "@/lib/icons";
import { daysUntil, formatFull, formatShort } from "@/lib/dates";
import type { AssistantAnswer } from "@/domain/types";

/**
 * F14 업무 맥락 기반 AI Q&A — 백엔드 POST /api/v1/query 에 연결됨.
 * 문서 1,088건을 색인한 검색이 근거를 찾고, 답변에는 항상 그 근거 문서와
 * 업무 진행 흐름이 함께 온다 (docs/BACKEND_INTEGRATION.md).
 *
 * `npm run dev`(정적 mock 모드)에서는 백엔드가 없으므로 질문 시
 * 연결 안내 오류가 뜬다. 실데이터 확인은 `npm run dev:backend`.
 */

const SUGGESTIONS = [
  { text: "이 업무는 작년에 어떻게 진행됐나요?", hint: "근거 · 작년 공문 흐름" },
  { text: "다음에 해야 할 일이 뭔가요?", hint: "근거 · 진행 단계" },
  { text: "제출해야 하는 서류가 뭔가요?", hint: "근거 · 지침·서식 문서" },
];

export function AssistantPanel({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const { activeAssignmentId } = useAssignment();
  const tasksQuery = useQuery({
    queryKey: qk.tasks(activeAssignmentId ?? ""),
    queryFn: ({ signal }) => getTasks(activeAssignmentId ?? "", signal),
    enabled: !!activeAssignmentId,
  });
  // 업무 상세에서 열었을 때만 그 업무로 한정한다. 전역 버튼(fab)으로 열면
  // 전체 문서에서 찾는다 — 예전엔 첫 업무에 몰래 한정되어 엉뚱한 범위로 답했다.
  const task = taskId ? tasksQuery.data?.find((t) => t.id === taskId) : undefined;

  const [question, setQuestion] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation<AssistantAnswer, Error, string>({
    mutationFn: (q) => askAssistant(q, taskId),
  });

  // 근거 검색 + 답변 생성에 2~5초 걸린다. 멈춘 것처럼 보이지 않게 경과를 보여 준다.
  useEffect(() => {
    if (!mutation.isPending) return;
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 100);
    return () => clearInterval(timer);
  }, [mutation.isPending]);

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || mutation.isPending) return;
    setQuestion(trimmed);
    mutation.mutate(trimmed);
  };

  const answer = mutation.data;

  return (
    <Panel
      titleId="assistant-panel-title"
      title="업무 도우미"
      onClose={onClose}
      footer={
        <>
          <div className="search" style={{ flex: 1, height: 40 }}>
            <input
              ref={inputRef}
              placeholder="이 업무에 대해 질문하기"
              aria-label="질문 입력"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit(question);
              }}
              disabled={mutation.isPending}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={() => submit(question)}
            disabled={mutation.isPending || !question.trim()}
          >
            {mutation.isPending ? "찾는 중" : "질문"}
          </button>
        </>
      }
    >
      <div style={{ padding: "22px 24px" }}>
        <p className="t-cap" style={{ marginTop: -4, marginBottom: 20 }}>
          {task
            ? "현재 업무의 문서 안에서만 답합니다. 근거 문서 없이 답하지 않습니다."
            : "전체 공문에서 찾아 답합니다. 근거 문서 없이 답하지 않습니다."}
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
          </>
        )}

        {mutation.isPending && (
          <div className="notice info" style={{ marginTop: 20 }}>
            <InfoIcon />
            <span>근거 문서를 찾아 답을 만드는 중… {elapsed.toFixed(1)}초</span>
          </div>
        )}

        {mutation.isError && !mutation.isPending && (
          <div className="notice" style={{ marginTop: 20 }}>
            <InfoIcon />
            <span>{mutation.error.message}</span>
          </div>
        )}

        {answer && !mutation.isPending && (
          <>
            <span className="eyebrow" style={{ display: "block", marginTop: 24 }}>
              답변
            </span>
            <div className="mini-note" style={{ marginTop: 10 }}>
              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{answer.message}</p>
            </div>

            {answer.sources.length > 0 && (
              <>
                <span className="eyebrow" style={{ display: "block", marginTop: 20 }}>
                  근거 문서 {answer.sources.length}건
                </span>
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  {answer.sources.map((s) => (
                    <div className="mini-note" key={`${s.documentId}-${s.chunkId ?? ""}`}>
                      <p style={{ fontWeight: 640, fontSize: 13 }}>
                        {s.title}
                        {s.page ? ` · p.${s.page}` : ""}
                        <span className="mf" style={{ marginLeft: 8 }}>
                          관련도 {s.relevance.toFixed(2)}
                        </span>
                      </p>
                      {s.snippet && (
                        <p className="mf" style={{ marginTop: 4 }}>
                          {s.snippet}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {answer.timeline.length > 1 && (
              <>
                <span className="eyebrow" style={{ display: "block", marginTop: 20 }}>
                  이 업무의 진행 흐름
                </span>
                <div className="mini-note" style={{ marginTop: 8 }}>
                  {answer.timeline.map((t, i) => (
                    <p className="mf" key={i} style={{ marginTop: i === 0 ? 0 : 4 }}>
                      {t.date ?? "날짜 미상"} · [{t.audience ?? t.kind}] {t.title}
                    </p>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {!answer && !mutation.isPending && (
          <>
            <span className="eyebrow" style={{ display: "block", marginTop: 24 }}>
              먼저 확인할 것
            </span>
            <div style={{ marginTop: 10 }}>
              {SUGGESTIONS.map((s) => (
                <button className="sugg" key={s.text} onClick={() => submit(s.text)}>
                  {s.text}
                  <span className="sm">{s.hint}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="notice info" style={{ marginTop: 24 }}>
          <InfoIcon />
          <span>
            도우미는 문서를 정리하고 제안합니다. <strong>판단과 승인은 담당자가 합니다.</strong> 답변에는 항상 사용한
            근거 문서가 함께 표시됩니다.
          </span>
        </div>
      </div>
    </Panel>
  );
}
