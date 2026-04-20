"""
Coupa API proxy routes.
All OAuth secrets remain server-side; the browser only calls /api/coupa/*.
"""
from fastapi import APIRouter, HTTPException, Query
from ..config import settings
from ..services.coupa_client import CoupaClient
from ..storage.json_store import read_list

router = APIRouter()

# Static list kept in sync with Coupa's known chain types.
# Replace with a live Coupa metadata call once credentials are configured.
CHAIN_TYPES = [
    "invoice", "expense", "requisition", "contract", "receipt-request",
    "order-header-change", "service-time-sheets-header",
    "invoice-submission-blocking", "invoice-submission-warning",
    "requisition-submission-blocking", "requisition-submission-warning",
    "order-header-change-submission-blocking", "expense-submission-blocking",
    "contract-document-signatory", "easy-form-expense-preapproval",
    "easy-form-supplier-information", "easy-form-contract", "easy-form-user",
    "easy-form-capital-project", "easy-form-office-remodel",
    "easy-form-new-budget", "coupa-pay/supplier-payment-account",
    "coupa-pay/financial-account",
]


def _client_from_settings() -> CoupaClient:
    if not settings.coupa_client_id or not settings.coupa_api_url:
        raise HTTPException(400, "Coupa credentials not configured in .env")
    return CoupaClient(
        api_url=settings.coupa_api_url,
        client_id=settings.coupa_client_id,
        client_secret=settings.coupa_client_secret,
        scope=settings.coupa_scope,
    )


def _client_from_connection(connection_id: str) -> CoupaClient:
    from ..config import settings as s
    conns = read_list(s.data_dir / "connections.json")
    conn = next((c for c in conns if c.get("id") == connection_id), None)
    if not conn:
        raise HTTPException(404, f"Connection '{connection_id}' not found")
    return CoupaClient(
        api_url=conn["apiUrl"],
        client_id=conn["clientId"],
        client_secret=conn["clientSecret"],
        scope=conn.get("scope", settings.coupa_scope),
    )


@router.post("/token")
async def get_token(connection_id: str | None = Query(None)):
    client = _client_from_connection(connection_id) if connection_id else _client_from_settings()
    token = await client.get_token()
    return {"access_token": token}


@router.get("/chain-types")
def get_chain_types():
    return CHAIN_TYPES


@router.get("/proxy/{path:path}")
async def proxy_get(path: str, connection_id: str | None = Query(None)):
    client = _client_from_connection(connection_id) if connection_id else _client_from_settings()
    return await client.get(path)
