"""Gallery payload for Video / Library folder items."""
from __future__ import annotations

import hashlib
from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import _find_artwork_subdir, _parse_folder_date
from app.gallery import (
    IMAGE_EXTS,
    _artist_dir,
    _gallery_subdir,
    _list_photos,
    _media_url,
)
from app.media_tabs_index import find_resolved_media_item
from app.media_paths_util import safe_relative
from app.release_gallery import (
    _era_gallery_photos,
    _is_excluded_artwork,
    _is_photocard_stem,
    _photo_display_title,
    _scan_artwork_file,
)
from app.release_overview import _normalize_release_match, _release_year
from app.models import Band
from app.config import settings

ARTWORK_DIR = "[artwork]"


def _item_id(rel_path: str) -> str:
    digest = hashlib.sha256(rel_path.casefold().encode("utf-8")).hexdigest()[:12]
    return f"gal_{digest}"


def _walk_item_artwork_dirs(folder: Path) -> list[Path]:
    dirs: list[Path] = []
    art = _find_artwork_subdir(folder)
    if art and any(
        p.is_file() and p.suffix.lower() in IMAGE_EXTS for p in art.iterdir()
    ):
        dirs.append(art)
    try:
        children = list(folder.iterdir())
    except OSError:
        children = []
    for child in children:
        if not child.is_dir() or child.name.casefold() == ARTWORK_DIR:
            continue
        nested = _find_artwork_subdir(child)
        if nested and any(
            p.is_file() and p.suffix.lower() in IMAGE_EXTS for p in nested.iterdir()
        ):
            dirs.append(nested)
    unique: list[Path] = []
    seen: set[str] = set()
    for d in dirs:
        key = d.as_posix().casefold()
        if key not in seen:
            seen.add(key)
            unique.append(d)
    return unique


def build_media_item_gallery(
    db: Session,
    band_id: int,
    kind: str,
    item_id: str,
) -> dict | None:
    band = db.get(Band, band_id)
    if not band or not settings.media_root:
        return None
    media_root = Path(settings.media_root)
    found = find_resolved_media_item(
        band, media_root, kind=kind, item_id=item_id
    )
    if not found:
        return None
    card, _display_entry, folder = found

    artwork_items: list[dict] = []
    extras_items: list[dict] = []
    for art_dir in _walk_item_artwork_dirs(folder):
        try:
            files = sorted(art_dir.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            continue
        for path in files:
            if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
                continue
            stem = path.stem.casefold()
            if _is_photocard_stem(stem) or stem in {"spotify", "qr", "logo"}:
                extras_items.append(
                    _scan_artwork_file(path, media_root, section="extras")
                )
            elif _is_excluded_artwork(stem):
                continue
            else:
                artwork_items.append(
                    _scan_artwork_file(path, media_root, section="artwork")
                )

    release_year = _release_year(card.get("date_iso") or _parse_folder_date(folder.name))
    release_title = card.get("title") or folder.name
    photo_items: list[dict] = []
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if artist_dir and release_year is not None:
        photos_dir = _gallery_subdir(artist_dir, "Photos")
        photos = _list_photos(photos_dir)
        matched = _era_gallery_photos(photos, release_year, release_title)
        # Fallback: title match without year gate when era photos empty
        if not matched and _normalize_release_match(release_title):
            key = _normalize_release_match(release_title)
            matched = [
                p
                for p in photos
                if key in p.path.stem.casefold()
            ]
        for photo in matched:
            rel = safe_relative(photo.path, media_root) or photo.path.name
            photo_items.append(
                {
                    "id": _item_id(rel),
                    "url": _media_url(photo.path, media_root),
                    "title": _photo_display_title(photo.path.stem),
                    "year": photo.year,
                    "orientation": photo.orientation,
                    "folder_path": rel,
                    "section": "photos",
                }
            )

    return {
        "release_id": item_id,
        "title": card.get("title") or folder.name,
        "artwork": artwork_items,
        "photos": photo_items,
        "extras": extras_items,
    }
