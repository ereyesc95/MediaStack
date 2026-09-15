"""Shared [Artwork] filename stems and track-specific lookups."""
from __future__ import annotations

import re
from pathlib import Path

from app.band_library import _strip_bracket_suffix
from app.gallery import IMAGE_EXTS, _media_url
from app.media_index import _artwork_file

COVER_FRONT_STEM = "cover - front"
COVER_ALBUM_STEM = "cover - album"
COVER_BANNER_STEM = "cover - banner"
COVER_LANDSCAPE_STEM = "cover - landscape"
COVER_PORTRAIT_STEM = "cover - portrait"
COVER_BACK_STEM = "cover - back"
COVER_INNER_STEM = "cover - inner"
COVER_ANIMATION_STEM = "cover - animation"
COVER_CANVAS_STEM = "cover - canvas"
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v"}


def clean_track_title_for_stem(track_title: str) -> str:
    clean = _strip_bracket_suffix(track_title.strip())
    clean = re.sub(r"\s*\(.*\)\s*$", "", clean).strip()
    return clean


def track_stem(prefix: str, track_title: str) -> str:
    return f"{prefix} - {clean_track_title_for_stem(track_title)}"


def _is_small_derivative(path: Path) -> bool:
    name = path.name.casefold()
    return "_small" in name or ".jpg_small" in name or "_small." in name


def _media_file_in_artwork(
    artwork: Path,
    stem: str,
    *,
    allow_video: bool = False,
) -> Path | None:
    want = stem.casefold()
    exts = set(IMAGE_EXTS)
    if allow_video:
        exts |= VIDEO_EXTS
    for path in artwork.iterdir():
        if (
            path.is_file()
            and path.suffix.lower() in exts
            and path.stem.casefold() == want
            and not _is_small_derivative(path)
        ):
            return path
    return None


def resolve_cover_front_file(artwork: Path | None) -> Path | None:
    if not artwork or not artwork.is_dir():
        return None
    cover = _artwork_file(artwork, COVER_FRONT_STEM)
    if cover and not _is_small_derivative(cover):
        return cover
    album = _artwork_file(artwork, COVER_ALBUM_STEM)
    if album and not _is_small_derivative(album):
        return album
    return None


def resolve_cover_banner_file(artwork: Path | None) -> Path | None:
    if not artwork or not artwork.is_dir():
        return None
    found = _artwork_file(artwork, COVER_BANNER_STEM)
    if found and not _is_small_derivative(found):
        return found
    return None


def resolve_cover_landscape_file(artwork: Path | None) -> Path | None:
    if not artwork or not artwork.is_dir():
        return None
    found = _artwork_file(artwork, COVER_LANDSCAPE_STEM)
    if found and not _is_small_derivative(found):
        return found
    return None


def resolve_cover_portrait_file(artwork: Path | None) -> Path | None:
    if not artwork or not artwork.is_dir():
        return None
    found = _artwork_file(artwork, COVER_PORTRAIT_STEM)
    if found and not _is_small_derivative(found):
        return found
    return None


def resolve_animation_album_file(artwork: Path | None) -> Path | None:
    """Cover - Animation (hard cut — no Animation - Album)."""
    if not artwork or not artwork.is_dir():
        return None
    return _media_file_in_artwork(artwork, COVER_ANIMATION_STEM, allow_video=True)


def resolve_canvas_album_file(artwork: Path | None) -> Path | None:
    """Cover - Canvas (hard cut — no Canvas - Album)."""
    if not artwork or not artwork.is_dir():
        return None
    return _media_file_in_artwork(artwork, COVER_CANVAS_STEM, allow_video=True)


def find_track_cover_file(artwork: Path | None, track_title: str) -> Path | None:
    if not artwork or not artwork.is_dir():
        return None
    return _media_file_in_artwork(artwork, track_stem("Cover", track_title))


def find_track_animation_file(artwork: Path | None, track_title: str) -> Path | None:
    if not artwork or not artwork.is_dir():
        return None
    return _media_file_in_artwork(
        artwork, track_stem("Animation", track_title), allow_video=True
    )


def find_track_canvas_file(artwork: Path | None, track_title: str) -> Path | None:
    if not artwork or not artwork.is_dir():
        return None
    return _media_file_in_artwork(
        artwork, track_stem("Canvas", track_title), allow_video=True
    )


def track_cover_url(
    artwork: Path | None, track_title: str, media_root: Path
) -> str | None:
    path = find_track_cover_file(artwork, track_title)
    return _media_url(path, media_root) if path else None


def track_animation_url(
    artwork: Path | None, track_title: str, media_root: Path
) -> str | None:
    path = find_track_animation_file(artwork, track_title)
    return _media_url(path, media_root) if path else None


def track_canvas_url(
    artwork: Path | None, track_title: str, media_root: Path
) -> str | None:
    path = find_track_canvas_file(artwork, track_title)
    return _media_url(path, media_root) if path else None
