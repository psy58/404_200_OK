import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDocuments } from "@/services/documentsService";
import { useOverlay } from "@/state/OverlayContext";
import { useAssignment } from "@/state/AssignmentContext";
import { useQueries } from "@tanstack/react-query";
import { getTasks } from "@/services/tasksService";
import { qk } from "@/state/queryKeys";
import { QueryBoundary } from "@/components/ui/QueryBoundary";
import { SourceTag } from "@/components/ui/SourceTag";
import { SortIcon } from "@/lib/icons";
import type { DocumentItem } from "@/domain/types";

type FilterKey = "all" | "official" | "school_case" | "pending";
type SortKey = "title" | "relatedTaskTitle" | "issuedAt";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "official", label: "공식 근거" },
  { key: "school_case", label: "학교사례" },
  { key: "pending", label: "분석 미완료" },
];

function countFor(items: DocumentItem[], key: FilterKey): number {
  if (key === "all") return items.length;
  if (key === "pending") return items.filter((d) => d.analysisStatus !== "complete").length;
  return items.filter((d) => d.sourceType === key).length;
}

export function DocumentsPage() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "issuedAt", dir: "desc" });
  const { open } = useOverlay();
  const { selectedAssignmentIds } = useAssignment();
  const query = useQuery({ queryKey: qk.documents(), queryFn: ({ signal }) => getDocuments(signal) });
  const taskQueries = useQueries({ queries: selectedAssignmentIds.map((assignmentId) => ({ queryKey: qk.tasks(assignmentId), queryFn: ({ signal }: { signal: AbortSignal }) => getTasks(assignmentId, signal) })) });
  const taskTitles = useMemo(() => new Set(taskQueries.flatMap((taskQuery) => taskQuery.data ?? []).map((task) => task.title)), [taskQueries]);

  const filtered = useMemo(() => {
    const items = (query.data ?? []).filter((document) => taskTitles.has(document.relatedTaskTitle) || (selectedAssignmentIds.includes("sci") && document.relatedTaskTitle === "과학정보 · 공통"));
    const byFilter = items.filter((d) => {
      if (filter === "all") return true;
      if (filter === "pending") return d.analysisStatus !== "complete";
      return d.sourceType === filter;
    });
    return [...byFilter].sort((a, b) => {
      const v = String(a[sort.key]).localeCompare(String(b[sort.key]), "ko");
      return sort.dir === "asc" ? v : -v;
    });
  }, [query.data, filter, sort, taskTitles, selectedAssignmentIds]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  function sortAriaProps(key: SortKey) {
    if (sort.key !== key) return {};
    return { "aria-sort": (sort.dir === "asc" ? "ascending" : "descending") as "ascending" | "descending" };
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="t-display">문서함</h1>
          <p className="sub">
            <b>{filtered.length}건</b> · 선택한 담당 업무 기준
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => open("upload")}>
          문서 업로드·분석
        </button>
      </div>

      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f.key} className="fchip" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label} <span className="c num">{countFor(filtered, f.key)}</span>
          </button>
        ))}
      </div>

      <QueryBoundary
        query={query}
        isEmpty={() => filtered.length === 0}
        emptyTitle="조건에 맞는 문서가 없습니다"
        emptyDescription="필터를 지우거나 문서를 올려 분석을 시작하세요."
      >
        {() => (
          <section className="card">
            <div className="card-pad" style={{ paddingTop: 8, paddingBottom: 8 }}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th {...sortAriaProps("title")}>
                        <button onClick={() => toggleSort("title")}>문서명 <SortIcon /></button>
                      </th>
                      <th {...sortAriaProps("relatedTaskTitle")}>
                        <button onClick={() => toggleSort("relatedTaskTitle")}>관련 업무 <SortIcon /></button>
                      </th>
                      <th {...sortAriaProps("issuedAt")}>
                        <button onClick={() => toggleSort("issuedAt")}>시행일 <SortIcon /></button>
                      </th>
                      <th>출처 유형</th>
                      <th>분석 상태</th>
                      <th>검증</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d) => (
                      <tr key={d.id}>
                        <td style={{ minWidth: 300 }}>
                          <div className="dt1">{d.title}</div>
                          <div className="dt2">{d.documentNumber}</div>
                        </td>
                        <td style={{ color: "var(--ink-2)" }}>{d.relatedTaskTitle}</td>
                        <td className="num" style={{ color: "var(--ink-2)" }}>{d.issuedAt.replaceAll("-", ".")}</td>
                        <td><SourceTag type={d.sourceType} /></td>
                        <td>
                          <span className={`chip ${d.analysisStatus === "complete" ? "ok" : d.analysisStatus === "partial" ? "warn" : ""}`}>
                            {d.analysisStatus === "complete" ? "분석 완료" : d.analysisStatus === "partial" ? "부분 분석" : "분석 대기"}
                          </span>
                        </td>
                        <td>
                          <span className="t-cap">
                            {d.verificationStatus === "verified" ? "검증됨" : d.verificationStatus === "needs_review" ? "검토 필요" : "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mlist">
                {filtered.map((d) => (
                  <button className="mi" key={d.id}>
                    <span className="mt">{d.title}</span>
                    <span className="mm">
                      <SourceTag type={d.sourceType} />
                      <span className="num">{d.issuedAt.replaceAll("-", ".")}</span>
                      <span>{d.analysisStatus === "complete" ? "분석 완료" : d.analysisStatus === "partial" ? "부분 분석" : "분석 대기"}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}
      </QueryBoundary>
    </div>
  );
}
