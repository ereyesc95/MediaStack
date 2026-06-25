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


def _sidecar_lrc_exists(play_path: str) -> bool:
    local = path_to_local_file(play_path)
    if not local:
        return False
    lrc_path = find_lrc_path(local)
    return bool(lrc_path and lrc_path.is_file())


class LyricsAvailabilityLookup:
    """Batch lyrics availability for a release tracklist (one tracklist build)."""

    __slots__ = (
        "_paths_by_main_key",
        "_main_keys_with_synced",
        "_paths_with_lrc",
        "_paths_with_plain",
        "_sidecar_paths",
    )

    def __init__(
        self,
        *,
        paths_by_main_key: dict[str, list[str]],
        main_keys_with_synced: set[str],
        paths_with_lrc: set[str],
        paths_with_plain: set[str],
        sidecar_paths: set[str],
    ) -> None:
        self._paths_by_main_key = paths_by_main_key
        self._main_keys_with_synced = main_keys_with_synced
        self._paths_with_lrc = paths_with_lrc
        self._paths_with_plain = paths_with_plain
        self._sidecar_paths = sidecar_paths

    @classmethod
    def build(cls, db: Session, tracklist: dict) -> LyricsAvailabilityLookup:
        from sqlalchemy import select

        from app.models import TrackOverride

        paths_by_main_key = release_paths_by_main_key(tracklist)
        all_paths: list[str] = []
        seen_paths: set[str] = set()
        for paths in paths_by_main_key.values():
            for path in paths:
                piece = path.strip()
                if piece and piece not in seen_paths:
                    seen_paths.add(piece)
                    all_paths.append(piece)

        paths_with_lrc: set[str] = set()
        paths_with_plain: set[str] = set()
        lrc_text_by_path: dict[str, str] = {}
        if all_paths:
            for row in db.scalars(
                select(TrackOverride).where(
                    TrackOverride.tro_play_path.in_(all_paths)
                )
            ).all():
                path = (row.tro_play_path or "").strip()
                if not path:
                    continue
                lrc = (row.tro_lyrics_lrc or "").strip()
                if lrc:
                    paths_with_lrc.add(path)
                    lrc_text_by_path[path] = lrc
                plain = (row.tro_lyrics_plain or "").strip()
                if plain:
                    paths_with_plain.add(path)

        main_keys_with_synced: set[str] = set()
        sidecar_paths: set[str] = set()
        for key, paths in paths_by_main_key.items():
            for path in paths:
                text = lrc_text_by_path.get(path)
                if text and "[" in text:
                    main_keys_with_synced.add(key)
                    break
                if path in paths_with_lrc:
                    continue
                local = path_to_local_file(path)
                if not local:
                    continue
                lrc_path = find_lrc_path(local)
                if not lrc_path or not lrc_path.is_file():
                    continue
                try:
                    raw = lrc_path.read_text(
                        encoding="utf-8", errors="replace"
                    ).strip()
                except OSError:
                    raw = ""
                if raw and "[" in raw:
                    main_keys_with_synced.add(key)
                    break

        for path in all_paths:
            if path in paths_with_lrc or path in paths_with_plain:
                continue
            if _sidecar_lrc_exists(path):
                sidecar_paths.add(path)

        return cls(
            paths_by_main_key=paths_by_main_key,
            main_keys_with_synced=main_keys_with_synced,
            paths_with_lrc=paths_with_lrc,
            paths_with_plain=paths_with_plain,
            sidecar_paths=sidecar_paths,
        )

    def has_lyrics(self, play_path: str, track_title: str) -> bool:
        key = release_track_main_key(track_title)
        if key in self._main_keys_with_synced:
            return True
        path = (play_path or "").strip()
        if not path:
            return False
        if path in self._paths_with_lrc or path in self._paths_with_plain:
            return True
        if path in self._sidecar_paths:
            return True
        return False


def find_release_synced_lrc(
    db: Session,
    *,
    band_id: int,
    release_id: str,
    track_title: str,
    play_path: str | None = None,
    backfill: bool = True,
    payload: dict | None = None,
) -> str | None:
    """Return synced LRC from any edition of the same song on this release."""
    if payload is None:
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
