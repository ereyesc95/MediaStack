from __future__ import annotations

import asyncio
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

import httpx

from sqlalchemy.orm import Session

from app.lyrics_storage import find_lrc_path
from app.media_paths import path_to_local_file
from app.paths import DATA_DIR

LYRICS_CACHE_DIR = DATA_DIR / "lyrics_cache"
LRC_TAG_RE = re.compile(r"\[[^\]]+\]")
LYRICS_HTTP_TIMEOUT = 8.0
LYRICS_CONNECT_TIMEOUT = 3.0


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


def _strip_paren_subtitle(title: str) -> str | None:
    match = re.match(r"^(.+?)\s*\([^)]+\)\s*$", title.strip())
    return match.group(1).strip() if match else None


def _lyrics_title_variants(title: str) -> list[str]:
    from app.lyrics_storage import lrclib_title_variants

    seen: set[str] = set()
    out: list[str] = []
    canonical = _canonical_lyrics_title(title)
    paren_variants = [
        _strip_paren_subtitle(canonical),
        _strip_paren_subtitle(title.strip()),
    ]
    for candidate in (
        canonical,
        title.strip(),
        re.split(r"\s*;\s*", title.strip(), maxsplit=1)[0].strip(),
        *paren_variants,
        *lrclib_title_variants(canonical),
        *lrclib_title_variants(title.strip()),
    ):
        if not candidate:
            continue
        key = candidate.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(candidate)
    return out or [canonical or title.strip()]


def _canonical_lyrics_title(title: str) -> str:
    raw = title.strip()
    if not raw:
        return raw
    bracket = re.match(r"^(.+?)\s*\[([^\]]+)\]\s*$", raw)
    if bracket:
        return bracket.group(1).strip()
    return raw


def _http_timeout() -> httpx.Timeout:
    return httpx.Timeout(LYRICS_HTTP_TIMEOUT, connect=LYRICS_CONNECT_TIMEOUT)


async def _race_lyrics_tasks(tasks: list[asyncio.Task[str | None]]) -> str | None:
    pending = set(tasks)
    try:
        while pending:
            done, pending = await asyncio.wait(
                pending, return_when=asyncio.FIRST_COMPLETED
            )
            for task in done:
                try:
                    result = task.result()
                except Exception:
                    result = None
                if result:
                    for other in pending:
                        other.cancel()
                    return result
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
    return None


async def _fetch_lrclib_search(artist: str, title: str) -> str | None:
    query = f"{artist.strip()} {title.strip()}"
    async with httpx.AsyncClient(timeout=_http_timeout()) as client:
        r = await client.get("https://lrclib.net/api/search", params={"q": query})
        if r.status_code != 200:
            return None
        items = r.json()
    if not isinstance(items, list):
        return None
    want_artist = artist.strip().casefold()
    want_title = title.strip().casefold()
    for item in items:
        if not isinstance(item, dict):
            continue
        item_artist = (item.get("artistName") or "").strip().casefold()
        item_title = (item.get("trackName") or "").strip().casefold()
        if item_artist != want_artist and want_artist not in item_artist:
            continue
        if item_title != want_title and want_title not in item_title:
            continue
        synced = (item.get("syncedLyrics") or "").strip()
        if synced:
            return _strip_lrc_tags(synced)
        plain = (item.get("plainLyrics") or "").strip()
        if plain:
            return plain
    for item in items:
        if not isinstance(item, dict):
            continue
        synced = (item.get("syncedLyrics") or "").strip()
        if synced:
            return _strip_lrc_tags(synced)
        plain = (item.get("plainLyrics") or "").strip()
        if plain:
            return plain
    return None


def _read_lrc_file(play_path: str, db: Session | None = None) -> str | None:
    if db is not None:
        from app.track_overrides import read_lyrics_lrc, read_lyrics_plain

        lrc = read_lyrics_lrc(db, play_path)
        if lrc:
            return _strip_lrc_tags(lrc).strip() or None
        plain = read_lyrics_plain(db, play_path)
        if plain:
            return plain
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

    try:
        async with httpx.AsyncClient(timeout=_http_timeout()) as client:
            r = await client.get("https://lrclib.net/api/get", params=params)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            data = r.json()
    except (httpx.TimeoutException, httpx.HTTPError, ValueError):
        return None
    synced = (data.get("syncedLyrics") or "").strip()
    return synced or None


