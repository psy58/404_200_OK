import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getTaskDetail } from "@/services/tasksService";
import { getExperienceNotes } from "@/services/notesService";
import { useSelectedTasks } from "@/state/useSelectedTasks";
import { useOverlay } from "@/state/OverlayContext";
import { qk } from "@/state/queryKeys";
import { LoadingBlock, ErrorState, EmptyState } from "@/components/ui/States";
import { Chip } from "@/components/ui/Chip";
import { SourceTag } from "@/components/ui/SourceTag";
import { DateRail } from "@/components/ui/DateRail";
import { ChecklistSection } from "./ChecklistSection";
import { EvidenceChain } from "./EvidenceChain";
import { PreviousTimeline } from "./PreviousTimeline";
import { CommunityPostCard } from "@/features/notes/CommunityPostCard";
import { COMMUNITY_POSTS } from "@/features/notes/communityData";
import { useCommunityLinks } from "@/features/notes/communityLinks";
import { ChevronRightIcon, FileIcon } from "@/lib/icons";
import { daysUntil, formatFull } from "@/lib/dates";
import type { TaskNavigationState } from "@/lib/taskNavigation";

export function TaskDetailPage() {
  const { taskId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { tasks, isPending: tasksPending, error: tasksError, refetch: refetchTasks } = useSelectedTasks();
  const { open } = useOverlay();
  const linkedCommunityIds = useCommunityLinks();
  const [showContextBar, setShowContextBar] = useState(false);
  const context = location.state as TaskNavigationState | null;
  const backTarget = context ?? { from: "/home", label: "내 업무", scrollY: 0 };

  useEffect(() => {
    const update = () => setShowContextBar(window.scrollY > 180);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const detailQuery = useQuery({
    queryKey: qk.taskDetail(taskId),
    queryFn: ({ signal }) => getTaskDetail(taskId, signal),
    enabled: !!taskId,
  });
  const notesQuery = useQuery({ queryKey: qk.notes(), queryFn: ({ signal }) => getExperienceNotes(signal) });

  if (tasksPending || detailQuery.isPending) return <LoadingBlock label="업무 상세를 불러오는 중" />;
  if (tasksError) return <ErrorState description={tasksError.message} onRetry={refetchTasks} />;
  if (detailQuery.isError) return <ErrorState description={(detailQuery.error as Error).message} onRetry={() => detailQuery.refetch()} />;

  const task = tasks.find((t) => t.id === taskId);
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
  const communityPosts = COMMUNITY_POSTS.filter((post) => post.taskId === task.id && linkedCommunityIds.includes(post.id));

  return (
    <div className="stack">
      <div className="task-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(backTarget.from, { state: { restore: backTarget } })}>
          <span className="back-arrow"><ChevronRightIcon /></span> {backTarget.label}로 돌아가기
        </button>
        <nav className="breadcrumb" aria-label="현재 위치">
          <Link to="/">홈</Link><span>/</span><Link to={`/map?category=${encodeURIComponent(task.category)}`}>{task.category}</Link><span>/</span><strong>{task.title}</strong>
        </nav>
      </div>

      <div className="page-head">
        <div>
          <span className="eyebrow">{task.category}</span>
          <h1 className="t-display" style={{ marginTop: 9 }}>{task.title}</h1>
          {task.rationale && (
            <div className="analysis-summary">
              <span className="analysis-label">AI 업무 분석</span>
              <p>{task.rationale}</p>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <Link className="btn btn-quiet" to={`/map?focus=${task.id}`}>연간 지도에서 보기</Link>
          <button className="btn btn-quiet" onClick={() => open("note", task.id)}>
            경험 메모 쓰기
          </button>
          <button className="btn btn-primary" onClick={() => open("assistant", task.id)}>
            AI 감 열기
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

            <section className="card card-pad same-task-community">
              <div className="card-head">
                <span className="lead"><span className="orange-dot">🍊</span><h2 className="t-h2">같은 업무 선생님들의 감</h2></span>
                <button className="btn btn-ghost btn-sm" onClick={() => open("note", task.id)}>질문·감·자료 공유</button>
              </div>
              <p className="t-cap community-intro">동료 교사의 팁·자료·질문</p>
              {communityPosts.length === 0 && taskNotes.length === 0 ? (
                <p className="t-cap">아직 이 업무에 연결된 감이 없습니다. 가장 먼저 한 줄을 남겨 주세요.</p>
              ) : (
                <div className="same-task-feed">
                  {communityPosts.slice(0, 3).map((post) => <CommunityPostCard post={post} compact taskContext key={post.id} />)}
                  {taskNotes.map((n) => (
                  <div className="mini-note" key={n.id}>
                    <span style={{ display: "flex", gap: 7 }}>
                      <SourceTag type="experience" />
                    </span>
                    <p>{n.body}</p>
                    <span className="mf">{n.authorDisplay} · {n.academicYear}학년도</span>
                  </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
      {showContextBar && (
        <div className="task-context-bar">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(backTarget.from, { state: { restore: backTarget } })}><span className="back-arrow"><ChevronRightIcon /></span>{backTarget.label}</button>
          <strong>{task.title}</strong>
          <Link className="btn btn-ghost btn-sm" to={`/map?focus=${task.id}`}>연간 지도에서 보기</Link>
        </div>
      )}
    </div>
  );
}
