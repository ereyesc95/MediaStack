"""Per-track lyrics and YouTube overrides keyed by play_path (SQLite)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

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
        primary = _primary_youtube_from_row(row)
        if path and primary:
            out[path] = primary
    return out


def _normalize_video_entry(entry: dict[str, Any]) -> dict[str, str | bool] | None:
    url = _normalize_youtube(str(entry.get("url") or ""))
    if not url:
        return None
    label = str(entry.get("label") or "Video").strip() or "Video"
    primary = bool(entry.get("primary"))
    return {"url": url, "label": label, "primary": primary}


def _normalize_video_list(videos: list[dict[str, Any]] | None) -> list[dict[str, str | bool]]:
    out: list[dict[str, str | bool]] = []
    seen: set[str] = set()
    for raw in videos or []:
        if not isinstance(raw, dict):
            continue
        item = _normalize_video_entry(raw)
        if not item or item["url"] in seen:
            continue
        seen.add(item["url"])
        out.append(item)
    if out and not any(bool(v.get("primary")) for v in out):
        first = dict(out[0])
        first["primary"] = True
        out[0] = first
    return out


def _primary_youtube_from_row(row: TrackOverride | None) -> str | None:
    if not row:
        return None
    for item in read_track_videos_from_row(row):
        if item.get("primary"):
            return str(item["url"])
    url = _normalize_youtube(row.tro_youtube_url or "")
    return url or None


def read_track_videos_from_row(row: TrackOverride) -> list[dict[str, str | bool]]:
    raw = (row.tro_youtube_videos or "").strip()
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                normalized = _normalize_video_list(data)
                if normalized:
                    return normalized
        except (json.JSONDecodeError, TypeError):
            pass
    url = _normalize_youtube(row.tro_youtube_url or "")
    if url:
        return [{"url": url, "label": "Official video", "primary": True}]
    return []


def read_track_videos(db: Session, play_path: str | None) -> list[dict[str, str | bool]]:
    if not play_path:
        return []
    row = get_override(db, play_path)
    if not row:
        return []
    return read_track_videos_from_row(row)


def read_youtube_url(db: Session, play_path: str | None) -> str | None:
    if not play_path:
        return None
    row = get_override(db, play_path)
    return _primary_youtube_from_row(row)


def save_youtube_url(
    db: Session,
    *,
    play_path: str,
    band_id: int | None = None,
    title: str | None = None,
    youtube_url: str | None,
    youtube_videos: list[dict[str, Any]] | None = None,
) -> str | None:
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

    if youtube_videos is not None:
        normalized = _normalize_video_list(youtube_videos)
        row.tro_youtube_videos = (
            json.dumps(normalized, ensure_ascii=False) if normalized else None
        )
        row.tro_youtube_url = _primary_youtube_from_row(row)
    else:
        normalized = _normalize_youtube(youtube_url or "") if youtube_url else None
        row.tro_youtube_url = normalized
        if normalized:
            row.tro_youtube_videos = json.dumps(
                [{"url": normalized, "label": "Official video", "primary": True}],
                ensure_ascii=False,
            )
        else:
            row.tro_youtube_videos = None

    row.tro_updated_at = _now_iso()
    db.commit()
    return _primary_youtube_from_row(row)


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
