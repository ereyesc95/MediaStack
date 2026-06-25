"""Bulk-fetch synced LRC for a release via LRCLIB."""
from __future__ import annotations

import asyncio

from sqlalchemy.orm import Session

from app.lyrics_artists import lyrics_artist_names
from app.media_paths import path_to_local_file
from app.release_lyrics_shared import (
    propagate_synced_lrc_to_siblings,
    release_paths_by_main_key,
    release_track_main_key,
    synced_lrc_for_path,
)
from app.release_tracklist import build_release_tracklist
from app.services.lyrics import _strip_lrc_tags, _write_cache, fetch_lrclib_synced_resilient
from app.track_overrides import read_lyrics_lrc, save_lyrics


async def fetch_release_lyrics(
    db: Session,
    band_id: int,
    release_id: str,
    *,
    force: bool = False,
    delay_sec: float = 0.35,
) -> dict:
    payload = build_release_tracklist(db, band_id, release_id)
    if not payload:
        return {"ok": False, "error": "Release tracklist not found"}

    from app import crud

    band = crud.get_band(db, band_id)
    if not band:
        return {"ok": False, "error": "Band not found"}

    artist_names = lyrics_artist_names(db, band)
    artist = (artist_names[0] if artist_names else "").strip()
    album = (payload.get("title") or "").strip()
    if not artist:
        return {"ok": False, "error": "Missing artist name"}

    paths_by_key = release_paths_by_main_key(payload)

    fetched = 0
    skipped = 0
    failed = 0
    no_sync = 0
    items: list[dict] = []

    for edition in payload.get("editions") or []:
        for group in edition.get("groups") or []:
            for track in group.get("tracks") or []:
                play_path = (track.get("play_path") or "").strip()
                title = (track.get("title") or "").strip()
                if not play_path or not title:
                    failed += 1
                    items.append({"title": title or play_path, "status": "error"})
                    continue

                audio_file = path_to_local_file(play_path)
                if not audio_file or not audio_file.is_file():
                    failed += 1
                    items.append({"title": title, "status": "missing_file"})
                    continue

                existing = read_lyrics_lrc(db, play_path)
                if existing and not force:
                    plain = _strip_lrc_tags(existing).strip()
                    propagate_synced_lrc_to_siblings(
                        db,
                        payload,
                        track_title=title,
                        synced_lrc=existing,
                        plain=plain or None,
                        band_id=band_id,
                        source_path=play_path,
                    )
                    skipped += 1
                    items.append(
                        {
                            "title": title,
                            "status": "skipped",
                            "path": play_path,
                        }
                    )
                    continue

                main_key = release_track_main_key(title)
                sibling_synced: str | None = None
                for sibling_path in paths_by_key.get(main_key, []):
                    sibling_synced = synced_lrc_for_path(db, sibling_path)
                    if sibling_synced:
                        break

                if sibling_synced and not force:
                    plain = _strip_lrc_tags(sibling_synced).strip()
                    propagate_synced_lrc_to_siblings(
                        db,
                        payload,
                        track_title=title,
                        synced_lrc=sibling_synced,
                        plain=plain or None,
                        band_id=band_id,
                    )
                    skipped += 1
                    items.append(
                        {
                            "title": title,
                            "status": "skipped",
                            "path": play_path,
                        }
                    )
                    continue

                duration = track.get("duration_sec")
                synced: str | None = None
                matched_title: str | None = None
                try:
                    synced = await fetch_lrclib_synced_resilient(
                        artist_names,
                        title,
                        album=album or None,
                        duration=float(duration) if duration else None,
                    )
                    if synced:
                        matched_title = title
                    if delay_sec > 0 and not synced:
                        await asyncio.sleep(delay_sec)
                except Exception:
                    failed += 1
                    items.append({"title": title, "status": "error"})
                    if delay_sec > 0:
                        await asyncio.sleep(delay_sec)
                    continue

                if not synced:
                    no_sync += 1
                    items.append({"title": title, "status": "not_found"})
                    continue

                plain = _strip_lrc_tags(synced).strip()
                try:
                    save_lyrics(
                        db,
                        play_path=play_path,
                        band_id=band_id,
                        title=title,
                        lyrics_plain=plain or None,
                        lyrics_lrc=synced,
                    )
                except ValueError:
                    failed += 1
                    items.append({"title": title, "status": "write_error"})
                    continue

                if plain:
                    _write_cache(artist, title, lyrics=plain, source="lrclib-lrc")

                propagate_synced_lrc_to_siblings(
                    db,
                    payload,
                    track_title=title,
                    synced_lrc=synced,
                    plain=plain or None,
                    band_id=band_id,
                    source_path=play_path,
                )

                fetched += 1
                items.append(
                    {
                        "title": title,
                        "status": "fetched",
                        "matched_title": matched_title,
                        "path": play_path,
                    }
                )

                if delay_sec > 0:
                    await asyncio.sleep(delay_sec)

    return {
        "ok": True,
        "fetched": fetched,
        "skipped": skipped,
        "failed": failed,
        "not_found": no_sync,
        "items": items,
    }
