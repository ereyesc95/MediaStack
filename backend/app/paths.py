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
ASSETS_DIR = PROJECT_ROOT / "assets"
IMPORT_SQL = DATA_DIR / "databinger.sql"

# Complementary resources live under assets/ (not playable media / not MYSTACK_MEDIA_ROOT)
PEOPLE_DIR = ASSETS_DIR / "people"
LINKS_DIR = ASSETS_DIR / "links"
# Legacy locations (read + one-time migrate)
LEGACY_PEOPLE_DIR = DATA_DIR / "people"
LEGACY_LINKS_DIR = DATA_DIR / "links"

# Back-compat alias
LEGACY_SQL = IMPORT_SQL


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def ensure_assets_dir() -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)


def people_dir() -> Path:
    ensure_assets_dir()
    PEOPLE_DIR.mkdir(parents=True, exist_ok=True)
    _migrate_tree(LEGACY_PEOPLE_DIR, PEOPLE_DIR)
    return PEOPLE_DIR


def links_dir() -> Path:
    ensure_assets_dir()
    LINKS_DIR.mkdir(parents=True, exist_ok=True)
    _migrate_tree(LEGACY_LINKS_DIR, LINKS_DIR)
    return LINKS_DIR


def _migrate_tree(src: Path, dest: Path) -> None:
    """Move leftover files from a legacy folder into dest (non-destructive)."""
    if not src.is_dir() or src.resolve() == dest.resolve():
        return
    import shutil

    try:
        entries = list(src.iterdir())
    except OSError:
        return
    if not entries:
        try:
            src.rmdir()
        except OSError:
            pass
        return
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


def migrate_people_links_from_media(media_root: str | Path | None) -> None:
    """Move Media/People and Media/Links into assets/ if still present under media root."""
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
    new_path = DATA_DIR / "mystack.db"
    old_path = DATA_DIR / "mediastack.db"
    if not new_path.exists() and old_path.exists():
        try:
            old_path.rename(new_path)
        except OSError:
            return old_path
    return new_path


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
