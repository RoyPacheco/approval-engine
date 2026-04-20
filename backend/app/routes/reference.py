from fastapi import APIRouter
from ..config import settings
from ..storage.json_store import read_obj, write_obj

router = APIRouter()
STORE = settings.data_dir / "reference.json"

_DEFAULTS = {
    "currencies": [
        {"code": "USD", "name": "US Dollar"},
        {"code": "EUR", "name": "Euro"},
        {"code": "GBP", "name": "British Pound"},
        {"code": "JPY", "name": "Japanese Yen"},
        {"code": "CAD", "name": "Canadian Dollar"},
        {"code": "AUD", "name": "Australian Dollar"},
        {"code": "CHF", "name": "Swiss Franc"},
        {"code": "MXN", "name": "Mexican Peso"},
    ]
}


@router.get("")
def get_reference():
    data = read_obj(STORE)
    return data if data else _DEFAULTS


@router.put("")
def update_reference(data: dict):
    write_obj(STORE, data)
    return data
