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

# Complementary resources (not playable media) — kept out of MEDIASTACK_MEDIA_ROOT
PEOPLE_DIR = DATA_DIR / "people"
LINKS_DIR = DATA_DIR / "links"

# Back-compat alias
LEGACY_SQL = IMPORT_SQL


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def people_dir() -> Path:
    ensure_data_dir()
    PEOPLE_DIR.mkdir(parents=True, exist_ok=True)
    return PEOPLE_DIR


def links_dir() -> Path:
    ensure_data_dir()
    LINKS_DIR.mkdir(parents=True, exist_ok=True)
    return LINKS_DIR


def migrate_people_links_from_media(media_root: str | Path | None) -> None:
    """Move Media/People and Media/Links into data/ if still present under media root."""
    if not media_root:
        return
    root = Path(media_root)
    if not root.is_dir():
        return
    import shutil

    for src_name, dest in (("People", people_dir()), ("Links", links_dir())):
        src = root / src_name
        if not src.is_dir():
            continue
        try:
            entries = list(src.iterdir())
        except OSError:
            continue
        if not entries:
            try:
                src.rmdir()
            except OSError:
                pass
            continue
        for child in entries:
            target = dest / child.name
            if target.exists():
                continue
            try:
                shutil.move(str(child), str(target))
            except OSError:
                pass
        try:
            if not any(src.iterdir()):
                src.rmdir()
        except OSError:
            pass


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
