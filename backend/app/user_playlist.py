"""Add tracks to legacy user playlists (playlistdata table)."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Playlist, PlaylistData


def add_track_to_playlist(
    db: Session,
    playlist_id: int,
    *,
    title: str,
    artist: str,
    release: str,
    path: str,
) -> dict:
    playlist = db.get(Playlist, playlist_id)
    if not playlist:
        return {"ok": False, "error": "Playlist not found"}

    clean_path = path.strip()
    if not clean_path:
        return {"ok": False, "error": "Missing track path"}

    existing = db.scalars(
        select(PlaylistData).where(
            PlaylistData.pld_playlist == playlist_id,
            PlaylistData.pld_path == clean_path,
        )
    ).first()
    if existing:
        return {"ok": True, "duplicate": True, "id": existing.pld_id}

    next_id = db.scalar(select(func.max(PlaylistData.pld_id))) or 0
    row = PlaylistData(
        pld_id=int(next_id) + 1,
        pld_title=title.strip() or "Unknown",
        pld_artist=artist.strip() or "Unknown",
        pld_release=release.strip() or "",
        pld_path=clean_path,
        pld_playlist=playlist_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.pld_id, "duplicate": False}


def create_user_playlist(db: Session, *, name: str) -> dict:
    clean = name.strip()
    if not clean:
        return {"ok": False, "error": "Playlist name is required"}
    existing = db.scalars(
        select(Playlist).where(
            Playlist.pla_type == 200,
            Playlist.pla_name == clean,
        )
    ).first()
    if existing:
        return {
            "ok": True,
            "id": existing.pla_id,
            "name": existing.pla_name,
            "duplicate": True,
        }
    next_id = int(db.scalar(select(func.max(Playlist.pla_id))) or 0) + 1
    row = Playlist(
        pla_id=next_id,
        pla_name=clean,
        pla_type=200,
        pla_description=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "ok": True,
        "id": row.pla_id,
        "name": row.pla_name,
        "duplicate": False,
    }
