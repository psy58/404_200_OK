"""근거 법령 조회.

scripts/build_statutes.py 가 만든 data/statutes.json 을 읽는다. 공문 본문의
「법령」 인용을 뽑아 law.go.kr 한글주소로 이어 둔 것이다. 산출물이 없으면
빈 결과로 동작한다 — 법령 기능이 없다고 서버가 죽지 않는다.
"""

import json
from pathlib import Path

from .. import settings

STATUTES_PATH = settings.DATA_DIR / "statutes.json"


class _Store:
    def __init__(self) -> None:
        self.laws: dict[str, dict] = {}
        self.by_document: dict[str, list[dict]] = {}
        self.loaded = False

    def load(self, path: Path | None = None) -> None:
        path = path or STATUTES_PATH
        self.laws, self.by_document = {}, {}
        if path.exists():
            try:
                with open(path, encoding="utf-8") as stream:
                    payload = json.load(stream)
                self.laws = payload.get("laws", {})
                self.by_document = payload.get("by_document", {})
            except (json.JSONDecodeError, OSError) as exc:
                print(f"[statutes] {path}를 읽지 못했습니다: {exc}")
        self.loaded = True

    def ensure(self) -> "_Store":
        if not self.loaded:
            self.load()
        return self


_store = _Store()


def reset(path: Path | None = None) -> None:
    """테스트에서 다른 산출물로 갈아 끼운다."""
    _store.load(path) if path else _store.__init__()


def citations_for(document_id: str) -> list[dict]:
    """문서 한 건이 인용한 법령. 없으면 빈 목록."""
    return _store.ensure().by_document.get(document_id, [])


def citations_for_documents(document_ids: list[str], limit: int | None = None) -> list[dict]:
    """여러 문서(한 업무의 공문들)가 인용한 법령을 모아 중복 없이 돌려준다.

    같은 법령·조문이 여러 공문에 나오면 한 번만 싣는다. 자주 인용된 것부터.
    """
    store = _store.ensure()
    seen: dict[tuple[str, str | None], dict] = {}
    counts: dict[tuple[str, str | None], int] = {}
    for document_id in document_ids:
        for citation in store.by_document.get(document_id, []):
            key = (citation["name"], citation.get("article"))
            counts[key] = counts.get(key, 0) + 1
            seen.setdefault(key, {**citation, "cited_by": document_id})

    ranked = sorted(seen.values(), key=lambda c: -counts[(c["name"], c.get("article"))])
    return ranked[:limit] if limit else ranked


def ledger() -> list[dict]:
    """법령 대장 전체. 인용이 많은 것부터."""
    store = _store.ensure()
    rows = [{"name": name, **law} for name, law in store.laws.items()]
    rows.sort(key=lambda row: -row.get("count", 0))
    return rows
