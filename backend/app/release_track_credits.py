"""Track writing credits from legacy DB."""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Artist, Release, Track
from app.music_filters import _parse_ids
from app.release_overview import _match_db_release, resolve_release_content
from app.release_tracklist import _normalize_title

TRACK_WRITERS_RE = re.compile(r"~([^~]+)~\[\{([^}]*)\}\]")


def _artist_names(db: Session, ids: list[int]) -> list[str]:
    names: list[str] = []
    for aid in ids:
        row = db.get(Artist, aid)
        if row and row.art_name:
            n = row.art_name.strip()
            if n and n not in names:
                names.append(n)
    return names


def _parse_writer_refs(db: Session, refs: str) -> list[str]:
    names: list[str] = []
    for part in refs.split(";"):
        token = part.strip().strip("{}")
        if not token:
            continue
        if token.endswith("_not_found"):
            name = token[: -len("_not_found")].strip()
            if name and name not in names:
                names.append(name)
            continue
        if token.isdigit():
            for artist_name in _artist_names(db, [int(token)]):
                if artist_name not in names:
                    names.append(artist_name)
            continue
        if token not in names:
            names.append(token)
    return names


def _writers_from_release_field(db: Session, raw: str, title: str) -> list[str]:
    want = _normalize_title(title)
    for match in TRACK_WRITERS_RE.finditer(raw):
        track_part = match.group(1).strip()
        if _normalize_title(track_part) != want:
            continue
        return _parse_writer_refs(db, match.group(2))
    return []


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

    _, card, _, _ = resolved
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
            writers = _writers_from_release_field(db, rel.rel_fk_writers, title)
            if writers:
                source = "release"

    return {
        "title": title,
        "writers": writers,
        "composers": composers,
        "lyricists": lyricists,
        "source": source,
    }
