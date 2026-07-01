"""Artist system playlists (Top Tracks, Setlists, …)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import match_top_tracks
from app.config import settings
from app.cross_artist_playlists import CROSS_PLAYLIST_LABELS
from app.extended_system_playlists import (
    EXTENDED_PLAYLIST_LABELS,
    scan_extended_playlists,
)
from app.gallery import _artist_dir
from app.models import Band
from app.paths import DATA_DIR
from app.system_playlists import ORIGINALS_SLUG, PLAYLIST_RULES, playlist_cards_from_buckets, playlist_cover_url
from app.playlist_tracks import (
    PLAYLIST_DESCRIPTIONS,
    enrich_playlist_tracks,
)

PLAYLIST_INDEX_VERSION = 14

PLAYLIST_LABELS: dict[str, str] = {
    "top-tracks": "Top Tracks",
    "setlists": "Setlists",
    **{slug: label for slug, label, _ in PLAYLIST_RULES},
    ORIGINALS_SLUG: "Originals",
    **CROSS_PLAYLIST_LABELS,
    **EXTENDED_PLAYLIST_LABELS,
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def _merge_track_lists(*lists: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for tracks in lists:
        for track in tracks:
            key = track.get("play_path") or track.get("title")
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(track)
    return out


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
    return {
        "slug": "top-tracks",
        "name": "Top Tracks",
        "track_count": len(matched),
        "cover_url": playlist_cover_url("top-tracks"),
    }



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
        "cover_url": playlist_cover_url("setlists"),
    }


def _build_setlists_detail(db: Session, band: Band, media_root: Path) -> dict | None:
    mbid = (band.bnd_code or "").strip()
    if not mbid:
        return None
    if not _get_setlistfm_key(db):
        return None

    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir or not _artist_has_audio_entries(artist_dir):
        return None

    from app.setlist_playlists import build_setlists_playlist_detail, years_with_activity

    api_key = _get_setlistfm_key(db)
    years = years_with_activity(band, api_key=api_key) if api_key else None
    return build_setlists_playlist_detail(band, years=years)


def _suffix_buckets(band: Band, media_root: Path) -> dict[str, list[dict]]:
    from app.system_playlists import scan_suffix_playlists

    return scan_suffix_playlists(band, media_root)


def _cross_buckets(db: Session, band: Band, media_root: Path) -> dict[str, list[dict]]:
    from app.cross_artist_playlists import scan_cross_artist_playlists

    return scan_cross_artist_playlists(db, band, media_root)


def _all_track_buckets(
    db: Session,
    band: Band,
    media_root: Path,
    *,
    user_id: int = 1,
) -> dict[str, list[dict]]:
    suffix = _suffix_buckets(band, media_root)
    cross = _cross_buckets(db, band, media_root)
    extended = scan_extended_playlists(db, band, media_root, user_id=user_id)
    merged = {**suffix, **cross, **extended}
    merged["bonus-tracks"] = _merge_track_lists(
        suffix.get("bonus-tracks") or [],
        extended.get("bonus-tracks") or [],
    )
    merged["b-sides"] = _merge_track_lists(
        suffix.get("b-sides") or [],
        extended.get("b-sides") or [],
    )
    merged["tributes"] = _merge_track_lists(
        suffix.get("tributes") or [],
        cross.get("tributes") or [],
    )
    return merged


def build_playlist_index(
    db: Session,
    band: Band,
    media_root: Path,
    *,
    user_id: int = 1,
) -> tuple[list[dict], dict[str, list[dict]], dict[str, list[dict]], dict[str, list[dict]]]:
    playlists: list[dict] = []
    top = _build_top_tracks(band, media_root)
    if top:
        playlists.append(top)
    setlists = _build_setlists(db, band, media_root)
    if setlists:
        playlists.append(setlists)

    suffix = _suffix_buckets(band, media_root)
    cross = _cross_buckets(db, band, media_root)
    extended = scan_extended_playlists(db, band, media_root, user_id=user_id)
    buckets = _all_track_buckets(db, band, media_root, user_id=user_id)

    most = buckets.get("most-played") or []
    card_buckets = {k: v for k, v in buckets.items() if k != "most-played"}
    if most:
        playlists.append(
            {
                "slug": "most-played",
                "name": "Most Played",
                "track_count": len(most),
                "cover_url": playlist_cover_url("most-played"),
            }
        )

    extra = tuple(CROSS_PLAYLIST_LABELS.items()) + tuple(EXTENDED_PLAYLIST_LABELS.items())
    playlists.extend(playlist_cards_from_buckets(card_buckets, extra=extra))
    playlists.sort(key=lambda p: (p.get("name") or "").casefold())
    return playlists, suffix, cross, buckets


def get_playlist_index(
    db: Session,
    band: Band,
    *,
    force: bool = False,
    user_id: int = 1,
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

    playlists, suffix, cross, buckets = build_playlist_index(
        db, band, media_root, user_id=user_id
    )
    payload = {
        "band_id": band.bnd_id,
        "index_version": PLAYLIST_INDEX_VERSION,
        "audio_mtime": audio_mtime,
        "scanned_at": _now(),
        "playlists": playlists,
        "suffix_buckets": suffix,
        "cross_buckets": cross,
        "track_buckets": buckets,
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


def _tracks_from_cache(
    db: Session,
    band: Band,
    media_root: Path,
    slug: str,
    *,
    user_id: int = 1,
) -> list[dict] | None:
    cache_file = _cache_path(band.bnd_id)
    buckets: dict[str, list[dict]] | None = None
    if cache_file.is_file():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            if cached.get("index_version") == PLAYLIST_INDEX_VERSION:
                buckets = cached.get("track_buckets")
        except (json.JSONDecodeError, OSError):
            buckets = None
    if buckets is None:
        buckets = _all_track_buckets(db, band, media_root, user_id=user_id)
    from app.system_playlists import tracks_for_slug

    tracks = tracks_for_slug(buckets, slug)
    return tracks if tracks else None


def _playlist_neighbors(
    playlists: list[dict], slug: str
) -> tuple[dict | None, dict | None]:
    ordered = sorted(playlists, key=lambda p: (p.get("name") or "").casefold())
    slugs = [p.get("slug") for p in ordered if p.get("slug")]
    if slug not in slugs or len(slugs) < 2:
        return None, None
    idx = slugs.index(slug)
    prev = ordered[(idx - 1) % len(ordered)]
    nxt = ordered[(idx + 1) % len(ordered)]
    return (
        {"slug": prev["slug"], "name": prev.get("name") or prev["slug"]},
        {"slug": nxt["slug"], "name": nxt.get("name") or nxt["slug"]},
    )


def _finalize_playlist_detail(
    db: Session,
    band: Band,
    media_root: Path,
    slug: str,
    detail: dict,
    *,
    user_id: int = 1,
) -> dict:
    index = get_playlist_index(db, band, user_id=user_id)
    playlists = index.get("playlists") or []
    prev, nxt = _playlist_neighbors(playlists, slug)
    tracks = enrich_playlist_tracks(detail.get("tracks") or [], media_root, db=db)
    return {
        **detail,
        "slug": slug,
        "name": detail.get("name") or PLAYLIST_LABELS.get(slug, slug.replace("-", " ").title()),
        "description": PLAYLIST_DESCRIPTIONS.get(slug, ""),
        "cover_url": playlist_cover_url(slug),
        "tracks": tracks,
        "prev": prev,
        "next": nxt,
    }


def get_playlist_detail(
    db: Session,
    band: Band,
    media_root: Path,
    slug: str,
    *,
    user_id: int = 1,
) -> dict | None:
    if slug == "top-tracks":
        tracks = get_top_tracks_playlist_tracks(band, media_root)
        if not tracks:
            return None
        return _finalize_playlist_detail(
            db,
            band,
            media_root,
            slug,
            {
                "slug": slug,
                "name": PLAYLIST_LABELS.get(slug, "Top Tracks"),
                "tracks": tracks,
            },
            user_id=user_id,
        )

    if slug == "setlists":
        detail = _build_setlists_detail(db, band, media_root)
        if not detail:
            return None
        return _finalize_playlist_detail(db, band, media_root, slug, detail, user_id=user_id)

    tracks = _tracks_from_cache(db, band, media_root, slug, user_id=user_id)
    if not tracks:
        return None
    return _finalize_playlist_detail(
        db,
        band,
        media_root,
        slug,
        {
            "slug": slug,
            "name": PLAYLIST_LABELS.get(slug, slug.replace("-", " ").title()),
            "tracks": tracks,
        },
        user_id=user_id,
    )


def get_suffix_playlist_tracks(
    db: Session,
    band: Band,
    media_root: Path,
    slug: str,
    *,
    user_id: int = 1,
) -> list[dict] | None:
    detail = get_playlist_detail(db, band, media_root, slug, user_id=user_id)
    if not detail:
        return None
    return detail.get("tracks")


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
