import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getExperienceNotes } from "@/services/notesService";
import { useOverlay } from "@/state/OverlayContext";
import { qk } from "@/state/queryKeys";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { SourceTag } from "@/components/ui/SourceTag";
import { InfoIcon } from "@/lib/icons";
import type { ExperienceNote } from "@/domain/types";
import { useAssignment } from "@/state/AssignmentContext";

type FilterKey = "all" | "mine" | "shared";

const VISIBILITY_LABEL: Record<string, { label: string; tone: string }> = {
  private: { label: "나만 보기", tone: "" },
  handover: { label: "후임자 전달", tone: "warn" },
  organization: { label: "학교 조직지식", tone: "ok" },
};

function filterNotes(notes: ExperienceNote[], key: FilterKey): ExperienceNote[] {
  if (key === "mine") return notes.filter((n) => n.isMine);
  if (key === "shared") return notes.filter((n) => n.visibility !== "private");
  return notes;
}

/**
 * F10 "선생님들의 감" — 업무별 경험 메모 모음. 커뮤니티 기능(좋아요·댓글·팔로우·
 * 공개피드·랭킹)은 영상 지시서 §5.7/§2에 따라 의도적으로 제외한다.
 */
export function NotesPage() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const { open } = useOverlay();
  const { context, user } = useAssignment();
  const query = useQuery({
    queryKey: context ? qk.notes(context) : ["notes", "disabled"],
    queryFn: ({ signal }) => getExperienceNotes(context!, user?.displayName ?? "", signal),
    enabled: !!context,
  });
  const notes = query.data ?? [];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <span className="eyebrow">업무별 경험 메모</span>
          <h1 className="t-display" style={{ marginTop: 9 }}>선생님들의 감</h1>
          <p className="sub">공식 근거도, 학교사례도 아닌 담당자의 경험 기록입니다. 공식 지침보다 우선하지 않습니다.</p>
        </div>
        <div style={{ display: "flex", gap: 9 }}>
          <button className="btn btn-quiet" onClick={() => open("review")}>
            인수인계 전 검토
          </button>
          <button className="btn btn-primary" onClick={() => open("note")}>
            경험 메모 쓰기
          </button>
        </div>
      </div>

      <div className="notice">
        <InfoIcon />
        <span>
          <strong>기록 ≠ 공유.</strong> 메모는 <em>나만 보기 → 후임자 전달 → 학교 조직지식</em> 순으로 단계적으로만
          넓어집니다. 개인정보·민원 당사자·인사 관련 내용은 적지 마세요. 공개 승격은 항상 사람이 승인합니다.
        </span>
      </div>

      <div className="filters">
        {([
          ["all", "전체"],
          ["mine", "내가 쓴 메모"],
          ["shared", "전달·공유된 메모"],
        ] as const).map(([key, label]) => (
          <button key={key} className="fchip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label} <span className="c num">{filterNotes(notes, key).length}</span>
          </button>
        ))}
      </div>

      <QueryBoundary
        query={query}
        isEmpty={() => filterNotes(notes, filter).length === 0}
        emptyTitle="조건에 맞는 경험 메모가 없습니다"
      >
        {() => (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {filterNotes(notes, filter).map((n) => (
              <article className="note" key={n.id}>
                <div className="note-head">
                  <SourceTag type="experience" />
                  <span className="chip navy">{n.taskTitle}</span>
                  <span className={`chip ${VISIBILITY_LABEL[n.visibility].tone}`}>{VISIBILITY_LABEL[n.visibility].label}</span>
                </div>
                <p>{n.body}</p>
                <div className="note-foot">
                  <span className="w">{n.authorDisplay}</span>
                  <span className="num">{n.academicYear}학년도</span>
                  <Link className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} to={`/tasks/${n.taskId}`}>
                    관련 업무 열기
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
