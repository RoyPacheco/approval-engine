"""
Thread-safe file-based JSON storage.
Each collection is a single .json file: either a list (for CRUD entities)
or a dict (for singleton config like reference values).
Swap this module for a DB adapter when ready to scale.
"""
import json
import threading
from pathlib import Path

_locks: dict[str, threading.Lock] = {}
_locks_mutex = threading.Lock()


def _lock_for(path: Path) -> threading.Lock:
    key = str(path.resolve())
    with _locks_mutex:
        if key not in _locks:
            _locks[key] = threading.Lock()
        return _locks[key]


# ── List stores (chains, workflows, connections) ──────────────────────────────

def read_list(path: Path) -> list[dict]:
    with _lock_for(path):
        if not path.exists():
            return []
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return []


def write_list(path: Path, data: list[dict]) -> None:
    with _lock_for(path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# ── Object stores (reference values, settings) ────────────────────────────────

def read_obj(path: Path) -> dict:
    with _lock_for(path):
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}


def write_obj(path: Path, data: dict) -> None:
    with _lock_for(path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
