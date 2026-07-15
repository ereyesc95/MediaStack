"""Snapshot playlist import (Exportify CSV + Spotify metadata)."""
from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.library_track_match import LibraryTrackIndex, MatchedTrack
from app.models import Playlist, PlaylistData, PlaylistTrackSnapshot, Subgenre
from app.user_playlist import (
    PLA_KIND_SNAPSHOT,
    _entry_from_match,
    add_track_to_playlist,
)

EXPORTIFY_HEADERS = {
    "track uri": "spotify_uri",
    "track name": "title",
    "album name": "album",
    "artist name(s)": "artist",
    "release date": "release_date",
    "duration (ms)": "duration_ms",
    "popularity": "popularity",
    "explicit": "explicit",
    "genres": "genres",
    "record label": "record_label",
    "danceability": "danceability",
    "energy": "energy",
    "key": "key",
    "loudness": "loudness",
    "mode": "mode",
    "speechiness": "speechiness",
    "acousticness": "acousticness",
    "instrumentalness": "instrumentalness",
    "liveness": "liveness",
    "valence": "valence",
    "tempo": "tempo",
    "time signature": "time_signature",
}


@dataclass
class SnapshotTrack:
    spotify_uri: str | None
    title: str
    artist: str
    album: str
    release_date: str | None = None
    duration_ms: int | None = None
    popularity: int | None = None
    explicit: bool | None = None
    genres: str | None = None
    record_label: str | None = None
    danceability: float | None = None
    energy: float | None = None
    tempo: float | None = None
    valence: float | None = None
    acousticness: float | None = None
    instrumentalness: float | None = None
    key: int | None = None
    mode: int | None = None
    loudness: float | None = None
    speechiness: float | None = None
    liveness: float | None = None
    time_signature: int | None = None


def _parse_bool(value: Any) -> bool | None:
    if value is None:
        return None
    text = str(value).strip().casefold()
    if not text:
        return None
    if text in ("true", "1", "yes"):
        return True
    if text in ("false", "0", "no"):
        return False
    return None


