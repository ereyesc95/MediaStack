"""Artist system playlists (Top Tracks, Setlists, …)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import (
    _collect_audio_files,
    _find_audio_by_title,
    match_top_tracks,
)
from app.config import settings
from app.gallery import _artist_dir
from app.models import Band
from app.paths import DATA_DIR
from app.services.setlistfm import fetch_artist_setlist_summaries, fetch_setlist_detail

PLAYLIST_INDEX_VERSION = 3

PLAYLIST_ORDER = (
    ("top-tracks", "Top Tracks"),
    ("setlists", "Setlists"),
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def playlist_cover_url(slug: str) -> str:
    return f"/api/assets/system/playlists/{slug}"


def _cache_path(band_id: int) -> Path:
    cache_dir = DATA_DIR / "media_index"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{band_id}_playlists.json"


def invalidate_playlist_cache(band_id: int) -> None:
    path = _cache_path(band_id)
    if path.is_file():
        try:
            path.unlink()
        except OSError:
            pass


def _get_setlistfm_key(db: Session) -> str | None:
    from app import crud

    return crud.get_setlistfm_key(db)


def _build_top_tracks(band: Band, media_root: Path) -> dict | None:
    tracks = match_top_tracks(
        band.bnd_name,
        media_root,
        top_paths=band.bnd_top_tracks,
        top_titles=band.bnd_top_100,
        limit=100,
    )
    matched = [t for t in tracks if t.get("play_path")]
    if not matched:
        return None
    cover = playlist_cover_url("top-tracks")
    return {
        "slug": "top-tracks",
        "name": "Top Tracks",
        "track_count": len(matched),
        "cover_url": cover,
    }


def _setlist_song_names(detail: dict) -> list[str]:
    names: list[str] = []
    for block in detail.get("sets", {}).get("set") or []:
        if isinstance(block, dict):
            songs = block.get("song") or []
            if isinstance(songs, dict):
                songs = [songs]
            for song in songs:
                if isinstance(song, dict):
                    name = (song.get("name") or "").strip()
                    if name:
                        names.append(name)
    return names


def _artist_has_audio_entries(artist_dir: Path) -> bool:
    from app.band_library import _audio_root

    audio = _audio_root(artist_dir)
    if not audio.is_dir():
        return False
    for child in audio.iterdir():
        if child.name.casefold() in ("desktop.ini", "thumbs.db"):
            continue
        if child.is_dir():
            return True
    return False


def _build_setlists(db: Session, band: Band, media_root: Path) -> dict | None:
    """Lightweight card: MBID + setlist.fm key + local audio (details load on open)."""
    mbid = (band.bnd_code or "").strip()
    if not mbid:
        return None
    if not _get_setlistfm_key(db):
        return None

    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir or not _artist_has_audio_entries(artist_dir):
        return None

    return {
        "slug": "setlists",
        "name": "Setlists",
        "track_count": 1,
        "cover_url": playlist_cover_url("setlists"),
    }


def _build_setlists_detail(db: Session, band: Band, media_root: Path) -> dict | None:
    """Full setlist.fm scan — used when opening the Setlists playlist."""
    mbid = (band.bnd_code or "").strip()
    if not mbid:
        return None
    api_key = _get_setlistfm_key(db)
    if not api_key:
        return None

    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return None
    local_files = _collect_audio_files(artist_dir)
    if not local_files:
        return None

    try:
        summaries = fetch_artist_setlist_summaries(mbid, api_key=api_key, max_pages=1)
    except Exception:
        return None
    if not summaries:
        return None

    matched_titles: set[str] = set()
    years: set[str] = set()
    show_count = len(summaries)

    for summary in summaries[:2]:
        event_date = (summary.get("eventDate") or "").strip()
        if len(event_date) >= 4:
            years.add(event_date[-4:])
        setlist_id = summary.get("id")
        if not setlist_id:
            continue
        try:
            detail = fetch_setlist_detail(setlist_id, api_key=api_key)
        except Exception:
            continue
        if not detail:
            continue
        for title in _setlist_song_names(detail):
            if _find_audio_by_title(local_files, title):
                matched_titles.add(title.casefold())
        if matched_titles:
            break

    if not matched_titles:
        return {
            "slug": "setlists",
            "name": "Setlists",
            "years": sorted(years, reverse=True),
            "show_count": show_count,
            "tracks": [],
        }

    return {
        "slug": "setlists",
        "name": "Setlists",
        "years": sorted(years, reverse=True),
        "show_count": show_count,
        "tracks": [],
    }


def _suffix_buckets(band: Band, media_root: Path) -> dict[str, list[dict]]:
    from app.system_playlists import scan_suffix_playlists

    return scan_suffix_playlists(band, media_root)


def build_playlist_index(
    db: Session, band: Band, media_root: Path
) -> tuple[list[dict], dict[str, list[dict]], dict[str, list[dict]]]:
    playlists: list[dict] = []
    top = _build_top_tracks(band, media_root)
    if top:
        playlists.append(top)
    setlists = _build_setlists(db, band, media_root)
    if setlists:
        playlists.append(setlists)
    buckets = _suffix_buckets(band, media_root)
    cross = _cross_buckets(db, band, media_root)
    merged = {**buckets, **cross}
    from app.cross_artist_playlists import CROSS_PLAYLIST_LABELS
    from app.system_playlists import playlist_cards_from_buckets

    extra = tuple(CROSS_PLAYLIST_LABELS.items())
    playlists.extend(playlist_cards_from_buckets(merged, extra=extra))
    playlists.sort(key=lambda p: (p.get("name") or "").casefold())
    return playlists, buckets, cross


def _cross_buckets(db: Session, band: Band, media_root: Path) -> dict[str, list[dict]]:
    from app.cross_artist_playlists import scan_cross_artist_playlists

    return scan_cross_artist_playlists(db, band, media_root)


def get_playlist_index(
    db: Session,
    band: Band,
    *,
    force: bool = False,
) -> dict:
    empty = {"playlists": [], "scanned_at": None, "cached": False}
    if not settings.media_root:
        return empty
    media_root = Path(settings.media_root)
    if not media_root.is_dir():
        return empty

    cache_file = _cache_path(band.bnd_id)
    artist_dir = _artist_dir(media_root, band.bnd_name)
    audio_mtime = 0.0
    if artist_dir:
        audio = artist_dir / "Audio"
        if not audio.is_dir():
            audio = artist_dir / "audio"
        if audio.is_dir():
            try:
                audio_mtime = audio.stat().st_mtime
            except OSError:
                pass

    if not force and cache_file.is_file():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            if (
                cached.get("audio_mtime") == audio_mtime
                and cached.get("index_version") == PLAYLIST_INDEX_VERSION
            ):
                return {
                    "playlists": cached.get("playlists") or [],
                    "scanned_at": cached.get("scanned_at"),
                    "cached": True,
                }
        except (json.JSONDecodeError, OSError):
            pass

    playlists, buckets, cross = build_playlist_index(db, band, media_root)
    payload = {
        "band_id": band.bnd_id,
        "index_version": PLAYLIST_INDEX_VERSION,
        "audio_mtime": audio_mtime,
        "scanned_at": _now(),
        "playlists": playlists,
        "suffix_buckets": buckets,
        "cross_buckets": cross,
    }
    try:
        cache_file.write_text(json.dumps(payload), encoding="utf-8")
    except OSError:
        pass
    return {
        "playlists": playlists,
        "scanned_at": payload["scanned_at"],
        "cached": False,
    }


def get_top_tracks_playlist_tracks(band: Band, media_root: Path) -> list[dict]:
    return [
        t
        for t in match_top_tracks(
            band.bnd_name,
            media_root,
            top_paths=band.bnd_top_tracks,
            top_titles=band.bnd_top_100,
            limit=100,
        )
        if t.get("play_path")
    ]


def get_suffix_playlist_tracks(
    db: Session,
    band: Band,
    media_root: Path,
    slug: str,
) -> list[dict] | None:
    cache_file = _cache_path(band.bnd_id)
    buckets: dict[str, list[dict]] | None = None
    cross: dict[str, list[dict]] | None = None
    if cache_file.is_file():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            buckets = cached.get("suffix_buckets")
            cross = cached.get("cross_buckets")
        except (json.JSONDecodeError, OSError):
            buckets = None
            cross = None
    if buckets is None:
        buckets = _suffix_buckets(band, media_root)
    if cross is None:
        cross = _cross_buckets(db, band, media_root)
    from app.system_playlists import tracks_for_slug

    tracks = tracks_for_slug(buckets, slug)
    if tracks:
        return tracks
    cross_tracks = tracks_for_slug(cross or {}, slug)
    return cross_tracks if cross_tracks else None


def has_playlists_quick(db: Session, band: Band, media_root: Path) -> bool:
    cache_file = _cache_path(band.bnd_id)
    if cache_file.is_file():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            if cached.get("playlists"):
                return True
        except (json.JSONDecodeError, OSError):
            pass
    return False
