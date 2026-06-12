from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import httpx

from app.lyrics_storage import find_lrc_path
from app.media_paths import path_to_local_file
from app.paths import DATA_DIR

LYRICS_CACHE_DIR = DATA_DIR / "lyrics_cache"
LRC_TAG_RE = re.compile(r"\[[^\]]+\]")


def _cache_key(artist: str, title: str) -> str:
    raw = f"{artist.casefold()}|{title.casefold()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def _cache_path(artist: str, title: str) -> Path:
    LYRICS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return LYRICS_CACHE_DIR / f"{_cache_key(artist, title)}.json"


def _read_cache(artist: str, title: str) -> dict | None:
    path = _cache_path(artist, title)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _write_cache(artist: str, title: str, *, lyrics: str, source: str) -> None:
    path = _cache_path(artist, title)
    try:
        path.write_text(
            json.dumps(
                {"artist": artist, "title": title, "lyrics": lyrics, "source": source},
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
    except OSError:
        pass


def _strip_lrc_tags(text: str) -> str:
    lines = []
    for line in text.splitlines():
        cleaned = LRC_TAG_RE.sub("", line).strip()
        if cleaned:
            lines.append(cleaned)
    return "\n".join(lines)


def _read_lrc_file(play_path: str) -> str | None:
    local = path_to_local_file(play_path)
    if not local:
        return None
    candidate = find_lrc_path(local)
    if not candidate:
        return None
    try:
        raw = candidate.read_text(encoding="utf-8", errors="replace")
        text = _strip_lrc_tags(raw).strip()
        return text or None
    except OSError:
        return None


async def fetch_lrclib_synced(
    artist: str,
    title: str,
    *,
    album: str | None = None,
    duration: float | None = None,
) -> str | None:
    """Return raw synced LRC text from LRCLIB (timestamps preserved)."""
    params: dict[str, str | int] = {
        "artist_name": artist.strip(),
        "track_name": title.strip(),
    }
    if album and album.strip():
        params["album_name"] = album.strip()
    if duration and duration > 0:
        params["duration"] = int(round(duration))

    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get("https://lrclib.net/api/get", params=params)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
    synced = (data.get("syncedLyrics") or "").strip()
    return synced or None


async def _fetch_lrclib(artist: str, title: str) -> str | None:
    synced = await fetch_lrclib_synced(artist, title)
    if synced:
        return _strip_lrc_tags(synced)
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(
            "https://lrclib.net/api/get",
            params={"artist_name": artist, "track_name": title},
        )
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
    plain = (data.get("plainLyrics") or "").strip()
    return plain or None


async def _fetch_lyrics_ovh(artist: str, title: str) -> str | None:
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(f"https://api.lyrics.ovh/v1/{artist}/{title}")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
    return data.get("lyrics")


async def resolve_lyrics(
    artist: str,
    title: str,
    *,
    play_path: str | None = None,
) -> tuple[str | None, str | None]:
    """Return (lyrics_text, source). Sources: cache, lrc, lrclib, lyrics.ovh."""
    artist = artist.strip()
    title = title.strip()
    if not artist or not title:
        return None, None

    cached = _read_cache(artist, title)
    if cached and cached.get("lyrics"):
        return cached["lyrics"], cached.get("source") or "cache"

    if play_path:
        lrc = _read_lrc_file(play_path)
        if lrc:
            _write_cache(artist, title, lyrics=lrc, source="lrc")
            return lrc, "lrc"

    try:
        lrclib = await _fetch_lrclib(artist, title)
        if lrclib:
            _write_cache(artist, title, lyrics=lrclib, source="lrclib")
            return lrclib, "lrclib"
    except Exception:
        pass

    try:
        ovh = await _fetch_lyrics_ovh(artist, title)
        if ovh:
            _write_cache(artist, title, lyrics=ovh, source="lyrics.ovh")
            return ovh, "lyrics.ovh"
    except Exception:
        pass

    return None, None


async def fetch_lyrics(artist: str, title: str) -> str | None:
    lyrics, _ = await resolve_lyrics(artist, title)
    return lyrics
