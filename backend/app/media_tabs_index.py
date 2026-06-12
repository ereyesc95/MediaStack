"""Scan artist Video and Library folders into card grids."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import DATE_PREFIX_RE, _parse_folder_date
from app.config import settings
from app.gallery import IMAGE_EXTS, _artist_dir, _media_url, _resolve_child_dir
from app.media_paths_util import safe_relative
from app.models import Band
from app.paths import DATA_DIR

VIDEO_ROOT = "Video"
LIBRARY_ROOT = "Library"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cache_path(band_id: int, kind: str) -> Path:
    cache_dir = DATA_DIR / "media_index"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{band_id}_{kind}.json"


def _card_id(kind: str, rel_path: str) -> str:
    digest = hashlib.sha256(f"{kind}:{rel_path.casefold()}".encode()).hexdigest()[:12]
    return f"{kind[:3]}_{digest}"


def _folder_cover(folder: Path, media_root: Path) -> str | None:
    for pattern in ("cover*", "folder*", "front*", "poster*"):
        for p in folder.glob(pattern):
            if p.is_file() and p.suffix.lower() in IMAGE_EXTS:
                return _media_url(p, media_root)
    for child in folder.iterdir():
        if child.is_file() and child.suffix.lower() in IMAGE_EXTS:
            return _media_url(child, media_root)
    return None


def _title_from_folder(name: str) -> str:
    m = DATE_PREFIX_RE.match(name.strip())
    if m:
        rest = name[m.end() :].lstrip(". ").strip()
        return rest or name
    return name


def _scan_section_root(section: Path, media_root: Path, kind: str) -> list[dict]:
    if not section.is_dir():
        return []
    categories: list[dict] = []
    for cat_dir in sorted(section.iterdir(), key=lambda p: p.name.casefold()):
        if not cat_dir.is_dir() or cat_dir.name.startswith("."):
            continue
        items: list[dict] = []
        for entry in sorted(cat_dir.iterdir(), key=lambda p: p.name.casefold()):
            if not entry.is_dir():
                continue
            rel = safe_relative(entry, media_root)
            if not rel:
                continue
            items.append(
                {
                    "id": _card_id(kind, rel),
                    "title": _title_from_folder(entry.name),
                    "date_iso": _parse_folder_date(entry.name),
                    "cover_url": _folder_cover(entry, media_root),
                    "folder_path": rel,
                }
            )
        if items:
            categories.append(
                {
                    "key": cat_dir.name.casefold().replace(" ", "_"),
                    "label": cat_dir.name,
                    "items": items,
                }
            )
    return categories


def build_media_tab_index(
    band: Band,
    media_root: Path,
    *,
    kind: str,
) -> dict:
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return {"categories": [], "scanned_at": _now()}
    root_name = VIDEO_ROOT if kind == "video" else LIBRARY_ROOT
    section = _resolve_child_dir(artist_dir, root_name)
    return {
        "band_id": band.bnd_id,
        "kind": kind,
        "categories": _scan_section_root(section, media_root, kind),
        "scanned_at": _now(),
    }


def get_media_tab_index(
    db: Session,
    band_id: int,
    *,
    kind: str,
    force: bool = False,
) -> dict | None:
    band = db.get(Band, band_id)
    if not band or not settings.media_root:
        return None
    media_root = Path(settings.media_root)
    if not media_root.is_dir():
        return None

    cache_file = _cache_path(band_id, kind)
    if not force and cache_file.is_file():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            if cached.get("categories") is not None:
                cached["cached"] = True
                return cached
        except (json.JSONDecodeError, OSError):
            pass

    payload = build_media_tab_index(band, media_root, kind=kind)
    payload["cached"] = False
    try:
        cache_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError:
        pass
    return payload
