"""Track versions scan and YouTube links for release tracklist."""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.band_library import (
    _album_title_from_folder,
    _collect_audio_files,
    _find_cover_front_artwork,
    _parse_folder_date,
    _track_title_from_filename,
)
from app.config import settings
from app.gallery import _artist_dir
from app.media_paths_util import safe_relative
from app.models import Band, Track
from app.music_filters import _parse_ids
YOUTUBE_HOSTS = ("youtube.com", "youtu.be", "music.youtube.com")


def _normalize_title(title: str) -> str:
    return re.sub(r"\s*\[.*\]\s*$", "", title.strip()).casefold()


def _youtube_title_keys(title: str) -> list[str]:
    raw = title.strip()
    if not raw:
        return []
    keys: list[str] = []
    for candidate in (
        raw,
        re.sub(r"\s*\([^)]*\)\s*$", "", raw).strip(),
        re.sub(r"\s*\[[^\]]*\]\s*$", "", raw).strip(),
    ):
        key = _normalize_title(candidate)
        if key and key not in keys:
            keys.append(key)
    return keys


def _lookup_youtube(youtube_map: dict[str, str], title: str) -> str | None:
    for key in _youtube_title_keys(title):
        url = youtube_map.get(key)
        if url:
            return url
    return None


def _normalize_youtube(url: str) -> str | None:
    raw = url.strip()
    if not raw:
        return None
    if raw.startswith("http"):
        if not any(h in raw.casefold() for h in YOUTUBE_HOSTS):
            return raw if "youtube" in raw.casefold() else None
        return raw
    if re.match(r"^[A-Za-z0-9_-]{6,}$", raw):
        return f"https://www.youtube.com/watch?v={raw}"
    return None


def _youtube_map_for_band(db: Session, band_id: int) -> dict[str, str]:
    needle = str(band_id)
    out: dict[str, str] = {}
    for row in db.scalars(select(Track)).all():
        bid = row.tra_band_id or ""
        if bid != needle and needle not in _parse_ids(bid):
            continue
        name = (row.tra_name or "").strip()
        if not name:
            continue
        video = _normalize_youtube(row.tra_video or "")
        if not video:
            continue
        for label in (name, (row.tra_alt_name or "").strip()):
            if not label:
                continue
            for key in _youtube_title_keys(label):
                if key not in out:
                    out[key] = video
    return out


def _album_context(
    audio_file, media_root
) -> tuple[str | None, str | None, str | None, str | None]:
    album_dir = audio_file.parent
    while album_dir.name.casefold() in (
        "standard edition",
        "deluxe edition",
        "bonus",
    ):
        album_dir = album_dir.parent
    rel = safe_relative(album_dir, media_root)
    title = _album_title_from_folder(album_dir.name)
    cover = _find_cover_front_artwork(audio_file.parent, media_root)
    if not cover:
        cover = _find_cover_front_artwork(album_dir, media_root)
    date_iso = _parse_folder_date(album_dir.name) or _parse_folder_date(
        album_dir.parent.name
    )
    return title, rel, cover, date_iso


def find_track_versions(
    db: Session,
    band_id: int,
    *,
    title: str,
    play_path: str,
    release_id: str | None = None,
    limit: int = 25,
) -> list[dict]:
    band = db.get(Band, band_id)
    if not band or not settings.media_root:
        return []
    from pathlib import Path

    media_root = Path(settings.media_root)
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return []

    want = _normalize_title(title)
    if not want:
        return []

    from app.release_tracklist import (
        _db_duration_map,
        _duration_from_file,
        _format_duration,
        _normalize_title as _track_norm_title,
    )

    db_durations = _db_duration_map(db)
    art_ctx = None
    if release_id:
        from app.release_overview import resolve_release_content
        from app.release_playback_art import PlaybackArtContext

        resolved = resolve_release_content(db, band_id, release_id)
        if resolved:
            band_row, card, _, content = resolved
            art_ctx = PlaybackArtContext(
                release_content=content,
                release_title=card.get("title"),
                band_name=band_row.bnd_name,
            )
    out: list[dict] = []
    seen: set[str] = set()
    for audio_file in _collect_audio_files(artist_dir):
        file_title = _track_title_from_filename(audio_file)
        if _normalize_title(file_title) != want:
            continue
        path = safe_relative(audio_file, media_root)
        if not path or path == play_path or path in seen:
            continue
        seen.add(path)
        album_title, album_path, cover_url, date_iso = _album_context(
            audio_file, media_root
        )
        from app.release_playback_art import playback_art_for_audio_file

        playback = playback_art_for_audio_file(audio_file, media_root, ctx=art_ctx)
        duration_sec = _duration_from_file(audio_file)
        if duration_sec is None:
            duration_sec = db_durations.get(_track_norm_title(file_title))
        out.append(
            {
                "title": file_title,
                "play_path": path,
                "album_title": album_title,
                "album_folder": album_path,
                "cover_url": playback.get("cover_url") or cover_url,
                "cover_animation_url": playback.get("cover_animation_url"),
                "canvas_url": playback.get("canvas_url"),
                "disc_url": playback.get("disc_url"),
                "background_layers": playback.get("background_layers") or [],
                "date_iso": date_iso,
                "duration": _format_duration(duration_sec),
            }
        )
        if len(out) >= limit:
            break
    out.sort(key=lambda v: (v.get("date_iso") or "", v.get("album_title") or ""))
    return out
