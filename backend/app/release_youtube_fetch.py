"""Bulk-fetch YouTube video candidates for a release via MusicBrainz."""
from __future__ import annotations

import asyncio

from sqlalchemy.orm import Session

from app.config import settings
from app.lyrics_storage import lrclib_title_variants
from app.release_tracklist import build_release_tracklist
from app.services.musicbrainz import fetch_recording, search_recordings
from app.track_youtube import read_track_youtube
from app.youtube_storage import is_youtube_url


def _youtube_from_recording(data: dict) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for rel in data.get("relations") or []:
        url = (rel.get("url") or {}).get("resource") or ""
        if not url or not is_youtube_url(url):
            continue
        if url in seen:
            continue
        seen.add(url)
        rel_type = (rel.get("type") or "").strip()
        label = rel_type or "YouTube"
        out.append({"url": url, "label": label, "source": "musicbrainz"})
    return out


def _track_priority(edition_kind: str, group_kind: str) -> int:
    ek = edition_kind.casefold()
    gk = group_kind.casefold()
    if ek == "single" or gk == "single":
        return 0
    if ek == "bside":
        return 1
    return 2


async def _candidates_for_title(
    artist_mbid: str,
    title: str,
    *,
    delay_sec: float,
) -> list[dict]:
    ua = settings.musicbrainz_user_agent
    merged: list[dict] = []
    seen_urls: set[str] = set()
    for variant in lrclib_title_variants(title):
        recordings = await search_recordings(
            artist_mbid=artist_mbid,
            title=variant,
            limit=3,
            user_agent=ua,
        )
        for rec in recordings:
            mbid = rec.get("mbid")
            if not mbid:
                continue
            data = await fetch_recording(mbid, user_agent=ua)
            for item in _youtube_from_recording(data):
                url = item["url"]
                if url in seen_urls:
                    continue
                seen_urls.add(url)
                merged.append(item)
            await asyncio.sleep(delay_sec)
        if merged:
            break
    return merged


async def fetch_release_youtube_candidates(
    db: Session,
    band_id: int,
    release_id: str,
    *,
    singles_only: bool = False,
    delay_sec: float = 0.35,
) -> dict:
    from app import crud

    band = crud.get_band(db, band_id)
    if not band:
        return {"ok": False, "error": "Band not found"}
    artist_mbid = (band.bnd_code or "").strip()
    if not artist_mbid:
        return {"ok": False, "error": "No MusicBrainz ID on band"}

    payload = build_release_tracklist(db, band_id, release_id)
    if not payload:
        return {"ok": False, "error": "Release tracklist not found"}

    artist = (payload.get("artist_name") or "").strip()
    items: list[dict] = []
    queued: list[tuple[int, str, str, str, str, str]] = []

    for edition in payload.get("editions") or []:
        edition_kind = edition.get("kind") or "edition"
        for group in edition.get("groups") or []:
            group_kind = group.get("kind") or "flat"
            priority = _track_priority(edition_kind, group_kind)
            if singles_only and priority > 1:
                continue
            for track in group.get("tracks") or []:
                play_path = (track.get("play_path") or "").strip()
                title = (track.get("title") or "").strip()
                if not play_path or not title:
                    continue
                existing, _source = read_track_youtube(
                    db,
                    band_id=band_id,
                    title=title,
                    play_path=play_path,
                )
                queued.append(
                    (priority, title, play_path, edition_kind, group_kind, existing or "")
                )

    queued.sort(key=lambda row: (row[0], row[1].casefold()))

    found = 0
    skipped = 0
    not_found = 0
    for _prio, title, play_path, edition_kind, group_kind, existing in queued:
        if existing:
            skipped += 1
            items.append(
                {
                    "title": title,
                    "play_path": play_path,
                    "edition_kind": edition_kind,
                    "group_kind": group_kind,
                    "existing_url": existing,
                    "status": "skipped",
                    "candidates": [],
                }
            )
            continue

        candidates = await _candidates_for_title(
            artist_mbid,
            title,
            delay_sec=delay_sec,
        )
        if candidates:
            found += 1
            items.append(
                {
                    "title": title,
                    "play_path": play_path,
                    "edition_kind": edition_kind,
                    "group_kind": group_kind,
                    "existing_url": None,
                    "status": "candidate",
                    "candidates": candidates,
                }
            )
        else:
            not_found += 1
            items.append(
                {
                    "title": title,
                    "play_path": play_path,
                    "edition_kind": edition_kind,
                    "group_kind": group_kind,
                    "existing_url": None,
                    "status": "not_found",
                    "candidates": [],
                }
            )

    return {
        "ok": True,
        "artist": artist,
        "found": found,
        "skipped": skipped,
        "not_found": not_found,
        "items": items,
    }
