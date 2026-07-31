"""Film trailer YouTube URL — sidecar under film [Artwork]/Links/."""
from __future__ import annotations

from pathlib import Path

from app.release_track_extras import _normalize_youtube
from app.series_paths import find_artwork_legacy
from app.youtube_storage import ARTWORK_VIDEO_FILES, _read_text_url

TRAILER_FILE_NAMES = (
    "Trailer.url",
    "trailer.url",
    "Trailer.youtube.txt",
    "trailer.youtube.txt",
    "YouTube.url",
    "youtube.url",
    "youtube.txt",
    "YouTube.txt",
)


def _links_dir(film_dir: Path) -> Path | None:
    art = find_artwork_legacy(film_dir)
    if not art:
        return None
    return art / "Links"


def find_film_trailer_url(film_dir: Path) -> str | None:
    if not film_dir.is_dir():
        return None
    links = _links_dir(film_dir)
    if links and links.is_dir():
        for name in TRAILER_FILE_NAMES:
            candidate = links / name
            if candidate.is_file():
                url = _read_text_url(candidate)
                if url:
                    return url
    art = find_artwork_legacy(film_dir)
    if art and art.is_dir():
        for name in (*TRAILER_FILE_NAMES, *ARTWORK_VIDEO_FILES):
            candidate = art / name
            if candidate.is_file():
                url = _read_text_url(candidate)
                if url:
                    return url
    return None


def save_film_trailer_url(film_dir: Path, url: str | None) -> str | None:
    """Write or clear trailer sidecar. Returns normalized URL or None."""
    art = find_artwork_legacy(film_dir)
    if not art:
        art = film_dir / "[Artwork]"
        art.mkdir(parents=True, exist_ok=True)
    dest_dir = art / "Links"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / "trailer.youtube.txt"
    normalized = _normalize_youtube(url or "") if url else None
    if not normalized:
        if dest.is_file():
            dest.unlink(missing_ok=True)
        return None
    dest.write_text(normalized + "\n", encoding="utf-8")
    return normalized
