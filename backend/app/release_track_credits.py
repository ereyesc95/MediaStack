"""Track writing credits from legacy DB."""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Artist, Band, Release, Track
from app.music_filters import _parse_ids
from app.release_overview import _match_db_release, resolve_release_content
from app.release_tracklist import _normalize_title

SEP_RE = re.compile(r"[■;]")


def _split_names(raw: str | None) -> list[str]:
    if not raw:
        return []
    out: list[str] = []
    for part in SEP_RE.split(raw):
        name = part.strip().replace("█", "'").replace("■", ",")
        if name and name not in out:
            out.append(name)
    return out


def _artist_names(db: Session, ids: list[int]) -> list[str]:
    names: list[str] = []
    for aid in ids:
        row = db.get(Artist, aid)
        if row and row.art_name:
            n = row.art_name.strip()
            if n and n not in names:
                names.append(n)
    return names


def _track_row(db: Session, band_id: int, title: str) -> Track | None:
    want = _normalize_title(title)
    needle = str(band_id)
    for row in db.scalars(select(Track)).all():
        bid = row.tra_band_id or ""
        if bid != needle and needle not in _parse_ids(bid):
            continue
        name = (row.tra_name or "").strip()
        if _normalize_title(name) == want:
            return row
    return None


def get_track_credits(
    db: Session,
    band_id: int,
    release_id: str,
    *,
    title: str,
) -> dict:
    resolved = resolve_release_content(db, band_id, release_id)
    if not resolved:
        return {"title": title, "writers": [], "composers": [], "lyricists": [], "source": None}

    band, card, _, _ = resolved
    album_title = card.get("title") or ""

    writers: list[str] = []
    composers: list[str] = []
    lyricists: list[str] = []
    source: str | None = None

    track = _track_row(db, band_id, title)
    if track and track.tra_author_id:
        ids = _parse_ids(track.tra_author_id)
        writers = _artist_names(db, ids)
        if writers:
            source = "track"

    if not writers:
        rel = _match_db_release(db, band_id, album_title)
        if rel and rel.rel_fk_writers:
            writers = _split_names(rel.rel_fk_writers)
            if writers:
                source = "release"

    return {
        "title": title,
        "writers": writers,
        "composers": composers,
        "lyricists": lyricists,
        "source": source,
    }
