"""User playlist CRUD, Spotify import, and track matching."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.library_track_match import LibraryTrackIndex, MatchedTrack
from app.models import Playlist, PlaylistData
from app.paths import DATA_DIR

USER_PLAYLIST_TYPE = 200
PLAYLIST_COVERS_DIR = DATA_DIR / "playlist_covers"


def _youtube_query(title: str, artist: str | None, album: str | None) -> str:
    parts = [title.strip()]
    if artist and artist.strip():
        parts.append(artist.strip())
    if album and album.strip():
        parts.append(album.strip())
    return " ".join(parts)


def playlist_cover_url(playlist_id: int) -> str:
    return f"/api/music/playlists/{playlist_id}/cover"


def save_playlist_cover_file(playlist_id: int, raw: bytes, ext: str) -> str:
    PLAYLIST_COVERS_DIR.mkdir(parents=True, exist_ok=True)
    clean_ext = ext if ext.startswith(".") else f".{ext}"
    for old in PLAYLIST_COVERS_DIR.glob(f"{playlist_id}.*"):
        old.unlink(missing_ok=True)
    path = PLAYLIST_COVERS_DIR / f"{playlist_id}{clean_ext}"
    path.write_bytes(raw)
    return playlist_cover_url(playlist_id)


def resolve_playlist_cover_url(playlist: Playlist) -> str | None:
    if not playlist.pla_cover_path:
        return None
    if playlist.pla_cover_path.startswith("/"):
        return playlist.pla_cover_path
    return playlist_cover_url(playlist.pla_id)


def cover_file_for_playlist(playlist_id: int) -> Path | None:
    if not PLAYLIST_COVERS_DIR.is_dir():
        return None
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        path = PLAYLIST_COVERS_DIR / f"{playlist_id}{ext}"
        if path.is_file():
            return path
    return None


def _next_playlist_id(db: Session) -> int:
    return int(db.scalar(select(func.max(Playlist.pla_id))) or 0) + 1


def _next_entry_id(db: Session) -> int:
    return int(db.scalar(select(func.max(PlaylistData.pld_id))) or 0) + 1


def _next_sort_order(db: Session, playlist_id: int) -> int:
    current = db.scalar(
        select(func.max(PlaylistData.pld_sort_order)).where(
            PlaylistData.pld_playlist == playlist_id
        )
    )
    if current is None:
        count = db.scalar(
            select(func.count())
            .select_from(PlaylistData)
            .where(PlaylistData.pld_playlist == playlist_id)
        )
        return int(count or 0)
    return int(current) + 1


def create_user_playlist(
    db: Session,
    *,
    name: str,
    description: str | None = None,
    cover_path: str | None = None,
    source: str | None = None,
    spotify_id: str | None = None,
) -> dict:
    clean = name.strip()
    if not clean:
        return {"ok": False, "error": "Playlist name is required"}
    next_id = _next_playlist_id(db)
    row = Playlist(
        pla_id=next_id,
        pla_name=clean,
        pla_type=USER_PLAYLIST_TYPE,
        pla_description=(description or "").strip() or None,
        pla_cover_path=cover_path,
        pla_source=source,
        pla_spotify_id=spotify_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "ok": True,
        "id": row.pla_id,
        "name": row.pla_name,
        "description": row.pla_description,
        "cover_url": resolve_playlist_cover_url(row),
        "duplicate": False,
    }


def add_track_to_playlist(
    db: Session,
    playlist_id: int,
    *,
    title: str,
    artist: str,
    release: str,
    path: str,
    album: str | None = None,
    year: str | None = None,
    unavailable: bool = False,
    allow_duplicate: bool = False,
    sort_order: int | None = None,
) -> dict:
    playlist = db.get(Playlist, playlist_id)
    if not playlist:
        return {"ok": False, "error": "Playlist not found"}

    clean_path = path.strip()
    if not unavailable and not clean_path:
        return {"ok": False, "error": "Missing track path"}

    if clean_path:
        existing = db.scalars(
            select(PlaylistData).where(
                PlaylistData.pld_playlist == playlist_id,
                PlaylistData.pld_path == clean_path,
            )
        ).first()
        if existing and not allow_duplicate:
            return {"ok": True, "duplicate": True, "id": existing.pld_id}

    if not allow_duplicate and not clean_path:
        existing = db.scalars(
            select(PlaylistData).where(
                PlaylistData.pld_playlist == playlist_id,
                PlaylistData.pld_title == title.strip(),
                PlaylistData.pld_artist == artist.strip(),
                PlaylistData.pld_unavailable == (1 if unavailable else 0),
            )
        ).first()
        if existing:
            return {"ok": True, "duplicate": True, "id": existing.pld_id}

    order = sort_order if sort_order is not None else _next_sort_order(db, playlist_id)
    row = PlaylistData(
        pld_id=_next_entry_id(db),
        pld_title=title.strip() or "Unknown",
        pld_artist=artist.strip() or "Unknown",
        pld_release=release.strip() or "",
        pld_path=clean_path if not unavailable else "",
        pld_playlist=playlist_id,
        pld_album=(album or "").strip() or None,
        pld_year=(year or "").strip() or None,
        pld_sort_order=order,
        pld_unavailable=1 if unavailable else 0,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.pld_id, "duplicate": False}


def _entry_from_match(
    track: dict,
    matched: MatchedTrack | None,
    *,
    sort_order: int,
) -> dict:
    if matched:
        return {
            "title": matched.title,
            "artist": matched.artist_name,
            "release": matched.album_title or "",
            "path": matched.path,
            "album": matched.album_title,
            "year": matched.year,
            "unavailable": False,
            "sort_order": sort_order,
        }
    title = track.get("title") or "Unknown"
    artist = track.get("artist_name") or "Unknown"
    album = track.get("album_title") or ""
    year = track.get("year")
    return {
        "title": title,
        "artist": artist,
        "release": album,
        "path": "",
        "album": album or None,
        "year": year,
        "unavailable": True,
        "sort_order": sort_order,
    }


def import_spotify_snapshot(
    db: Session,
    media_root: Path,
    *,
    playlist_id: int,
    tracks: list[dict],
) -> dict:
    playlist = db.get(Playlist, playlist_id)
    if not playlist:
        return {"ok": False, "error": "Playlist not found"}

    index = LibraryTrackIndex(media_root, db=db)
    matched_count = 0
    unavailable_count = 0
    for i, track in enumerate(tracks):
        matched = index.match(
            title=track.get("title") or "",
            artist=track.get("artist_name"),
            album=track.get("album_title"),
        )
        entry = _entry_from_match(track, matched, sort_order=i)
        if entry["unavailable"]:
            unavailable_count += 1
        else:
            matched_count += 1
        add_track_to_playlist(
            db,
            playlist_id,
            title=entry["title"],
            artist=entry["artist"],
            release=entry["release"],
            path=entry["path"],
            album=entry["album"],
            year=entry["year"],
            unavailable=entry["unavailable"],
            allow_duplicate=True,
            sort_order=entry["sort_order"],
        )
    return {
        "ok": True,
        "matched": matched_count,
        "unavailable": unavailable_count,
        "total": len(tracks),
    }


def find_track_in_disk(
    db: Session,
    media_root: Path,
    *,
    playlist_id: int,
    entry_id: int,
) -> dict:
    row = db.get(PlaylistData, entry_id)
    if not row or row.pld_playlist != playlist_id:
        return {"ok": False, "error": "Entry not found"}
    if not row.pld_unavailable:
        return {"ok": False, "error": "Track is already available locally"}

    index = LibraryTrackIndex(media_root, db=db)
    matched = index.match(
        title=row.pld_title,
        artist=row.pld_artist,
        album=row.pld_album or row.pld_release,
    )
    if not matched:
        candidates = index.find_candidates(
            title=row.pld_title,
            artist=row.pld_artist,
            album=row.pld_album or row.pld_release,
        )
        return {
            "ok": True,
            "found": False,
            "candidates": [
                {
                    "path": c.path,
                    "title": c.title,
                    "artist_name": c.artist_name,
                    "album_title": c.album_title,
                    "year": c.year,
                    "cover_url": c.cover_url,
                }
                for c in candidates
            ],
        }

    row.pld_path = matched.path
    row.pld_title = matched.title
    row.pld_artist = matched.artist_name
    row.pld_release = matched.album_title or row.pld_release
    row.pld_album = matched.album_title
    row.pld_year = matched.year or row.pld_year
    row.pld_unavailable = 0
    db.commit()
    return {
        "ok": True,
        "found": True,
        "path": matched.path,
        "title": matched.title,
        "artist_name": matched.artist_name,
        "album_title": matched.album_title,
        "year": matched.year,
        "cover_url": matched.cover_url,
    }


def link_entry_to_path(
    db: Session,
    *,
    playlist_id: int,
    entry_id: int,
    path: str,
    media_root: Path,
) -> dict:
    row = db.get(PlaylistData, entry_id)
    if not row or row.pld_playlist != playlist_id:
        return {"ok": False, "error": "Entry not found"}
    clean = path.strip()
    if not clean:
        return {"ok": False, "error": "Missing path"}

    index = LibraryTrackIndex(media_root, db=db)
    matched = index.match(title=row.pld_title, artist=row.pld_artist, album=row.pld_album)
    if matched and matched.path != clean:
        for c in index.find_candidates(title=row.pld_title, artist=row.pld_artist):
            if c.path == clean:
                matched = c
                break

    target = Path(media_root) / clean.replace("/", "\\")
    if target.is_file():
        from app.band_library import display_track_title_from_path

        row.pld_path = clean.replace("\\", "/")
        row.pld_title = display_track_title_from_path(target)
        row.pld_unavailable = 0
        if matched and matched.path == clean:
            row.pld_artist = matched.artist_name
            row.pld_release = matched.album_title or row.pld_release
            row.pld_album = matched.album_title
            row.pld_year = matched.year or row.pld_year
        db.commit()
        return {"ok": True, "linked": True}

    return {"ok": False, "error": "File not found on disk"}
