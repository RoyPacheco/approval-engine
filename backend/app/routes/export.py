from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from ..config import settings
from ..storage.json_store import read_list
from ..services.csv_export import render_csv

router = APIRouter()


@router.get("/chains")
def export_chains(ids: list[str] | None = Query(None)):
    """
    Stream all saved chains as a Coupa-compatible CSV.
    Pass ?ids=id1&ids=id2 to export a subset.
    """
    chains = read_list(settings.data_dir / "chains.json")
    if ids:
        chains = [c for c in chains if c.get("id") in ids]

    csv_text = render_csv(chains)
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="approval_chains_export.csv"'},
    )
