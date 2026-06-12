"""Bulk-fetch synced LRC for a release via LRCLIB."""
from __future__ import annotations

import asyncio
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.lyrics_storage import (
    ensure_artwork_lyrics_dir,
    find_lrc_path,
    lrclib_title_variants,
)
from app.media_paths import path_to_local_file
from app.release_tracklist import build_release_tracklist
from app.services.lyrics import _strip_lrc_tags, _write_cache, fetch_lrclib_synced


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

                existing = find_lrc_path(audio_file)
                if existing and not force:
                    skipped += 1
                    items.append(
                        {
                            "title": title,
                            "status": "skipped",
                            "path": str(existing),
                        }
                    )
                    continue

                dest = ensure_artwork_lyrics_dir(audio_file)
                if not dest:
                    failed += 1
                    items.append({"title": title, "status": "no_artwork"})
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

                try:
                    dest.write_text(synced, encoding="utf-8")
                except OSError:
                    failed += 1
                    items.append({"title": title, "status": "write_error"})
                    continue

                plain = _strip_lrc_tags(synced).strip()
                if plain:
                    _write_cache(artist, title, lyrics=plain, source="lrclib-lrc")

                fetched += 1
                rel_path = None
                if settings.media_root:
                    try:
                        rel_path = dest.relative_to(Path(settings.media_root)).as_posix()
                    except ValueError:
                        rel_path = dest.as_posix()
                items.append(
                    {
                        "title": title,
                        "status": "fetched",
                        "matched_title": matched_title,
                        "path": rel_path,
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
