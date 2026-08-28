import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchAll } from "@/services/searchService";
import { useAssignment } from "@/state/AssignmentContext";
import { qk } from "@/state/queryKeys";
import { SearchIcon } from "@/lib/icons";

const TYPE_LABEL = { task: "업무", document: "문서", evidence: "근거", experience: "경험 메모" } as const;

/** Server-shaped, authorization-consistent integrated search (S07). */
export function SearchBox() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const { context } = useAssignment();
  const normalized = query.trim();
  const deferredQuery = useDeferredValue(normalized);
  const queryIsChanging = deferredQuery !== normalized;
  const result = useQuery({
    queryKey: context ? qk.search(context, deferredQuery) : ["search", "disabled"],
    queryFn: ({ signal }) => searchAll(context!, deferredQuery, signal),
    enabled: !!context && deferredQuery.length > 0,
  });

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // Never present a previous query's target as the result for newer input.
  const items = queryIsChanging ? [] : result.data ?? [];
  return (
    <div className="search-wrap" ref={boxRef}>
      <div className="search">
        <SearchIcon />
        <input
          id="q"
          type="search"
          placeholder="업무명, 공문 키워드로 검색"
          aria-label="통합 검색"
          autoComplete="off"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(!!event.target.value.trim()); }}
          onFocus={() => setOpen(!!normalized)}
        />
        <kbd>/</kbd>
      </div>
      {open && normalized && (
        <div className="results" onMouseDown={(event) => event.preventDefault()}>
          {(queryIsChanging || result.isPending) && <div className="res-group"><span className="t-cap">검색 중…</span></div>}
          {!queryIsChanging && result.isError && (
            <div className="empty" style={{ padding: "34px 18px" }}>
              <p className="t-h2">검색 결과를 불러오지 못했습니다</p>
              <button className="btn btn-quiet btn-sm" style={{ marginTop: 12 }} onClick={() => result.refetch()}>다시 시도</button>
            </div>
          )}
          {!queryIsChanging && !result.isPending && !result.isError && items.length === 0 && (
            <div className="empty" style={{ padding: "34px 18px" }}>
              <p className="t-h2">&ldquo;{query}&rdquo; 결과가 없습니다</p>
              <p className="t-cap" style={{ marginTop: 6 }}>업무명이나 공문 제목의 일부만 입력해 보세요.</p>
            </div>
          )}
          {items.map((item) => (
            <button
              key={`${item.type}:${item.id}`}
              className="res-item"
              onClick={() => { navigate(item.target); setOpen(false); setQuery(""); }}
            >
              <span className="rt">{item.title}</span>
              <span className="rm">{TYPE_LABEL[item.type]} · {item.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
