"""Build release gallery: artwork, era photos, and extras from disk."""
from __future__ import annotations

import hashlib
from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import _find_artwork_subdir
from app.gallery import (
    GalleryPhoto,
    IMAGE_EXTS,
    _artist_dir,
    _gallery_subdir,
    _list_photos,
    _media_url,
)
from app.media_index import DISC_DIR_RE, _is_edition_content_dir
from app.media_paths_util import safe_relative
from app.release_overview import (
    PHOTOCARD_STEMS,
    _closest_gallery_photo,
    _release_year,
    resolve_release_content,
)
from app.release_tracklist import _list_edition_dirs

ARTWORK_DIR = "[artwork]"
EXCLUDED_ARTWORK_STEMS = {
    "logo",
    "spotify",
    "qr",
    *PHOTOCARD_STEMS.values(),
}


def _is_photocard_stem(stem: str) -> bool:
    low = stem.casefold()
    return low.startswith("photocard")


def _is_excluded_artwork(stem: str) -> bool:
    low = stem.casefold()
    if low in EXCLUDED_ARTWORK_STEMS:
        return True
    return _is_photocard_stem(low)


def _item_id(rel_path: str) -> str:
    digest = hashlib.sha256(rel_path.casefold().encode("utf-8")).hexdigest()[:12]
    return f"gal_{digest}"


def _scan_artwork_file(path: Path, media_root: Path, *, section: str) -> dict:
    rel = safe_relative(path, media_root) or path.name
    return {
        "id": _item_id(rel),
        "url": _media_url(path, media_root),
        "title": path.stem,
        "folder_path": rel,
        "section": section,
    }


def _walk_artwork_dirs(content: Path) -> list[Path]:
    dirs: list[Path] = []

    def walk(folder: Path) -> None:
        if not folder.is_dir():
            return
        art = _find_artwork_subdir(folder)
        if art:
            dirs.append(art)
        for child in folder.iterdir():
            if child.is_dir() and child.name.casefold() != ARTWORK_DIR:
                if DISC_DIR_RE.match(child.name) or _is_edition_content_dir(child):
                    walk(child)

    for edition in _list_edition_dirs(content):
        walk(edition)
    walk(content)
    unique: list[Path] = []
    seen: set[str] = set()
    for d in dirs:
        key = d.as_posix().casefold()
        if key not in seen:
            seen.add(key)
            unique.append(d)
    return unique


def _photos_near_year(
    photos: list[GalleryPhoto],
    year: int | None,
    *,
    window: int = 3,
) -> list[GalleryPhoto]:
    if not photos:
        return []
    if year is None:
        return sorted(photos, key=lambda p: (p.year, p.path.name.lower()))
    nearby = [p for p in photos if abs(p.year - year) <= window]
    pool = nearby if nearby else photos
    return sorted(pool, key=lambda p: (abs(p.year - (year or p.year)), p.year, p.path.name.lower()))


def build_release_gallery(
    db: Session,
    band_id: int,
    release_id: str,
) -> dict | None:
    resolved = resolve_release_content(db, band_id, release_id)
    if not resolved:
        return None
    band, card, media_root, content = resolved

    artwork_items: list[dict] = []
    extras_items: list[dict] = []

    for art_dir in _walk_artwork_dirs(content):
        for path in sorted(art_dir.iterdir(), key=lambda p: p.name.casefold()):
            if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
                continue
            stem = path.stem.casefold()
            if _is_photocard_stem(stem) or stem in {"spotify", "qr", "logo"}:
                extras_items.append(_scan_artwork_file(path, media_root, section="extras"))
            elif _is_excluded_artwork(stem):
                continue
            else:
                artwork_items.append(_scan_artwork_file(path, media_root, section="artwork"))

    release_year = _release_year(card.get("date_iso"))
    photo_items: list[dict] = []
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if artist_dir:
        photos_dir = _gallery_subdir(artist_dir, "Photos")
        photos = _list_photos(photos_dir)
        for photo in _photos_near_year(photos, release_year):
            rel = safe_relative(photo.path, media_root) or photo.path.name
            photo_items.append(
                {
                    "id": _item_id(rel),
                    "url": _media_url(photo.path, media_root),
                    "title": photo.path.stem,
                    "year": photo.year,
                    "orientation": photo.orientation,
                    "folder_path": rel,
                    "section": "photos",
                }
            )
        if not photo_items:
            closest = _closest_gallery_photo(photos, release_year)
            if closest:
                rel = safe_relative(closest.path, media_root) or closest.path.name
                photo_items.append(
                    {
                        "id": _item_id(rel),
                        "url": _media_url(closest.path, media_root),
                        "title": closest.path.stem,
                        "year": closest.year,
                        "orientation": closest.orientation,
                        "folder_path": rel,
                        "section": "photos",
                    }
                )

    return {
        "release_id": card.get("id") or release_id,
        "title": card.get("title") or content.name,
        "artwork": artwork_items,
        "photos": photo_items,
        "extras": extras_items,
    }
