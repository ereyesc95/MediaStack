"""Resolve dev paths for data, legacy SQL, and built frontend."""
from __future__ import annotations

import sys
from pathlib import Path


def is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def install_dir() -> Path:
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


PROJECT_ROOT = install_dir()
DATA_DIR = PROJECT_ROOT / "data"
IMPORT_SQL = DATA_DIR / "databinger.sql"

# Back-compat alias
LEGACY_SQL = IMPORT_SQL


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def database_file() -> Path:
    ensure_data_dir()
    return DATA_DIR / "mediastack.db"


def resolve_frontend_dist() -> Path | None:
    candidates = [
        PROJECT_ROOT / "frontend" / "dist",
        PROJECT_ROOT / "_internal" / "frontend" / "dist",
    ]
    for path in candidates:
        index = path / "index.html"
        assets = path / "assets"
        if index.is_file() and assets.is_dir() and any(assets.iterdir()):
            return path
    return None
