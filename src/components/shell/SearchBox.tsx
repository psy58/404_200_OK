import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchAll } from "@/services/searchService";
import { useAssignment } from "@/state/AssignmentContext";
import { qk } from "@/state/queryKeys";
import { SearchIcon } from "@/lib/icons";
import { nextSearchIndex } from "./searchNavigation";

const TYPE_LABEL = { task: "업무", document: "문서", evidence: "근거", experience: "경험 메모" } as const;

/** Server-shaped, authorization-consistent integrated search (S07). */
export function SearchBox() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
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

  useEffect(() => {
    setActiveIndex(-1);
  }, [deferredQuery, items.length]);

  function selectResult(index: number) {
    const item = items[index];
    if (!item) return;
    navigate(item.target);
    setOpen(false);
    setActiveIndex(-1);
    setQuery("");
  }

  function moveActive(direction: 1 | -1) {
    if (items.length === 0) return;
    setOpen(true);
    setActiveIndex((current) => nextSearchIndex(current, items.length, direction));
  }

  return (
    <div className="search-wrap" ref={boxRef}>
      <div className="search">
        <SearchIcon />
        <input
          id="q"
          type="search"
          role="combobox"
          placeholder="업무명, 공문 키워드로 검색"
          aria-label="통합 검색"
          aria-autocomplete="list"
          aria-controls="global-search-results"
          aria-expanded={open && Boolean(normalized)}
          aria-activedescendant={activeIndex >= 0 ? `global-search-result-${activeIndex}` : undefined}
          autoComplete="off"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(!!event.target.value.trim()); setActiveIndex(-1); }}
          onFocus={() => setOpen(!!normalized)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); moveActive(1); }
            else if (event.key === "ArrowUp") { event.preventDefault(); moveActive(-1); }
            else if (event.key === "Enter" && activeIndex >= 0) { event.preventDefault(); selectResult(activeIndex); }
            else if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setActiveIndex(-1); }
          }}
        />
        <kbd>/</kbd>
      </div>
      {open && normalized && (
        <div id="global-search-results" className="results" role="listbox" aria-label="통합 검색 결과" aria-busy={queryIsChanging || result.isPending} onMouseDown={(event) => event.preventDefault()}>
          {(queryIsChanging || result.isPending) && <div className="res-group" role="status"><span className="t-cap">검색 중…</span></div>}
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
          {items.map((item, index) => (
            <button
              key={`${item.type}:${item.id}`}
              id={`global-search-result-${index}`}
              className="res-item"
              role="option"
              aria-selected={activeIndex === index}
              tabIndex={-1}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => selectResult(index)}
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
