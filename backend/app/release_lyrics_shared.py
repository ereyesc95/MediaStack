"""Synced lyrics shared across editions of the same song on one release."""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.lyrics_storage import find_lrc_path
from app.media_paths import path_to_local_file
from app.release_tracklist import build_release_tracklist
from app.track_overrides import read_lyrics_lrc, save_lyrics


def release_track_main_key(title: str) -> str:
    """Match frontend trackMainTitle grouping for a release tracklist."""
    t = title.strip()
    t = re.sub(r"\s*\[.*\]\s*$", "", t)
    return t.casefold()


def iter_release_tracks(payload: dict):
    for edition in payload.get("editions") or []:
        for group in edition.get("groups") or []:
            for track in group.get("tracks") or []:
                yield track


def release_paths_by_main_key(payload: dict) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for track in iter_release_tracks(payload):
        title = (track.get("title") or "").strip()
        path = (track.get("play_path") or "").strip()
        if not title or not path:
            continue
        key = release_track_main_key(title)
        bucket = out.setdefault(key, [])
        if path not in bucket:
            bucket.append(path)
    return out


def synced_lrc_for_path(db: Session, play_path: str) -> str | None:
    path = play_path.strip()
    if not path:
        return None
    synced = read_lyrics_lrc(db, path)
    if synced and "[" in synced:
        return synced
    local = path_to_local_file(path)
    if not local:
        return None
    lrc_path = find_lrc_path(local)
    if not lrc_path or not lrc_path.is_file():
        return None
    try:
        raw = lrc_path.read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        return None
    return raw if raw and "[" in raw else None


def find_release_synced_lrc(
    db: Session,
    *,
    band_id: int,
    release_id: str,
    track_title: str,
    play_path: str | None = None,
    backfill: bool = True,
) -> str | None:
    """Return synced LRC from any edition of the same song on this release."""
    payload = build_release_tracklist(db, band_id, release_id)
    if not payload:
        return None

    key = release_track_main_key(track_title)
    paths = release_paths_by_main_key(payload).get(key, [])
    if play_path and play_path.strip() in paths:
        ordered = [play_path.strip()] + [
            p for p in paths if p != play_path.strip()
        ]
    else:
        ordered = list(paths)

    found: str | None = None
    for path in ordered:
        synced = synced_lrc_for_path(db, path)
        if synced:
            found = synced
            break

    if not found:
        return None

    if backfill and play_path:
        current = play_path.strip()
        if current and not read_lyrics_lrc(db, current):
            from app.services.lyrics import _strip_lrc_tags

            plain = _strip_lrc_tags(found).strip()
            save_lyrics(
                db,
                play_path=current,
                band_id=band_id,
                title=track_title.strip(),
                lyrics_plain=plain or None,
                lyrics_lrc=found,
            )
    return found


def propagate_synced_lrc_to_siblings(
    db: Session,
    payload: dict,
    *,
    track_title: str,
    synced_lrc: str,
    plain: str | None,
    band_id: int,
    source_path: str | None = None,
) -> None:
    """Copy synced LRC to every edition path for the same main title on the release."""
    key = release_track_main_key(track_title)
    for path in release_paths_by_main_key(payload).get(key, []):
        if source_path and path == source_path:
            continue
        if read_lyrics_lrc(db, path):
            continue
        save_lyrics(
            db,
            play_path=path,
            band_id=band_id,
            title=track_title.strip(),
            lyrics_plain=plain,
            lyrics_lrc=synced_lrc,
        )
