"""Build release gallery: artwork, era photos, and extras from disk."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import (
    _album_title_from_folder,
    _find_artwork_subdir,
    _parse_folder_date,
)
from app.gallery import (
    GalleryPhoto,
    IMAGE_EXTS,
    _artist_dir,
    _gallery_subdir,
    _list_photos,
    _media_url,
)
from app.media_index import DISC_DIR_RE, _is_edition_content_dir, _release_dir_from_content_folder, is_box_set_name
from app.media_paths_util import entry_display_name, safe_relative
from app.release_overview import (
    PHOTOCARD_STEMS,
    _normalize_release_match,
    _release_year,
    resolve_release_content,
)
from app.release_tracklist import (
    _find_track_audio_by_title,
    _parse_lnk_track_lookup_title,
)

ARTWORK_DIR = "[artwork]"
EXCLUDED_ARTWORK_STEMS = {
    "logo",
    "spotify",
    "qr",
    *PHOTOCARD_STEMS.values(),
}
PHOTO_YEAR_PREFIX_RE = re.compile(r"^\d{4}(?:\.\d{2})?\.\s*")
PHOTO_ORIENTATION_SUFFIX_RE = re.compile(r",\s*(landscape|portrait)\s*$", re.I)


def _is_photocard_stem(stem: str) -> bool:
    low = stem.casefold()
    return low.startswith("photocard")


def _is_extras_artwork_stem(stem: str) -> bool:
    """Logos (including Logo - Collapsed), Spotify, QR, photocards → Extras."""
    low = stem.casefold().strip()
    if _is_photocard_stem(low) or low in {"spotify", "qr"}:
        return True
    return low == "logo" or low.startswith("logo ") or low.startswith("logo-")


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


def _artwork_dir_has_images(art_dir: Path) -> bool:
    if not art_dir.is_dir():
        return False
    return any(
        p.is_file() and p.suffix.lower() in IMAGE_EXTS for p in art_dir.iterdir()
    )


def _walk_release_artwork_dirs(content: Path) -> list[Path]:
    """Artwork folders on this release only — never .lnk shortcut targets."""
    dirs: list[Path] = []

    def walk_folder(folder: Path) -> None:
        if not folder.is_dir():
            return
        art = _find_artwork_subdir(folder)
        if art and _artwork_dir_has_images(art):
            dirs.append(art)
        for child in folder.iterdir():
            if child.suffix.casefold() == ".lnk":
                continue
            if child.is_dir() and child.name.casefold() != ARTWORK_DIR:
                if DISC_DIR_RE.match(child.name) or _is_edition_content_dir(child):
                    walk_folder(child)

    art = _find_artwork_subdir(content)
    if art and _artwork_dir_has_images(art):
        dirs.append(art)
    for child in content.iterdir():
        if child.suffix.casefold() == ".lnk":
            continue
        if not child.is_dir() or child.name.casefold() == ARTWORK_DIR:
            continue
        if _is_edition_content_dir(child):
            walk_folder(child)

    unique: list[Path] = []
    seen: set[str] = set()
    for d in dirs:
        key = d.as_posix().casefold()
        if key not in seen:
            seen.add(key)
            unique.append(d)
    return unique


def _photo_display_title(stem: str) -> str:
    title = PHOTO_YEAR_PREFIX_RE.sub("", stem.strip(), count=1)
    return PHOTO_ORIENTATION_SUFFIX_RE.sub("", title).strip()


def _filename_matches_release_era(filename: str, release_title: str) -> bool:
    key = _normalize_release_match(release_title)
    if not key:
        return False
    low = filename.casefold()
    if key in low:
        return True
    return f"{key} era" in low


def _era_gallery_photos(
    photos: list[GalleryPhoto],
    year: int | None,
    release_title: str | None = None,
) -> list[GalleryPhoto]:
    if not photos or year is None:
        return []
    title = release_title or ""

    tier1 = [
        p
        for p in photos
        if p.year == year and _filename_matches_release_era(p.path.stem, title)
    ]
    if tier1:
        return sorted(tier1, key=lambda p: p.path.name.lower())

    tier2 = [p for p in photos if p.year == year]
    if tier2:
        return sorted(tier2, key=lambda p: p.path.name.lower())

    previous_years = sorted({p.year for p in photos if p.year < year}, reverse=True)
    if previous_years:
        best = previous_years[0]
        tier3 = [p for p in photos if p.year == best]
        return sorted(tier3, key=lambda p: p.path.name.lower())

    return []


def _compilation_era_photos(
    db: Session,
    band_id: int,
    media_root: Path,
    content: Path,
    photos: list[GalleryPhoto],
) -> list[GalleryPhoto]:
    seen_paths: set[str] = set()
    out: list[GalleryPhoto] = []
    for child in sorted(content.iterdir(), key=lambda p: p.name.casefold()):
        if child.suffix.casefold() != ".lnk":
            continue
        track_title = _parse_lnk_track_lookup_title(entry_display_name(child))
        audio = _find_track_audio_by_title(db, band_id, media_root, track_title)
        if not audio:
            continue
        album_dir = _release_dir_from_content_folder(audio.parent)
        source_year = _release_year(_parse_folder_date(album_dir.name))
        source_title = _album_title_from_folder(entry_display_name(album_dir))
        for photo in _era_gallery_photos(photos, source_year, source_title):
            key = photo.path.as_posix().casefold()
            if key in seen_paths:
                continue
            seen_paths.add(key)
            out.append(photo)
    return out


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

    for art_dir in _walk_release_artwork_dirs(content):
        for path in sorted(art_dir.iterdir(), key=lambda p: p.name.casefold()):
            if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
                continue
            stem = path.stem.casefold()
            if _is_extras_artwork_stem(stem):
                extras_items.append(_scan_artwork_file(path, media_root, section="extras"))
            elif _is_excluded_artwork(stem):
                continue
            else:
                artwork_items.append(_scan_artwork_file(path, media_root, section="artwork"))

    release_year = _release_year(card.get("date_iso"))
    release_title = card.get("title") or content.name
    photo_items: list[dict] = []
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if artist_dir:
        photos_dir = _gallery_subdir(artist_dir, "Photos")
        photos = _list_photos(photos_dir)
        category = card.get("category") or ""
        is_compilation = category == "compilations" and not is_box_set_name(
            entry_display_name(content)
        )
        if is_compilation:
            matched = _compilation_era_photos(
                db, band_id, media_root, content, photos
            )
            if not matched:
                matched = _era_gallery_photos(photos, release_year, release_title)
        else:
            matched = _era_gallery_photos(photos, release_year, release_title)
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
        "release_id": card.get("id") or release_id,
        "title": card.get("title") or content.name,
        "artwork": artwork_items,
        "photos": photo_items,
        "extras": extras_items,
    }
