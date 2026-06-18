"""Per-track lyrics and YouTube overrides keyed by play_path (SQLite)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import TrackOverride
from app.release_track_extras import _normalize_youtube


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def get_override(db: Session, play_path: str) -> TrackOverride | None:
    path = play_path.strip()
    if not path:
        return None
    return db.get(TrackOverride, path)


def youtube_overrides_map(db: Session) -> dict[str, str]:
    out: dict[str, str] = {}
    for row in db.scalars(select(TrackOverride)).all():
        path = (row.tro_play_path or "").strip()
        url = _normalize_youtube(row.tro_youtube_url or "")
        if path and url:
            out[path] = url
    return out


def read_youtube_url(db: Session, play_path: str | None) -> str | None:
    if not play_path:
        return None
    row = get_override(db, play_path)
    if not row:
        return None
    return _normalize_youtube(row.tro_youtube_url or "")


def save_youtube_url(
    db: Session,
    *,
    play_path: str,
    band_id: int | None = None,
    title: str | None = None,
    youtube_url: str | None,
) -> str | None:
    path = play_path.strip()
    if not path:
        raise ValueError("play_path is required")
    normalized = _normalize_youtube(youtube_url or "") if youtube_url else None
    row = get_override(db, path)
    if not row:
        row = TrackOverride(tro_play_path=path)
        db.add(row)
    row.tro_band_id = band_id
    if title:
        row.tro_title = title.strip()
    row.tro_youtube_url = normalized
    row.tro_updated_at = _now_iso()
    db.commit()
    return normalized


def read_lyrics_lrc(db: Session, play_path: str | None) -> str | None:
    if not play_path:
        return None
    row = get_override(db, play_path)
    if not row:
        return None
    text = (row.tro_lyrics_lrc or "").strip()
    return text or None


def read_lyrics_plain(db: Session, play_path: str | None) -> str | None:
    if not play_path:
        return None
    row = get_override(db, play_path)
    if not row:
        return None
    text = (row.tro_lyrics_plain or "").strip()
    return text or None


def save_lyrics(
    db: Session,
    *,
    play_path: str,
    band_id: int | None = None,
    title: str | None = None,
    lyrics_plain: str | None = None,
    lyrics_lrc: str | None = None,
) -> None:
    path = play_path.strip()
    if not path:
        raise ValueError("play_path is required")
    row = get_override(db, path)
    if not row:
        row = TrackOverride(tro_play_path=path)
        db.add(row)
    row.tro_band_id = band_id
    if title:
        row.tro_title = title.strip()
    plain = (lyrics_plain or "").strip() or None
    lrc = (lyrics_lrc or "").strip() or None
    row.tro_lyrics_plain = plain
    row.tro_lyrics_lrc = lrc
    row.tro_updated_at = _now_iso()
    db.commit()
