"""Shared [Artwork] filename stems and track-specific lookups."""
from __future__ import annotations

import re
from pathlib import Path

from app.band_library import _strip_bracket_suffix
from app.gallery import IMAGE_EXTS, _media_url
from app.media_index import _artwork_file

COVER_FRONT_STEM = "cover - front"
COVER_ALBUM_STEM = "cover - album"
COVER_BACK_STEM = "cover - back"
COVER_INNER_STEM = "cover - inner"
ANIMATION_ALBUM_STEM = "animation - album"
LEGACY_COVER_ANIMATION_STEM = "cover - animation"
CANVAS_ALBUM_STEM = "canvas - album"
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v"}


def clean_track_title_for_stem(track_title: str) -> str:
    clean = _strip_bracket_suffix(track_title.strip())
    clean = re.sub(r"\s*\(.*\)\s*$", "", clean).strip()
    return clean


def track_stem(prefix: str, track_title: str) -> str:
    return f"{prefix} - {clean_track_title_for_stem(track_title)}"


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
        if path.is_file() and path.suffix.lower() in exts and path.stem.casefold() == want:
            return path
    return None


def resolve_cover_front_file(artwork: Path | None) -> Path | None:
    if not artwork or not artwork.is_dir():
        return None
    cover = _artwork_file(artwork, COVER_FRONT_STEM)
    if cover:
        return cover
    return _artwork_file(artwork, COVER_ALBUM_STEM)


def resolve_animation_album_file(artwork: Path | None) -> Path | None:
    if not artwork or not artwork.is_dir():
        return None
    found = _media_file_in_artwork(artwork, ANIMATION_ALBUM_STEM, allow_video=True)
    if found:
        return found
    return _media_file_in_artwork(
        artwork, LEGACY_COVER_ANIMATION_STEM, allow_video=True
    )


def resolve_canvas_album_file(artwork: Path | None) -> Path | None:
    if not artwork or not artwork.is_dir():
        return None
    return _media_file_in_artwork(artwork, CANVAS_ALBUM_STEM, allow_video=True)


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
