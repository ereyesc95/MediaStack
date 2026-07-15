"""Shared helpers for system playlist track payloads."""
from __future__ import annotations

from pathlib import Path

from app.media_index import release_id_from_path

_EDITION_DIR_NAMES = frozenset(
    {
        "standard edition",
        "deluxe edition",
        "bonus",
        "disc 1",
        "disc 2",
        "disc 3",
        "disc 4",
        "side a",
        "side b",
    }
)

PLAYLIST_DESCRIPTIONS: dict[str, str] = {
    "top-tracks": "Most popular tracks across the artist library.",
    "setlists": "Live setlists matched from setlist.fm.",
    "originals": "Studio originals without remix, live, acoustic, or demo tags.",
    "remixes": "Remix and mix versions from albums and singles.",
    "acoustic": "Acoustic recordings and performances.",
    "demos": "Demo and work-in-progress recordings.",
    "instrumentals": "Instrumental mixes and backing tracks.",
    "covers": "Cover versions of songs by other artists.",
    "a-cappella": "A cappella vocal versions.",
    "b-sides": "B-side and non-album single tracks.",
    "bonus-tracks": "Bonus and deluxe-edition exclusives.",
    "tributes": "Covers and tribute performances of this artist's songs by other artists.",
    "features": "Guest and featuring appearances on own releases.",
    "appearances": "This artist performing on other artists' releases.",
    "writing-credits": "Tracks written for other artists and projects.",
    "collaborations": "Collaborations and split credits across the library.",
    "standalones": "Standalone singles and one-off releases.",
    "most-played": "Tracks ranked by your play history.",
}


def _album_rel_path(play_path: str) -> str:
    parts = Path(play_path.replace("\\", "/")).parts
    if len(parts) < 2:
        return play_path.replace("\\", "/")
    album_dir = Path(*parts[:-1])
    while album_dir.name.casefold() in _EDITION_DIR_NAMES and len(album_dir.parts) > 1:
        album_dir = album_dir.parent
    return str(album_dir).replace("\\", "/")


def _audio_file_for_play_path(play_path: str, media_root: Path) -> Path | None:
    audio_file = media_root / Path(play_path.replace("/", "\\"))
    if audio_file.is_file():
        return audio_file
    audio_file = media_root / Path(play_path)
    return audio_file if audio_file.is_file() else None


def _resolve_track_source_labels(
    play_path: str, media_root: Path
) -> tuple[str | None, str | None]:
    """Return display album title and release folder rel path for playlist tracks."""
    from app.media_paths_util import safe_relative
    from app.release_tracklist import (
        _source_album_display,
        _source_edition_dir_for_audio,
    )
    from app.media_index import _release_dir_from_content_folder

    audio_file = _audio_file_for_play_path(play_path, media_root)
    if not audio_file:
        return None, None

    release_dir = _release_dir_from_content_folder(audio_file.parent)
    edition_dir = _source_edition_dir_for_audio(release_dir, audio_file)
    album_display, _, _ = _source_album_display(release_dir, edition_dir)
    release_rel = safe_relative(release_dir, media_root)
    return album_display, release_rel.replace("\\", "/") if release_rel else None


def _resolve_track_release_date(play_path: str, media_root: Path) -> str | None:
    from app.band_library import _parse_folder_date, _release_date_for_track
    from app.media_index import _release_dir_from_content_folder, entry_display_name

    audio_file = _audio_file_for_play_path(play_path, media_root)
    if not audio_file:
        return None
    date = _release_date_for_track(audio_file)
    if date:
        return date
    release_dir = _release_dir_from_content_folder(audio_file.parent)
    return _parse_folder_date(entry_display_name(release_dir))


def _duration_fields_from_ms(duration_ms: int | float | None) -> tuple[float | None, str | None]:
    from app.release_tracklist import _format_duration

    if duration_ms is None:
        return None, None
    try:
        ms = float(duration_ms)
    except (TypeError, ValueError):
        return None, None
    if ms <= 0:
        return None, None
    duration_sec = ms / 1000.0
    return duration_sec, _format_duration(duration_sec)


def apply_snapshot_duration(track: dict) -> dict:
    """Fill duration / duration_sec from snapshot ms when missing."""
    if track.get("duration") and track.get("duration_sec") is not None:
        return track
    snap = track.get("snapshot") or {}
    duration_ms = track.get("duration_ms")
    if duration_ms is None:
        duration_ms = snap.get("duration_ms") if isinstance(snap, dict) else None
    duration_sec, duration = _duration_fields_from_ms(duration_ms)
    if duration_sec is None:
        return track
    out = dict(track)
    if out.get("duration_sec") is None:
        out["duration_sec"] = duration_sec
    if not out.get("duration"):
        out["duration"] = duration
    return out


def enrich_playlist_track(track: dict, media_root: Path, db=None) -> dict:
    """Add release navigation and duration fields used by the release-style UI."""
    play_path = track.get("play_path")
    if not play_path:
        return apply_snapshot_duration(track)
    out = apply_snapshot_duration(dict(track))
    album_title, release_rel = _resolve_track_source_labels(play_path, media_root)
    if album_title:
        out["album_title"] = album_title
    if release_rel:
        out["album_folder"] = release_rel
        out["navigate_release_id"] = release_id_from_path(release_rel)
    else:
        album_rel = _album_rel_path(play_path)
        out["album_folder"] = album_rel
        out["navigate_release_id"] = release_id_from_path(album_rel)
    if db is not None:
        audio_file = _audio_file_for_play_path(play_path, media_root)
        if audio_file:
            from app.media_index import _band_id_from_content_path

            nav_band_id = _band_id_from_content_path(db, media_root, audio_file.parent)
            if nav_band_id:
                out["navigate_band_id"] = nav_band_id
    disk_date = _resolve_track_release_date(play_path, media_root)
    if disk_date:
        out["release_date"] = disk_date
        year = disk_date[:4]
        if year.isdigit():
            out["year"] = year
    elif not out.get("release_date"):
        out["release_date"] = None
    audio_file = _audio_file_for_play_path(play_path, media_root)
    if audio_file:
        from app.band_library import display_track_title_from_path
        from app.release_playback_art import playback_art_for_play_path
        from app.release_tracklist import _duration_from_file, _format_duration

        out["title"] = display_track_title_from_path(audio_file)
        # Prefer snapshot/API duration for large playlists; fall back to file tags.
        if not out.get("duration") and out.get("duration_sec") is None:
            duration_sec = _duration_from_file(audio_file)
            if duration_sec is not None:
                out["duration_sec"] = duration_sec
                out["duration"] = _format_duration(duration_sec)
        playback = playback_art_for_play_path(media_root, play_path)
        if playback:
            if playback.get("disc_url"):
                out["disc_url"] = playback["disc_url"]
            if not out.get("cover_url") and playback.get("cover_url"):
                out["cover_url"] = playback["cover_url"]
    return out


def enrich_playlist_tracks(tracks: list[dict], media_root: Path, db=None) -> list[dict]:
    return [enrich_playlist_track(t, media_root, db=db) for t in tracks]