def _parse_int(value: Any) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def _parse_float(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _year_from_release_date(release_date: str | None) -> str | None:
    if not release_date:
        return None
    year = release_date.strip()[:4]
    return year if year.isdigit() else None


def snapshot_from_dict(data: dict) -> SnapshotTrack:
    return SnapshotTrack(
        spotify_uri=(data.get("spotify_uri") or data.get("uri") or "").strip() or None,
        title=(data.get("title") or "Unknown").strip() or "Unknown",
        artist=(data.get("artist") or data.get("artist_name") or "Unknown").strip() or "Unknown",
        album=(data.get("album") or data.get("album_title") or "").strip(),
        release_date=(data.get("release_date") or "").strip() or None,
        duration_ms=_parse_int(data.get("duration_ms")),
        popularity=_parse_int(data.get("popularity")),
        explicit=_parse_bool(data.get("explicit")),
        genres=(data.get("genres") or "").strip() or None,
        record_label=(data.get("record_label") or "").strip() or None,
        danceability=_parse_float(data.get("danceability")),
        energy=_parse_float(data.get("energy")),
        tempo=_parse_float(data.get("tempo")),
        valence=_parse_float(data.get("valence")),
        acousticness=_parse_float(data.get("acousticness")),
        instrumentalness=_parse_float(data.get("instrumentalness")),
        key=_parse_int(data.get("key")),
        mode=_parse_int(data.get("mode")),
        loudness=_parse_float(data.get("loudness")),
        speechiness=_parse_float(data.get("speechiness")),
        liveness=_parse_float(data.get("liveness")),
        time_signature=_parse_int(data.get("time_signature")),
    )


def snapshot_to_api(row: PlaylistTrackSnapshot) -> dict:
    explicit = None
    if row.pts_explicit is not None:
        explicit = bool(row.pts_explicit)
    return {
        "spotify_uri": row.pts_spotify_uri,
        "title": row.pts_snapshot_title,
        "artist": row.pts_snapshot_artist,
        "album": row.pts_snapshot_album,
        "release_date": row.pts_release_date,
        "duration_ms": row.pts_duration_ms,
        "popularity": row.pts_popularity,
        "explicit": explicit,
        "genres": row.pts_genres,
        "record_label": row.pts_record_label,
        "danceability": _parse_float(row.pts_danceability),
        "energy": _parse_float(row.pts_energy),
        "tempo": _parse_float(row.pts_tempo),
        "valence": _parse_float(row.pts_valence),
        "acousticness": _parse_float(row.pts_acousticness),
        "instrumentalness": _parse_float(row.pts_instrumentalness),
        "key": row.pts_key,
        "mode": row.pts_mode,
        "loudness": _parse_float(row.pts_loudness),
        "speechiness": _parse_float(row.pts_speechiness),
        "liveness": _parse_float(row.pts_liveness),
        "time_signature": row.pts_time_signature,
    }


def _store_float(value: float | None) -> str | None:
    if value is None:
        return None
    return str(value)


def save_snapshot_row(db: Session, entry_id: int, track: SnapshotTrack) -> None:
    explicit_val = None
    if track.explicit is not None:
        explicit_val = 1 if track.explicit else 0
    row = PlaylistTrackSnapshot(
        pts_entry_id=entry_id,
        pts_spotify_uri=track.spotify_uri,
        pts_snapshot_title=track.title,
        pts_snapshot_artist=track.artist,
        pts_snapshot_album=track.album or None,
        pts_release_date=track.release_date,
        pts_duration_ms=track.duration_ms,
        pts_popularity=track.popularity,
        pts_explicit=explicit_val,
        pts_genres=track.genres,
        pts_record_label=track.record_label,
        pts_danceability=_store_float(track.danceability),
        pts_energy=_store_float(track.energy),
        pts_tempo=_store_float(track.tempo),
        pts_valence=_store_float(track.valence),
        pts_acousticness=_store_float(track.acousticness),
        pts_instrumentalness=_store_float(track.instrumentalness),
        pts_key=track.key,
        pts_mode=track.mode,
        pts_loudness=_store_float(track.loudness),
        pts_speechiness=_store_float(track.speechiness),
        pts_liveness=_store_float(track.liveness),
        pts_time_signature=track.time_signature,
    )
    db.merge(row)


def get_snapshot_row(db: Session, entry_id: int) -> PlaylistTrackSnapshot | None:
    return db.get(PlaylistTrackSnapshot, entry_id)


def load_snapshots_for_entries(
    db: Session, entry_ids: list[int]
) -> dict[int, PlaylistTrackSnapshot]:
    if not entry_ids:
        return {}
    rows = db.scalars(
        select(PlaylistTrackSnapshot).where(
            PlaylistTrackSnapshot.pts_entry_id.in_(entry_ids)
        )
    ).all()
    return {row.pts_entry_id: row for row in rows}


def delete_snapshots_for_playlist(db: Session, playlist_id: int) -> None:
    entry_ids = db.scalars(
        select(PlaylistData.pld_id).where(PlaylistData.pld_playlist == playlist_id)
    ).all()
    if not entry_ids:
        return
    for entry_id in entry_ids:
        row = db.get(PlaylistTrackSnapshot, entry_id)
        if row:
            db.delete(row)


def _normalize_csv_row(raw: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in raw.items():
        if key is None:
            continue
        mapped = EXPORTIFY_HEADERS.get(key.strip().casefold())
        if mapped:
            out[mapped] = value
    return out


def parse_exportify_csv(content: bytes | str) -> list[SnapshotTrack]:
    text = content.decode("utf-8-sig") if isinstance(content, bytes) else content
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return []

    tracks: list[SnapshotTrack] = []
    seen_uris: set[str] = set()
    for raw in reader:
        normalized = _normalize_csv_row(raw)
        if not normalized.get("title"):
            continue
        uri = (normalized.get("spotify_uri") or "").strip()
        if uri:
            if uri in seen_uris:
                continue
            seen_uris.add(uri)
        tracks.append(snapshot_from_dict(normalized))
    return tracks


def playlist_name_from_filename(filename: str) -> str:
    stem = Path(filename).stem.strip()
    return stem or "Imported playlist"


def is_snapshot_playlist(playlist: Playlist | None) -> bool:
    if not playlist:
        return False
    return (playlist.pla_kind or "local").casefold() == PLA_KIND_SNAPSHOT


def list_subgenre_names(db: Session) -> list[str]:
    rows = db.scalars(
        select(Subgenre.sgn_name)
        .where(Subgenre.sgn_name.isnot(None))
        .order_by(Subgenre.sgn_name)
    ).all()
    names: list[str] = []
    seen: set[str] = set()
    for name in rows:
        clean = (name or "").strip()
        if not clean:
            continue
        key = clean.casefold()
        if key in seen:
            continue
        seen.add(key)
        names.append(clean)
    return names


def normalize_genres_to_db(db: Session, raw: str | None) -> str | None:
    if not raw or not raw.strip():
        return None
    known = {n.casefold(): n for n in list_subgenre_names(db)}
    tokens = [t.strip() for t in raw.split(",") if t.strip()]
    resolved: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        match = known.get(token.casefold())
        if match:
            key = match.casefold()
            if key not in seen:
                seen.add(key)
                resolved.append(match)
    return ", ".join(resolved) if resolved else None


def update_snapshot_metadata(
    db: Session,
    *,
    playlist_id: int,
    entry_id: int,
    genres: str | None = None,
    record_label: str | None = None,
) -> dict:
    playlist = db.get(Playlist, playlist_id)
    if not playlist or not is_snapshot_playlist(playlist):
        return {"ok": False, "error": "Not a snapshot playlist"}
    entry = db.get(PlaylistData, entry_id)
    if not entry or entry.pld_playlist != playlist_id:
        return {"ok": False, "error": "Track not found"}
    snap = db.get(PlaylistTrackSnapshot, entry_id)
    if not snap:
        return {"ok": False, "error": "Snapshot metadata not found"}
    if genres is not None:
        clean = genres.strip()
        if clean:
            normalized = normalize_genres_to_db(db, clean)
            if not normalized:
                return {"ok": False, "error": "No matching subgenres in library"}
            snap.pts_genres = normalized
        else:
            snap.pts_genres = None
    if record_label is not None:
        snap.pts_record_label = record_label.strip() or None
    db.commit()
    db.refresh(snap)
    return {"ok": True, "snapshot": snapshot_to_api(snap)}


def import_snapshot_tracks(
    db: Session,
    media_root: Path,
    *,
    playlist_id: int,
    tracks: list[SnapshotTrack | dict],
) -> dict:
    playlist = db.get(Playlist, playlist_id)
    if not playlist:
        return {"ok": False, "error": "Playlist not found"}

    playlist.pla_kind = PLA_KIND_SNAPSHOT
    db.commit()

    index = LibraryTrackIndex(media_root, db=db)
    matched_count = 0
    unavailable_count = 0
    used_paths: set[str] = set()

    for i, raw in enumerate(tracks):
        track = raw if isinstance(raw, SnapshotTrack) else snapshot_from_dict(raw)
        match_input = {
            "title": track.title,
            "artist_name": track.artist,
            "album_title": track.album,
            "year": _year_from_release_date(track.release_date),
        }
        matched = index.match(
            title=track.title,
            artist=track.artist,
            album=track.album,
            year=_year_from_release_date(track.release_date),
            exclude_paths=used_paths,
        )
        if matched:
            used_paths.add(matched.path)
        entry = _entry_from_match(match_input, matched, sort_order=i)
        if entry["unavailable"]:
            unavailable_count += 1
        else:
            matched_count += 1
        added = add_track_to_playlist(
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
        entry_id = added.get("id")
        if entry_id:
            save_snapshot_row(db, int(entry_id), track)
    db.commit()
    return {
        "ok": True,
        "matched": matched_count,
        "unavailable": unavailable_count,
        "total": len(tracks),
    }


def snapshot_match_fields(db: Session, entry_id: int, row: PlaylistData) -> tuple[str, str, str | None]:
    snap = get_snapshot_row(db, entry_id)
    if snap:
        return (
            snap.pts_snapshot_title or row.pld_title,
            snap.pts_snapshot_artist or row.pld_artist,
            snap.pts_snapshot_album or row.pld_album or row.pld_release,
        )
    return row.pld_title, row.pld_artist, row.pld_album or row.pld_release
