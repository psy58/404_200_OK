import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getTasks, getTaskDetail } from "@/services/tasksService";
import { getExperienceNotes } from "@/services/notesService";
import { useAssignment } from "@/state/AssignmentContext";
import { useOverlay } from "@/state/OverlayContext";
import { qk } from "@/state/queryKeys";
import { LoadingBlock, ErrorState, EmptyState } from "@/components/ui/States";
import { Chip } from "@/components/ui/Chip";
import { SourceTag } from "@/components/ui/SourceTag";
import { DateRail } from "@/components/ui/DateRail";
import { ChecklistSection } from "./ChecklistSection";
import { EvidenceChain } from "./EvidenceChain";
import { PreviousTimeline } from "./PreviousTimeline";
import { ChevronRightIcon, FileIcon } from "@/lib/icons";
import { daysUntil, formatFull } from "@/lib/dates";

export function TaskDetailPage() {
  const { taskId = "" } = useParams();
  const { activeAssignmentId } = useAssignment();
  const { open } = useOverlay();

  const tasksQuery = useQuery({
    queryKey: qk.tasks(activeAssignmentId ?? ""),
    queryFn: ({ signal }) => getTasks(activeAssignmentId ?? "", signal),
    enabled: !!activeAssignmentId,
  });
  const detailQuery = useQuery({
    queryKey: qk.taskDetail(taskId),
    queryFn: ({ signal }) => getTaskDetail(taskId, signal),
    enabled: !!taskId,
  });
  const notesQuery = useQuery({ queryKey: qk.notes(), queryFn: ({ signal }) => getExperienceNotes(signal) });

  if (tasksQuery.isPending || detailQuery.isPending) return <LoadingBlock label="업무 상세를 불러오는 중" />;
  if (tasksQuery.isError) return <ErrorState description={(tasksQuery.error as Error).message} onRetry={() => tasksQuery.refetch()} />;
  if (detailQuery.isError) return <ErrorState description={(detailQuery.error as Error).message} onRetry={() => detailQuery.refetch()} />;

  const task = tasksQuery.data.find((t) => t.id === taskId);
  if (!task) {
    return (
      <div className="stack">
        <Link className="btn btn-ghost btn-sm" to="/home" style={{ alignSelf: "flex-start", marginLeft: -10 }}>
          <span style={{ transform: "rotate(180deg)", display: "flex" }}><ChevronRightIcon /></span> 내 업무 홈
        </Link>
        <EmptyState
          icon={<FileIcon width={20} height={20} />}
          title="이 업무를 찾을 수 없습니다"
          description="삭제되었거나 현재 담당 업무에 속하지 않을 수 있습니다. 업무 홈에서 다시 선택해 주세요."
        />
      </div>
    );
  }

  const detail = detailQuery.data;
  const taskNotes = (notesQuery.data ?? []).filter((n) => n.taskId === task.id);

  return (
    <div className="stack">
      <Link className="btn btn-ghost btn-sm" to="/home" style={{ alignSelf: "flex-start", marginLeft: -10 }}>
        <span style={{ transform: "rotate(180deg)", display: "flex" }}><ChevronRightIcon /></span> 내 업무 홈
      </Link>

      <div className="page-head">
        <div>
          <span className="eyebrow">{task.category}</span>
          <h1 className="t-display" style={{ marginTop: 9 }}>{task.title}</h1>
          <p className="sub">{task.rationale || "이 업무에 대한 별도 참고 사항이 없습니다."}</p>
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <button className="btn btn-quiet" onClick={() => open("note", task.id)}>
            경험 메모 쓰기
          </button>
          <button className="btn btn-primary" onClick={() => open("assistant", task.id)}>
            이 업무 도우미 열기
          </button>
        </div>
      </div>

      <section className="card card-pad">
        <div className="card-head">
          <span className="lead"><h2 className="t-h2">이 업무의 세 날짜</h2></span>
          <Chip tone={daysUntil(task.officialDueDate) <= 5 ? "danger" : "warn"}>
            공식 마감까지 D-{daysUntil(task.officialDueDate)}
          </Chip>
        </div>
        <DateRail task={task} />
        <div className="legend">
          <span className="leg">
            <span className="sw" style={{ background: "var(--navy-300)" }} />
            <span><span className="lt">권장 준비 시작일</span><br /><span className="lv num">{formatFull(task.recommendedStartDate)}</span></span>
          </span>
          <span className="leg">
            <span className="sw" style={{ background: "var(--gam)" }} />
            <span><span className="lt">전년도 실제 처리일</span><br /><span className="lv num">{formatFull(task.previousActualDate)}</span></span>
          </span>
          <span className="leg">
            <span className="sw" style={{ background: "var(--navy-700)" }} />
            <span><span className="lt">공식 마감일</span><br /><span className="lv num">{formatFull(task.officialDueDate)}</span></span>
          </span>
          <span className="leg">
            <span className="sw" style={{ background: "var(--ok)" }} />
            <span><span className="lt">오늘</span><br /><span className="lv num">2026.08.28</span></span>
          </span>
        </div>
      </section>

      {!detail ? (
        <EmptyState
          title="이 업무의 상세 기록이 아직 없습니다"
          description="체크리스트·근거·전년도 처리 사례는 문서 분석이 진행되면 채워집니다."
        />
      ) : (
        <div className="two">
          <div className="stack" style={{ gap: 22 }}>
            <ChecklistSection taskId={task.id} checklist={detail.checklist} />
            <EvidenceChain chain={detail.evidenceChain} guidelineChangeNotice={detail.guidelineChangeNotice} />
          </div>

          <div className="stack" style={{ gap: 22 }}>
            <PreviousTimeline events={detail.previousTimeline} officialDueDate={task.officialDueDate} />

            <section className="card card-pad">
              <div className="card-head"><span className="lead"><h2 className="t-h2">필요한 양식</h2></span></div>
              {detail.relatedForms.length === 0 ? (
                <p className="t-cap">이 업무에 연결된 양식이 아직 없습니다.</p>
              ) : (
                detail.relatedForms.map((f) => (
                  <div className="frow" key={f.id}>
                    <span className="fic"><FileIcon /></span>
                    <span>
                      <span className="fn">{f.title}</span>
                      <span className="fm">{f.meta}</span>
                    </span>
                    <button className="btn btn-quiet btn-sm" disabled title="원문 보기는 준비 중입니다">
                      열기
                    </button>
                  </div>
                ))
              )}
            </section>

            <section className="card card-pad">
              <div className="card-head">
                <span className="lead"><h2 className="t-h2">경험 메모</h2></span>
                <button className="btn btn-ghost btn-sm" onClick={() => open("note", task.id)}>추가</button>
              </div>
              {taskNotes.length === 0 ? (
                <p className="t-cap">아직 이 업무의 경험 메모가 없습니다. 지금 알게 된 것을 한 줄 남겨 두세요.</p>
              ) : (
                taskNotes.map((n) => (
                  <div className="mini-note" key={n.id}>
                    <span style={{ display: "flex", gap: 7 }}>
                      <SourceTag type="experience" />
                    </span>
                    <p>{n.body}</p>
                    <span className="mf">{n.authorDisplay} · {n.academicYear}학년도</span>
                  </div>
                ))
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
