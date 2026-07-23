"""Refresh Series metadata from TMDb."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.crud import get_tmdb_key
from app.franchise_index import normalize_franchise_slug
from app.models import Series
from app.series_artwork import ensure_artwork_cached
from app.series_index import find_franchise_dir
from app.services.tmdb import (
    build_related_from_tv,
    fetch_person_tv_credits,
    fetch_tv,
    normalize_tv_payload,
    search_tv_id,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def find_series_row(db: Session, franchise_name: str) -> Series | None:
    want = normalize_franchise_slug(franchise_name)
    rows = db.scalars(select(Series)).all()
    for row in rows:
        name = row.ser_name or ""
        if normalize_franchise_slug(name) == want or name.casefold() == franchise_name.casefold():
            return row
    return None


def ensure_series_row(db: Session, franchise_name: str) -> Series:
    row = find_series_row(db, franchise_name)
    if row:
        return row
    row = Series(ser_name=franchise_name)
    db.add(row)
    db.flush()
    return row


def _merge_unique(existing: list[str], extra: list[str]) -> list[str]:
    out = list(existing)
    seen = {x.casefold() for x in out}
    for x in extra:
        if x and x.casefold() not in seen:
            out.append(x)
            seen.add(x.casefold())
    return out


def _merge_related(existing: dict | list | None, fresh: dict) -> dict:
    """Merge TMDb related with manual/hidden entries so refresh doesn't wipe edits."""
    if not isinstance(existing, dict):
        existing = {}
    out: dict[str, list] = {}
    for bucket in ("creator", "similar"):
        prev = existing.get(bucket) or []
        if not isinstance(prev, list):
            prev = []
        hidden_ids: set[str] = set()
        manuals: list[dict] = []
        for item in prev:
            if not isinstance(item, dict):
                continue
            tid = str(item.get("tmdb_id") or item.get("id") or "")
            if item.get("hidden"):
                if tid:
                    hidden_ids.add(tid)
                manuals.append(dict(item))
            elif item.get("manual"):
                manuals.append(dict(item))
        merged: list[dict] = []
        seen: set[str] = set()
        for item in fresh.get(bucket) or []:
            if not isinstance(item, dict):
                continue
            tid = str(item.get("tmdb_id") or "")
            if tid and tid in hidden_ids:
                # Keep hidden marker so future refreshes stay suppressed
                merged.append({**item, "hidden": True})
                seen.add(tid)
                continue
            merged.append(dict(item))
            if tid:
                seen.add(tid)
        for item in manuals:
            tid = str(item.get("tmdb_id") or item.get("id") or "")
            if tid and tid in seen and not item.get("hidden"):
                continue
            if tid and tid in seen and item.get("hidden"):
                continue
            if not tid or tid not in seen:
                merged.append(item)
                if tid:
                    seen.add(tid)
        out[bucket] = merged
    return out


