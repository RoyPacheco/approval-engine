from fastapi import APIRouter, HTTPException
from ..config import settings
from ..storage.json_store import read_list, write_list

router = APIRouter()
STORE = settings.data_dir / "connections.json"


def _mask(conn: dict) -> dict:
    """Return connection with clientSecret masked for GET responses."""
    c = dict(conn)
    if c.get("clientSecret"):
        c["clientSecret"] = "••••••••"
    return c


@router.get("", response_model=list[dict])
def list_connections():
    return [_mask(c) for c in read_list(STORE)]


@router.get("/{conn_id}")
def get_connection(conn_id: str):
    conn = next((c for c in read_list(STORE) if c.get("id") == conn_id), None)
    if not conn:
        raise HTTPException(404, "Connection not found")
    return _mask(conn)


@router.put("/{conn_id}", status_code=200)
def upsert_connection(conn_id: str, conn: dict):
    """Create or update a Coupa connection.
    If clientSecret is the masked placeholder, retain the stored secret.
    """
    conn["id"] = conn_id
    conns = read_list(STORE)
    idx = next((i for i, c in enumerate(conns) if c.get("id") == conn_id), None)

    if idx is not None:
        # Keep the real secret if the caller sent the masked placeholder
        if conn.get("clientSecret") == "••••••••":
            conn["clientSecret"] = conns[idx].get("clientSecret", "")
        conns[idx] = conn
    else:
        conns.append(conn)

    write_list(STORE, conns)
    return _mask(conn)


@router.delete("/{conn_id}", status_code=204)
def delete_connection(conn_id: str):
    conns = read_list(STORE)
    filtered = [c for c in conns if c.get("id") != conn_id]
    if len(filtered) == len(conns):
        raise HTTPException(404, "Connection not found")
    write_list(STORE, filtered)
