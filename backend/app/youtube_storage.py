"""Per-track YouTube links under [Artwork]/Links/ and optional release-level shortcuts."""
from __future__ import annotations

import re
from pathlib import Path

from app.lyrics_storage import resolve_artwork_for_audio
from app.release_track_extras import YOUTUBE_HOSTS, _normalize_youtube

LINKS_SUBDIR = "Links"
YOUTUBE_SUFFIX = ".youtube.txt"
ARTWORK_VIDEO_FILES = (
    "Official Video.url",
    "official video.url",
    "YouTube.url",
    "youtube.url",
    "youtube.txt",
    "YouTube.txt",
)
URL_LINE_RE = re.compile(r"^URL=(.+)$", re.I | re.M)


def _read_text_url(path: Path) -> str | None:
    try:
        raw = path.read_text(encoding="utf-8-sig").strip()
    except OSError:
        return None
    if not raw:
        return None
    if path.suffix.casefold() == ".url":
        match = URL_LINE_RE.search(raw)
        if match:
            raw = match.group(1).strip()
    first_line = raw.splitlines()[0].strip()
    return _normalize_youtube(first_line)


def youtube_sidecar_path(audio_file: Path) -> Path | None:
    art = resolve_artwork_for_audio(audio_file)
    if not art:
        return None
    return art / LINKS_SUBDIR / f"{audio_file.stem}{YOUTUBE_SUFFIX}"


def ensure_youtube_sidecar_dir(audio_file: Path) -> Path | None:
    art = resolve_artwork_for_audio(audio_file)
    if not art:
        return None
    dest_dir = art / LINKS_SUBDIR
    dest_dir.mkdir(parents=True, exist_ok=True)
    return dest_dir / f"{audio_file.stem}{YOUTUBE_SUFFIX}"


def _artwork_root_video(art: Path) -> str | None:
    for name in ARTWORK_VIDEO_FILES:
        candidate = art / name
        if candidate.is_file():
            url = _read_text_url(candidate)
            if url:
                return url
    return None


def find_youtube_url_for_audio(audio_file: Path) -> str | None:
    if not audio_file.is_file():
        return None
    sidecar = youtube_sidecar_path(audio_file)
    if sidecar and sidecar.is_file():
        url = _read_text_url(sidecar)
        if url:
            return url
    art = resolve_artwork_for_audio(audio_file)
    if art:
        return _artwork_root_video(art)
    return None


def save_youtube_url_for_audio(audio_file: Path, url: str | None) -> bool:
    dest = ensure_youtube_sidecar_dir(audio_file)
    if not dest:
        return False
    normalized = _normalize_youtube(url or "")
    if not normalized:
        if dest.is_file():
            dest.unlink(missing_ok=True)
        return True
    dest.write_text(normalized + "\n", encoding="utf-8")
    return True


def is_youtube_url(url: str) -> bool:
    return bool(_normalize_youtube(url)) and any(
        host in url.casefold() for host in YOUTUBE_HOSTS
    )