async def _fetch_lrclib(artist: str, title: str) -> str | None:
    params = {"artist_name": artist.strip(), "track_name": title.strip()}
    async with httpx.AsyncClient(timeout=_http_timeout()) as client:
        r = await client.get("https://lrclib.net/api/get", params=params)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
    synced = (data.get("syncedLyrics") or "").strip()
    if synced:
        return _strip_lrc_tags(synced)
    plain = (data.get("plainLyrics") or "").strip()
    return plain or None


async def _fetch_lyrics_ovh(artist: str, title: str) -> str | None:
    artist_q = quote(artist.strip(), safe="")
    title_q = quote(title.strip(), safe="")
    async with httpx.AsyncClient(timeout=_http_timeout()) as client:
        r = await client.get(f"https://api.lyrics.ovh/v1/{artist_q}/{title_q}")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
    lyrics = data.get("lyrics")
    return lyrics.strip() if isinstance(lyrics, str) and lyrics.strip() else None


async def _fetch_remote_lyrics(artist: str, title: str) -> tuple[str | None, str | None]:
    variants = _lyrics_title_variants(title)
    for batch_start in range(0, len(variants), 5):
        batch = variants[batch_start : batch_start + 5]
        if not batch:
            break
        tasks: list[asyncio.Task[str | None]] = []
        for variant in batch:
            tasks.append(asyncio.create_task(_fetch_lrclib(artist, variant)))
            tasks.append(asyncio.create_task(_fetch_lyrics_ovh(artist, variant)))
        if batch_start == 0:
            tasks.append(asyncio.create_task(_fetch_lrclib_search(artist, batch[0])))
        lyrics = await _race_lyrics_tasks(tasks)
        if lyrics:
            return lyrics, "lrclib"
    if variants:
        retry = await _fetch_lrclib(artist, variants[0])
        if retry:
            return retry, "lrclib"
        retry = await _fetch_lyrics_ovh(artist, variants[0])
        if retry:
            return retry, "lyrics.ovh"
    return None, None


def _read_raw_lrc_file(play_path: str, db: Session | None = None) -> str | None:
    if db is not None:
        from app.track_overrides import read_lyrics_lrc

        lrc = read_lyrics_lrc(db, play_path)
        if lrc:
            return lrc
    local = path_to_local_file(play_path)
    if not local:
        return None
    candidate = find_lrc_path(local)
    if not candidate:
        return None
    try:
        raw = candidate.read_text(encoding="utf-8", errors="replace").strip()
        return raw or None
    except OSError:
        return None


async def resolve_lyrics(
    artist: str,
    title: str,
    *,
    play_path: str | None = None,
    db: Session | None = None,
) -> tuple[str | None, str | None]:
    """Return (lyrics_text, source). Sources: cache, lrc, lrclib, lyrics.ovh."""
    artist = artist.strip()
    title = _canonical_lyrics_title(title.strip())
    if not artist or not title:
        return None, None

    cached = _read_cache(artist, title)
    if cached and cached.get("lyrics"):
        return cached["lyrics"], cached.get("source") or "cache"

    if play_path:
        lrc = _read_lrc_file(play_path, db=db)
        if lrc:
            _write_cache(artist, title, lyrics=lrc, source="lrc")
            return lrc, "lrc"

    lyrics, source = await _fetch_remote_lyrics(artist, title)
    if lyrics and source:
        _write_cache(artist, title, lyrics=lyrics, source=source)
        return lyrics, source

    return None, None


def save_manual_lyrics(
    artist: str,
    title: str,
    lyrics: str,
    *,
    play_path: str | None = None,
    synced_lyrics: str | None = None,
    preserve_synced: bool = False,
    db: Session | None = None,
    band_id: int | None = None,
) -> None:
    artist = artist.strip()
    title = title.strip()
    text = lyrics.strip()
    if not artist or not title or not text:
        raise ValueError("Artist, title, and lyrics are required")

    cache_title = _canonical_lyrics_title(title)
    _write_cache(artist, cache_title, lyrics=text, source="manual")

    if not play_path or db is None:
        return
    from app.track_overrides import read_lyrics_lrc, save_lyrics

    lrc_to_save: str | None
    if preserve_synced:
        lrc_to_save = read_lyrics_lrc(db, play_path)
    else:
        lrc_to_save = (synced_lyrics or "").strip() or None

    save_lyrics(
        db,
        play_path=play_path,
        band_id=band_id,
        title=title,
        lyrics_plain=text,
        lyrics_lrc=lrc_to_save,
    )


async def fetch_lyrics(artist: str, title: str) -> str | None:
    lyrics, _ = await resolve_lyrics(artist, title)
    return lyrics