async def refresh_series_metadata(
    db: Session,
    franchise_name: str,
    *,
    include_bio: bool = True,
    tmdb_id: int | str | None = None,
    subseries_titles: list[str] | None = None,
) -> dict:
    """Pull TMDb TV details into the Series row for this franchise folder name."""
    api_key = get_tmdb_key(db)
    if not api_key:
        return {"ok": False, "error": "TMDb API key not configured"}

    row = ensure_series_row(db, franchise_name)
    tv_id = tmdb_id or row.ser_code
    if not tv_id:
        found_id, found_name = await search_tv_id(franchise_name, api_key)
        if not found_id:
            return {"ok": False, "error": f"No TMDb match for “{franchise_name}”"}
        tv_id = found_id
        row.ser_code = str(found_id)
        if found_name and not row.ser_name:
            row.ser_name = found_name

    raw = await fetch_tv(tv_id, api_key)
    data = normalize_tv_payload(raw)

    # Prefer writers/genres/publishers/origin/activity from subseries TMDb;
    # fall back to franchise-level match when subseries yield nothing.
    franchise_writers = list(data.get("writers") or [])
    franchise_publishers = list(data.get("publishers") or [])
    franchise_genres = list(data.get("genres") or [])
    franchise_origin = data.get("origin_place")
    franchise_countries = list(data.get("origin_countries") or [])
    first_air = data.get("first_air_date")
    last_air = data.get("last_air_date")

    writers: list[str] = []
    publishers: list[str] = []
    genres: list = []
    origin_place = None
    countries: list[str] = []

    for title in (subseries_titles or [])[:12]:
        if not title or title.casefold() == franchise_name.casefold():
            continue
        try:
            sid, _ = await search_tv_id(title, api_key)
            if not sid or str(sid) == str(tv_id):
                continue
            sub = normalize_tv_payload(await fetch_tv(sid, api_key))
        except Exception:
            continue
        writers = _merge_unique(writers, sub.get("writers") or [])
        publishers = _merge_unique(publishers, sub.get("publishers") or [])
        seen_g = {str(g.get("id") or g.get("name")).casefold() for g in genres}
        for g in sub.get("genres") or []:
            key = str(g.get("id") or g.get("name")).casefold()
            if key not in seen_g:
                genres.append(g)
                seen_g.add(key)
        if not origin_place and sub.get("origin_place"):
            origin_place = sub["origin_place"]
        for c in sub.get("origin_countries") or []:
            if c not in countries:
                countries.append(c)
        if sub.get("first_air_date") and (
            not first_air or sub["first_air_date"] < first_air
        ):
            first_air = sub["first_air_date"]
        if sub.get("last_air_date") and (
            not last_air or sub["last_air_date"] > last_air
        ):
            last_air = sub["last_air_date"]

    if not writers:
        writers = franchise_writers
    if not publishers:
        publishers = franchise_publishers
    if not genres:
        genres = franchise_genres
    if not origin_place:
        origin_place = franchise_origin
    if not countries:
        countries = franchise_countries

    row.ser_code = str(data.get("tmdb_id") or tv_id)

    aliases = data.get("aliases") or []
    if aliases:
        row.ser_other_names = ";".join(aliases)

    if include_bio and not (row.ser_bio_manual or 0):
        overview = data.get("overview")
        if overview:
            row.ser_bio = overview
            row.ser_bio_source = "tmdb"
            row.ser_bio_manual = 0

    # Prefer country ISO only — avoid "Japan, Japan" when place duplicates country
    row.ser_origin_place = None
    if countries:
        row.ser_country_iso = str(countries[0]).lower()[:2]

    if writers:
        row.ser_writers = ";".join(writers)
    if publishers:
        row.ser_publishers = ";".join(publishers)
        row.ser_studio = publishers[0]
    if genres:
        row.ser_genres_json = json.dumps(genres, ensure_ascii=False)

    cast = data.get("cast") or {}
    # Normalize to characters/staff keys — main cast only (character-centered)
    characters = (
        cast.get("characters")
        or cast.get("animated")
        or []
    )[:8]
    staff = (cast.get("staff") or cast.get("people") or [])[:8]

    root = Path(settings.media_root) if settings.media_root else None
    found = None
    if root and root.is_dir():
        found = find_franchise_dir(
            normalize_franchise_slug(franchise_name) or franchise_name, root
        )
    if found:
        franchise_dir, _ = found
        from app.series_artwork import enrich_cast_character_photos_from_jikan

        characters = enrich_cast_character_photos_from_jikan(
            franchise_dir, root, franchise_name, characters
        )

    cast_out = {
        "characters": characters,
        "staff": staff,
        "animated": characters,
        "people": staff,
    }
    row.ser_cast_json = json.dumps(cast_out, ensure_ascii=False)

    # Same-creator + similar series from TMDb
    creator_credits: list = []
    for cid in (data.get("creator_ids") or [])[:3]:
        try:
            creator_credits.extend(await fetch_person_tv_credits(int(cid), api_key))
        except Exception:
            continue
    related = build_related_from_tv(
        raw,
        creator_credits=creator_credits,
        self_id=int(tv_id) if str(tv_id).isdigit() else None,
    )

    # Preserve manual + hidden related entries across TMDb refresh
    existing_images: dict = {}
    try:
        existing_images = json.loads(row.ser_images_json or "{}")
        if not isinstance(existing_images, dict):
            existing_images = {}
    except (json.JSONDecodeError, TypeError):
        existing_images = {}
    related = _merge_related(existing_images.get("related") or {}, related)

    from app.series_languages import (
        LANGUAGE_CATALOG,
        normalize_lang_code,
        origin_language_code,
    )

    origin_lang = origin_language_code(
        tmdb_original_language=data.get("original_language"),
        country_iso=row.ser_country_iso,
    )
    existing_langs = existing_images.get("languages")
    if isinstance(existing_langs, list) and existing_langs:
        languages = [
            normalize_lang_code(c) or c
            for c in existing_langs
            if c
        ]
    else:
        languages = [origin_lang] if origin_lang else [LANGUAGE_CATALOG[0]["code"]]

    links = data.get("links") or []
    # Ensure stable ids for edit/delete in the UI
    normalized_links = []
    for link in links:
        if not isinstance(link, dict):
            continue
        item = dict(link)
        if not item.get("id"):
            item["id"] = f"tmdb-{uuid.uuid4().hex[:10]}"
        normalized_links.append(item)
    row.ser_links_json = json.dumps(normalized_links, ensure_ascii=False)

    row.ser_status = data.get("status")
    row.ser_type = data.get("type")
    row.ser_is_animated = 1 if data.get("is_animated") else 0
    row.ser_poster_url = data.get("poster_url")
    row.ser_backdrop_url = data.get("backdrop_url")

    images_blob: dict = {
        "posters": data.get("posters") or [],
        "backdrops": data.get("backdrops") or [],
        "activity_periods": existing_images.get("activity_periods") or [],
        "related": related,
        "languages": languages,
        "origin_language": origin_lang,
    }
    if first_air or last_air:
        images_blob["activity_periods"] = [
            {"start": first_air, "end": last_air}
        ]
    row.ser_images_json = json.dumps(images_blob, ensure_ascii=False)

    if first_air:
        row.ser_starting_date = first_air
    if last_air:
        row.ser_ending_date = last_air

    # Cache TMDb images into [Artwork] when local portrait/landscape missing
    artwork_saved = {}
    if found:
        franchise_dir, _ = found
        artwork_saved = ensure_artwork_cached(
            franchise_dir,
            root,
            posters=images_blob["posters"]
            or ([data.get("poster_url")] if data.get("poster_url") else []),
            backdrops=images_blob["backdrops"]
            or ([data.get("backdrop_url")] if data.get("backdrop_url") else []),
        )

    row.ser_metadata_refreshed_at = _now()
    db.commit()
    return {
        "ok": True,
        "refreshed_at": row.ser_metadata_refreshed_at,
        "tmdb_id": row.ser_code,
        "ser_id": row.ser_id,
        "artwork": artwork_saved,
    }
