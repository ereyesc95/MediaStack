from __future__ import annotations

from pathlib import Path
from urllib.parse import quote, unquote, urlparse

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


def resolve_playback_url(path: str) -> str:
    """URL for in-app playback; prefer local API stream when file is on disk."""
    local = path_to_local_file(path)
    if local and local.is_file():
        rel = path.strip().replace("\\", "/")
        return f"/api/music/stream?path={quote(rel, safe='/:@')}"
    return resolve_stream_url(path)


def path_to_local_file(path: str) -> Path | None:
    if not settings.media_root:
        return None
    path = path.strip()
    if path.startswith("http"):
        parsed = urlparse(path)
        path = unquote(parsed.path.lstrip("/"))
        prefix = urlparse(settings.media_server_url).path.strip("/")
        if prefix and path.startswith(prefix + "/"):
            path = path[len(prefix) + 1 :]
    root = Path(settings.media_root)
    candidate = root / path.replace("/", "\\") if "\\" in str(root) else root / path
    if candidate.is_file():
        return candidate
    return None
