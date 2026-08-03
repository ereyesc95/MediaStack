"""Film trailer YouTube URL — database only (no local sidecar files)."""
from __future__ import annotations

from app.release_track_extras import _normalize_youtube


def find_film_trailer_url(film_dir=None) -> str | None:
    """Deprecated disk lookup — trailers live in DB meta only."""
    return None


def save_film_trailer_url(film_dir=None, url: str | None = None) -> str | None:
    """Normalize a trailer URL without writing files. Returns URL or None."""
    if not url:
        return None
    return _normalize_youtube(url) or None
