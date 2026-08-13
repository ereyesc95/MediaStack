from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

from app.config import settings


def resolve_stream_url(path: str) -> str:
    """Turn DB path or relative file path into a playable URL."""
    path = path.strip()
    if not path:
        return ""
    if path.startswith("http://") or path.startswith("https://"):
        return path
    base = settings.media_server_url.rstrip("/")
    rel = path.replace("\\", "/").lstrip("/")
    return f"{base}/{quote(rel, safe='/:@')}"


def path_to_local_file(path: str) -> Path | None:
    if not settings.media_root:
        return None
    from app.band_library import resolve_track_file_path

    return resolve_track_file_path(path, Path(settings.media_root))


def resolve_playback_url(path: str) -> str:
    """URL for in-app playback; prefer local API stream when file is on disk."""
    local = path_to_local_file(path)
    if local and local.is_file():
        root = Path(settings.media_root).resolve()
        try:
            rel = local.resolve().relative_to(root).as_posix()
        except ValueError:
            rel = path.strip().replace("\\", "/")
        return f"/api/music/stream?path={quote(rel, safe='')}"
    return resolve_stream_url(path)
