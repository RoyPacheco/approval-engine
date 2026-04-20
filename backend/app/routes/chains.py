from fastapi import APIRouter, HTTPException
from ..config import settings
from ..storage.json_store import read_list, write_list

router = APIRouter()
STORE = settings.data_dir / "chains.json"


@router.get("", response_model=list[dict])
def list_chains():
    return read_list(STORE)


@router.get("/{chain_id}")
def get_chain(chain_id: str):
    chain = next((c for c in read_list(STORE) if c.get("id") == chain_id), None)
    if not chain:
        raise HTTPException(404, "Chain not found")
    return chain


@router.put("/{chain_id}", status_code=200)
def upsert_chain(chain_id: str, chain: dict):
    """Create or replace a chain by ID (idempotent save)."""
    chain["id"] = chain_id
    chains = read_list(STORE)
    idx = next((i for i, c in enumerate(chains) if c.get("id") == chain_id), None)
    if idx is not None:
        chains[idx] = chain
    else:
        chains.append(chain)
    write_list(STORE, chains)
    return chain


@router.delete("/{chain_id}", status_code=204)
def delete_chain(chain_id: str):
    chains = read_list(STORE)
    filtered = [c for c in chains if c.get("id") != chain_id]
    if len(filtered) == len(chains):
        raise HTTPException(404, "Chain not found")
    write_list(STORE, filtered)
