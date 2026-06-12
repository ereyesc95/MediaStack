"""Search releases and tracks within an artist library."""
from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import _collect_audio_files, _track_title_from_filename
from app.config import settings
from app.gallery import _artist_dir
from app.media_index import get_audio_index
from app.media_paths_util import safe_relative
from app.models import Band
from app.release_tracklist import _normalize_title

MAX_RESULTS = 20


def _match_query(text: str, query: str) -> bool:
    return query in _normalize_title(text)


def search_artist_media(
    db: Session,
    band_id: int,
    query: str,
    *,
    limit: int = MAX_RESULTS,
) -> dict | None:
    band = db.get(Band, band_id)
    if not band or not settings.media_root:
        return None
    q = query.strip().casefold()
    if len(q) < 2:
        return {"releases": [], "tracks": []}

    media_root = Path(settings.media_root)
    audio_data = get_audio_index(db, band, force=False)
    releases_out: list[dict] = []
    seen_release_ids: set[str] = set()

    for card in audio_data.get("releases") or []:
        rid = card.get("id")
        if not rid or rid in seen_release_ids:
            continue
        title = card.get("title") or ""
        if not _match_query(title, q):
            continue
        seen_release_ids.add(rid)
        releases_out.append(
            {
                "id": rid,
                "title": title,
                "cover_url": card.get("cover_url"),
                "display_date": card.get("display_date"),
                "category": card.get("category"),
            }
        )
        if len(releases_out) >= limit:
            break

    tracks_out: list[dict] = []
    seen_paths: set[str] = set()
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if artist_dir:
        for audio_file in _collect_audio_files(artist_dir):
            title = _track_title_from_filename(audio_file)
            if not _match_query(title, q):
                continue
            play_path = safe_relative(audio_file, media_root)
            if not play_path or play_path in seen_paths:
                continue
            seen_paths.add(play_path)
            album_dir = audio_file.parent
            while album_dir.name.casefold() in (
                "standard edition",
                "deluxe edition",
                "bonus",
            ):
                album_dir = album_dir.parent
            album_name = re.sub(r"^\d{4}[\d.\s]*", "", album_dir.name).strip()
            tracks_out.append(
                {
                    "title": title,
                    "play_path": play_path,
                    "album_title": album_name or None,
                }
            )
            if len(tracks_out) >= limit:
                break

    return {"releases": releases_out, "tracks": tracks_out}
