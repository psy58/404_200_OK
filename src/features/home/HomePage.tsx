import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getTasks } from "@/services/tasksService";
import { getExperienceNotes } from "@/services/notesService";
import { getDocuments } from "@/services/documentsService";
import { useAssignment } from "@/state/AssignmentContext";
import { useOverlay } from "@/state/OverlayContext";
import { qk } from "@/state/queryKeys";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { KpiCard } from "@/components/ui/KpiCard";
import { TaskRow } from "@/components/tasks/TaskRow";
import { DateRail } from "@/components/ui/DateRail";
import { Chip } from "@/components/ui/Chip";
import { SourceTag } from "@/components/ui/SourceTag";
import { LoadingBlock, ErrorState } from "@/components/ui/States";
import { InfoIcon, LinkIcon } from "@/lib/icons";
import { daysUntil, formatFull } from "@/lib/dates";
import { getSafeErrorMessage } from "@/services/errorPresentation";

const VISIBILITY_LABEL: Record<string, { label: string; tone: string }> = {
  private: { label: "나만 보기", tone: "" },
  handover: { label: "후임자 전달", tone: "warn" },
  organization: { label: "학교 조직지식", tone: "ok" },
};

export function HomePage() {
  const { activeAssignment, context, user } = useAssignment();
  const { open } = useOverlay();

  const tasksQuery = useQuery({
    queryKey: context ? qk.tasks(context) : ["tasks", "disabled"],
    queryFn: ({ signal }) => getTasks(context!, signal),
    enabled: !!context,
  });
  const notesQuery = useQuery({
    queryKey: context ? qk.notes(context) : ["notes", "disabled"],
    queryFn: ({ signal }) => getExperienceNotes(context!, user?.displayName ?? "", signal),
    enabled: !!context,
  });
  const docsQuery = useQuery({
    queryKey: context ? qk.documents(context) : ["documents", "disabled"],
    queryFn: ({ signal }) => getDocuments(context!, signal),
    enabled: !!context,
  });

  if (!context) return <LoadingBlock label="담당 업무를 불러오는 중" />;
  if (tasksQuery.isPending) return <LoadingBlock label="내 업무를 불러오는 중" />;
  if (tasksQuery.isError) {
    return <ErrorState description={getSafeErrorMessage(tasksQuery.error)} onRetry={() => tasksQuery.refetch()} />;
  }

  const tasks = tasksQuery.data;
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const upcoming = tasks.filter((t) => t.status === "upcoming");
  const doneCount = tasks.filter((t) => t.status === "complete").length;
  const dueSoonCount = tasks.filter((t) => {
    const d = daysUntil(t.officialDueDate);
    return d >= 0 && d <= 10;
  }).length;
  const urgent = [...inProgress].sort((a, b) => daysUntil(a.officialDueDate) - daysUntil(b.officialDueDate))[0];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="t-display">내 업무</h1>
          <p className="sub">
            담당 업무 <b>{activeAssignment?.taskCount ?? tasks.length}개</b> · 10일 내 마감 <b>{dueSoonCount}개</b>
          </p>
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <button className="btn btn-quiet" onClick={() => open("new-assignment")}>새 업무 추가</button>
          <Link className="btn btn-quiet" to="/map">
            연간 지도 열기
          </Link>
          <button className="btn btn-primary" onClick={() => open("upload")}>
            문서 업로드·분석
          </button>
        </div>
      </div>

      <div className="kpis">
        <KpiCard
          accent="#EF4444"
          title="지금 해야 할 업무"
          value={inProgress.length}
          meta={urgent ? `가장 급한 업무 D-${daysUntil(urgent.officialDueDate)}` : "진행 중인 업무 없음"}
          linkLabel="목록 보기"
          to="/home"
          scrollTarget="in-progress-tasks"
        />
        <KpiCard
          accent="#F59E0B"
          title="준비 시작할 업무"
          value={upcoming.length}
          meta="전년도 준비 시점 기준"
          linkLabel="목록 보기"
          to="/home"
          scrollTarget="upcoming-tasks"
        />
        <KpiCard
          accent="#0B4171"
          title="새로 온 관련 공문"
          value={docsQuery.data?.length ?? 0}
          meta="관련 공문 확인"
          linkLabel="목록 보기"
          to="/home"
          scrollTarget="related-documents"
        />
        <KpiCard
          accent="#10B981"
          title="올해 완료한 업무"
          value={doneCount}
          meta="올해 처리 내역"
          linkLabel="인수인계서 보기"
          to="/handover"
          variant="right"
        />
      </div>

      <div className="grid-main">
        <div className="stack" style={{ gap: 22 }}>
          <section className="card card-pad scroll-target" id="in-progress-tasks">
            <span className="sec-tag">이번 달 · 8월</span>
            <div className="card-head">
              <span className="lead">
                <span className="dot-m" style={{ background: "var(--danger)" }} />
                <h2 className="t-h1">지금 해야 할 업무</h2>
              </span>
              <Link className="btn btn-ghost btn-sm" to="/map">
                지도에서 보기
              </Link>
            </div>
            {inProgress.length === 0 ? (
              <p className="t-cap">지금 진행 중인 업무가 없습니다.</p>
            ) : (
              <div>{inProgress.map((t) => <TaskRow key={t.id} task={t} />)}</div>
            )}
          </section>

          <section className="card card-pad scroll-target" id="upcoming-tasks">
            <span className="sec-tag">다음 · 9~10월</span>
            <div className="card-head">
              <span className="lead">
                <span className="dot-m" style={{ background: "var(--warn)" }} />
                <h2 className="t-h1">준비 시작할 업무</h2>
              </span>
              <span className="t-cap">전년도 담당자의 실제 처리 시점 기준</span>
            </div>
            {upcoming.length === 0 ? (
              <p className="t-cap">준비를 시작할 업무가 없습니다.</p>
            ) : (
              <div>{upcoming.map((t) => <TaskRow key={t.id} task={t} />)}</div>
            )}
          </section>

          {urgent && (
            <section className="card card-pad">
              <div className="card-head">
                <span className="lead">
                  <h2 className="t-h1">가장 급한 업무의 세 날짜</h2>
                  <Chip tone="danger">D-{daysUntil(urgent.officialDueDate)}</Chip>
                </span>
                <Link className="btn btn-ghost btn-sm" to={`/tasks/${urgent.id}`}>
                  업무 상세
                </Link>
              </div>
              <p className="t-cap" style={{ margin: "-8px 0 6px" }}>
                {urgent.title} · {urgent.rationale}
              </p>
              <DateRail task={urgent} />
              <div className="legend">
                <span className="leg">
                  <span className="sw" style={{ background: "var(--navy-300)" }} />
                  <span>
                    <span className="lt">권장 준비 시작일</span>
                    <br />
                    <span className="lv num">{formatFull(urgent.recommendedStartDate)}</span>
                  </span>
                </span>
                <span className="leg">
                  <span className="sw" style={{ background: "var(--gam)" }} />
                  <span>
                    <span className="lt">전년도 실제 처리일</span>
                    <br />
                    <span className="lv num">{formatFull(urgent.previousActualDate)}</span>
                  </span>
                </span>
                <span className="leg">
                  <span className="sw" style={{ background: "var(--navy-700)" }} />
                  <span>
                    <span className="lt">공식 마감일</span>
                    <br />
                    <span className="lv num">{formatFull(urgent.officialDueDate)}</span>
                  </span>
                </span>
              </div>
            </section>
          )}
        </div>

        <aside className="col-side">
          <section className="card card-pad scroll-target" id="related-documents">
            <div className="card-head">
              <span className="lead">
                <span className="dot-m" style={{ background: "var(--navy-700)" }} />
                <h2 className="t-h2">새로 온 관련 공문</h2>
              </span>
              <Chip tone="navy">관련 업무</Chip>
            </div>
            <QueryBoundary query={docsQuery} isEmpty={(d) => d.length === 0} emptyTitle="새로 온 공문이 없습니다">
              {(items) =>
                items.slice(0, 3).map((f) => (
                  <Link className="dfeed" to={f.relatedTaskId ? `/tasks/${f.relatedTaskId}` : "/docs"} key={f.id}>
                    <span className="stamp">접수</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="dt">{f.title}</span>
                      <span className="dm">
                        {f.documentNumber} · {f.issuedAt.slice(5).replace("-", ".")} 시행
                      </span>
                      <span className="dl">
                        <LinkIcon />
                        {f.relatedTaskTitle}
                      </span>
                    </span>
                  </Link>
                ))
              }
            </QueryBoundary>
          </section>

          <section className="card card-pad">
            <div className="card-head">
              <span className="lead">
                <h2 className="t-h2">선생님들의 감</h2>
              </span>
              <Link className="btn btn-ghost btn-sm" to="/notes">
                전체
              </Link>
            </div>
            <QueryBoundary
              query={notesQuery}
              isEmpty={(d) => d.filter((n) => n.visibility !== "private").length === 0}
              emptyTitle="아직 공유된 경험 메모가 없습니다"
            >
              {(items) =>
                items
                  .filter((n) => n.visibility !== "private")
                  .slice(0, 2)
                  .map((n) => (
                    <div className="mini-note" key={n.id}>
                      <span style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                        <SourceTag type="experience" />
                        <span className={`chip ${VISIBILITY_LABEL[n.visibility].tone}`}>
                          {VISIBILITY_LABEL[n.visibility].label}
                        </span>
                      </span>
                      <p>{n.body}</p>
                      <span className="mf">
                        {n.authorDisplay} · {n.academicYear}학년도 · {n.taskTitle}
                      </span>
                    </div>
                  ))
              }
            </QueryBoundary>
            <button className="btn btn-quiet btn-sm" style={{ width: "100%", marginTop: 14 }} onClick={() => open("note")}>
              경험 메모 쓰기
            </button>
          </section>

          <section className="card card-pad">
            <div className="card-head">
              <span className="lead">
                <h2 className="t-h2">올해 기록 현황</h2>
              </span>
            </div>
            <div className="ho-line">
              <span className="k">완료 업무</span>
              <span className="v num">{doneCount}건</span>
            </div>
            <div className="ho-line">
              <span className="k">체크리스트 기록</span>
              <span className="v num">{tasks.reduce((sum, t) => sum + t.checklistDone, 0)}개</span>
            </div>
            <div className="ho-line">
              <span className="k">경험 메모</span>
              <span className="v num">{(notesQuery.data ?? []).filter((n) => n.isMine).length}건 (비공개 포함)</span>
            </div>
            <div className="ho-line">
              <span className="k">연결된 문서</span>
              <span className="v num">{docsQuery.data?.length ?? 0}건</span>
            </div>
            <div className="notice flat" style={{ marginTop: 16 }}>
              <InfoIcon />
              <span>
                인수인계에 포함할 내용은 <strong>연말 검토에서 직접 선택</strong>합니다.
              </span>
            </div>
            <Link className="btn btn-quiet btn-sm" style={{ width: "100%", marginTop: 14, textAlign: "center" }} to="/handover">
              인수인계서 초안 보기
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
