"""Bulk-fetch synced LRC for a release via LRCLIB."""
from __future__ import annotations

import asyncio

from sqlalchemy.orm import Session

from app.lyrics_storage import lrclib_title_variants
from app.media_paths import path_to_local_file
from app.release_tracklist import build_release_tracklist
from app.services.lyrics import _strip_lrc_tags, _write_cache, fetch_lrclib_synced
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

    artist = (payload.get("artist_name") or "").strip()
    album = (payload.get("title") or "").strip()
    if not artist:
        return {"ok": False, "error": "Missing artist name"}

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
                for variant in lrclib_title_variants(title):
                    synced = await fetch_lrclib_synced(
                        artist,
                        variant,
                        album=album or None,
                        duration=float(duration) if duration else None,
                    )
                    if synced:
                        matched_title = variant
                        break
                    if delay_sec > 0:
                        await asyncio.sleep(delay_sec)

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
