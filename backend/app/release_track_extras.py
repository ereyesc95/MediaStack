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
        video = _normalize_youtube(row.tra_video or "")
        if not video:
            continue
        name = (row.tra_name or "").strip()
        if not name:
            continue
        key = _normalize_title(name)
        if key and key not in out:
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
        out.append(
            {
                "title": file_title,
                "play_path": path,
                "album_title": album_title,
                "album_folder": album_path,
                "cover_url": cover_url,
                "date_iso": date_iso,
            }
        )
        if len(out) >= limit:
            break
    out.sort(key=lambda v: (v.get("date_iso") or "", v.get("album_title") or ""))
    return out
