import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getExperienceNotes } from "@/services/notesService";
import { useAssignment } from "@/state/AssignmentContext";
import { useOverlay } from "@/state/OverlayContext";
import { qk } from "@/state/queryKeys";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { SourceTag } from "@/components/ui/SourceTag";
import { InfoIcon } from "@/lib/icons";
import { CommunityPostCard } from "./CommunityPostCard";
import { COMMUNITY_POSTS } from "./communityData";

type AssignmentFilter = "all" | "과학정보" | "영재교육";
type SortOrder = "latest" | "popular";

const ASSIGNMENT_FILTERS: { key: AssignmentFilter; label: string }[] = [
  { key: "all", label: "전체 담당 업무" },
  { key: "과학정보", label: "과학정보부" },
  { key: "영재교육", label: "영재교육" },
];

const VISIBILITY_LABEL: Record<string, { label: string; tone: string }> = {
  private: { label: "나만 보기", tone: "" },
  handover: { label: "후임자 전달", tone: "warn" },
  organization: { label: "학교 조직지식", tone: "ok" },
};

const ONBOARDING_KEY = "gam-community-onboarding-seen";

export function NotesPage() {
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("latest");
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem(ONBOARDING_KEY) !== "true");
  const { open } = useOverlay();
  const { context, user } = useAssignment();
  const query = useQuery({
    queryKey: context ? qk.notes(context) : ["notes", "disabled"],
    queryFn: ({ signal }) => getExperienceNotes(context!, user?.displayName ?? "", signal),
    enabled: !!context,
  });
  const posts = useMemo(() => {
    const filtered = assignmentFilter === "all"
      ? COMMUNITY_POSTS
      : COMMUNITY_POSTS.filter((post) => post.taskCategory === assignmentFilter);
    return sortOrder === "popular" ? [...filtered].sort((a, b) => b.helpfulCount - a.helpfulCount) : filtered;
  }, [assignmentFilter, sortOrder]);

  const closeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setShowOnboarding(false);
  };

  return (
    <div className="stack community-page">
      <section className="community-hero">
        <div>
          <span className="community-eyebrow">업무에서 바로 만나는 동료의 경험</span>
          <h1>🍊 선생님들의 감</h1>
          <p>다른 선생님의 감을 내 업무에 연결해, 필요한 순간 다시 볼 수 있어요.</p>
        </div>
        <div className="community-hero-actions">
          <button className="btn btn-quiet" onClick={() => open("review")}>인수인계 전 검토</button>
          <button className="btn btn-quiet" onClick={() => setShowOnboarding(true)}>감 나누기 사용법</button>
          <button className="btn community-primary" onClick={() => open("note")}>질문·감·자료 공유</button>
        </div>
      </section>

      <div className="notice">
        <InfoIcon />
        <span><strong>경험 기록은 공식 근거가 아닙니다.</strong> 개인정보·민원 당사자·인사 관련 내용은 적지 말고, 공개 범위는 연말 검토에서 다시 확인하세요.</span>
      </div>

      <section className="card card-pad">
        <div className="card-head">
          <span className="lead"><h2 className="t-h2">내 업무에 저장된 경험 메모</h2></span>
          <button className="btn btn-ghost btn-sm" onClick={() => open("note")}>경험 메모 쓰기</button>
        </div>
        <QueryBoundary query={query} isEmpty={(notes) => notes.length === 0} emptyTitle="저장된 경험 메모가 없습니다">
          {(notes) => (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {notes.map((note) => (
                <article className="note" key={note.id}>
                  <div className="note-head">
                    <SourceTag type="experience" />
                    <span className="chip navy">{note.taskTitle}</span>
                    <span className={`chip ${VISIBILITY_LABEL[note.visibility].tone}`}>{VISIBILITY_LABEL[note.visibility].label}</span>
                  </div>
                  <p>{note.body}</p>
                  <div className="note-foot">
                    <span className="w">{note.authorDisplay}</span>
                    <span className="num">{note.academicYear}학년도</span>
                    <Link className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} to={`/tasks/${note.taskId}`}>관련 업무 열기</Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </QueryBoundary>
      </section>

      <div className="community-toolbar">
        <div className="filters">
          {ASSIGNMENT_FILTERS.map(({ key, label }) => (
            <button key={key} className="fchip" aria-pressed={assignmentFilter === key} onClick={() => setAssignmentFilter(key)}>
              {label}
              <span className="c num">{key === "all" ? COMMUNITY_POSTS.length : COMMUNITY_POSTS.filter((post) => post.taskCategory === key).length}</span>
            </button>
          ))}
        </div>
        <div className="community-sort" role="group" aria-label="게시물 정렬">
          <button aria-pressed={sortOrder === "latest"} onClick={() => setSortOrder("latest")}>최신순</button>
          <button aria-pressed={sortOrder === "popular"} onClick={() => setSortOrder("popular")}>인기순</button>
        </div>
      </div>

      <div className="community-layout">
        <div className="community-feed">
          {posts.map((post) => <CommunityPostCard post={post} key={post.id} />)}
        </div>
        <aside className="community-side">
          <section className="card card-pad">
            <span className="community-side-icon">🍊</span>
            <h2 className="t-h2">이번 달 내 감 포인트</h2>
            <strong className="point-value">84점</strong>
            <p className="t-cap">자료 공유 2건 · 답변 3건 · 감 잡았어요 27회</p>
          </section>
          <section className="card card-pad">
            <span className="eyebrow">많이 찾는 업무</span>
            <div className="hot-tasks">
              <span><b>영재학급 선발·배정</b><em>감 14개</em></span>
              <span><b>학교정보공시 자료 확정</b><em>감 9개</em></span>
              <span><b>AI 교육주간 운영</b><em>감 7개</em></span>
            </div>
          </section>
        </aside>
      </div>

      {showOnboarding && (
        <div className="community-onboarding" role="dialog" aria-modal="true" aria-labelledby="community-guide-title">
          <div className="community-onboarding-card">
            <span className="community-eyebrow">처음 오셨나요?</span>
            <h2 id="community-guide-title">🍊 감 나누기, 이렇게 써요</h2>
            <p className="onboarding-lead">마음에 드는 감을 고르고, 내 같은 업무에 연결해 두세요.</p>
            <div className="onboarding-demo">
              <div className="demo-step"><span className="demo-number">1</span><b>도움이 된 감을 발견</b><div className="demo-post">“추천 기준은 가정통신문에 숫자로 적어 두는 게 좋았어요.”</div><span className="demo-action">🍊 감 잡았어요</span></div>
              <span className="demo-arrow">→</span>
              <div className="demo-step"><span className="demo-number">2</span><b>내 업무에 연결</b><div className="demo-connect"><span>내 업무로 연결할까요?</span><em>연결</em></div></div>
              <span className="demo-arrow">→</span>
              <div className="demo-step"><span className="demo-number">3</span><b>업무에서 다시 확인</b><div className="demo-task"><span>🍊 감 나누기</span><strong>영재학급 선발·배정</strong></div></div>
            </div>
            <div className="onboarding-foot">
              <span>누른 뒤 <b>연결</b>을 선택한 감만 내 업무에 들어옵니다.</span>
              <button className="btn community-primary" onClick={closeOnboarding}>시작하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
