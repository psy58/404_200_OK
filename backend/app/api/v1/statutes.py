"""근거 법령 대장."""

from fastapi import APIRouter

from ...ingest import statutes as statute_rules
from ...models.statute import StatuteLedgerEntry, StatutesResponse
from ...services import statute_service

router = APIRouter()


@router.get(
    "/statutes",
    response_model=StatutesResponse,
    summary="공문에서 뽑은 근거 법령 대장",
)
def get_statutes() -> StatutesResponse:
    items = []
    for row in statute_service.ledger():
        name = row.get("resolved_name") or row["name"]
        citation = statute_rules.Citation(
            name=name, category=row.get("category") or statute_rules.STATUTE
        )
        items.append(
            StatuteLedgerEntry(
                name=row["name"],
                category=row.get("category"),
                count=row.get("count", 0),
                articles=row.get("articles", []),
                documents=row.get("documents", []),
                verified=row.get("verified"),
                url=citation.url if row.get("verified", True) else citation.search_url,
            )
        )
    return StatutesResponse(law_count=len(items), items=items)
