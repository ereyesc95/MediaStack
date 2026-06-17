"""Lazy MusicBrainz + Wikipedia enrichment for release overview."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, unquote

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.band_overview import _normalize_bio
from app.config import settings
from app.models import Artist, Band, Release
from app.paths import DATA_DIR
from app.release_overview import (
    _match_db_release,
    build_release_overview,
    resolve_release_content,
)
from app.release_admin import apply_release_overrides, load_release_override
from app.services.musicbrainz import fetch_release_group, search_release_groups

MB_CACHE_DIR = DATA_DIR / "release_mb_cache"

REVIEW_TYPE_KEYS = (
    "discogs",
    "allmusic",
    "rateyourmusic",
    "secondhandsongs",
    "review",
    "score",
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cache_path(band_id: int, release_id: str) -> Path:
    MB_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    safe = release_id.replace("/", "_")
    return MB_CACHE_DIR / f"{band_id}_{safe}.json"


def load_mb_cache(band_id: int, release_id: str) -> dict:
    path = _cache_path(band_id, release_id)
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_mb_cache(band_id: int, release_id: str, data: dict) -> None:
    path = _cache_path(band_id, release_id)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _user_agent() -> str:
    return settings.musicbrainz_user_agent


async def _fetch_wikipedia_extract(wiki_url: str) -> str | None:
    if "wikipedia.org/wiki/" not in wiki_url:
        return None
    title = unquote(wiki_url.split("/wiki/", 1)[1].split("#")[0])
    if not title:
        return None
    encoded = quote(title, safe="")
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{encoded}",
            headers={"User-Agent": _user_agent()},
        )
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
    extract = (data.get("extract") or "").strip()
    return extract or None


async def _search_wikipedia_for_album(artist: str, album: str) -> str | None:
    """Find a Wikipedia summary when MusicBrainz has no linked article."""
    queries = [
        f"{album} {artist} album",
        f"{album} album",
        f"{artist} {album}",
    ]
    async with httpx.AsyncClient(timeout=20.0) as client:
        for query in queries:
            r = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "query",
                    "list": "search",
                    "srsearch": query,
                    "format": "json",
                    "srlimit": 3,
                    "origin": "*",
                },
                headers={"User-Agent": _user_agent()},
            )
            r.raise_for_status()
            hits = (r.json().get("query") or {}).get("search") or []
            for hit in hits:
                title = (hit.get("title") or "").strip()
                if not title:
                    continue
                low = title.casefold()
                album_key = album.casefold()
                artist_key = artist.casefold()
                if album_key not in low and artist_key not in low:
                    continue
                encoded = quote(title.replace(" ", "_"), safe="")
                summary = await _fetch_wikipedia_extract(
                    f"https://en.wikipedia.org/wiki/{encoded}"
                )
                if summary and len(summary) > 80:
                    return summary
    return None


def _reviews_from_relations(relations: list[dict]) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for rel in relations or []:
        if rel.get("target-type") != "url":
            continue
        url = (rel.get("url") or {}).get("resource")
        if not url or url in seen:
            continue
        typ = (rel.get("type") or "").casefold()
        if not any(k in typ for k in REVIEW_TYPE_KEYS):
            continue
        seen.add(url)
        label = (rel.get("type") or "Link").replace("-", " ").title()
        out.append({"label": label, "url": url})
    return out


def _wikipedia_url(relations: list[dict]) -> str | None:
    for rel in relations or []:
        if rel.get("target-type") != "url":
            continue
        url = (rel.get("url") or {}).get("resource") or ""
        if "wikipedia.org" in url.casefold():
            return url
    return None


def _tags_as_subgenres(data: dict) -> list[str]:
    skip = {
        "finland",
        "finnish",
        "finnish rock",
        "english",
        "instrumental",
    }
    names: list[str] = []
    for tag in data.get("tags") or []:
        name = (tag.get("name") or "").strip()
        if not name or name.casefold() in skip:
            continue
        title = name.title() if name.islower() else name
        if title not in names:
            names.append(title)
    return names[:8]


def _label_from_release_group(data: dict) -> str | None:
    for rel in data.get("releases") or []:
        for li in rel.get("label-info") or []:
            label = (li.get("label") or {}).get("name")
            if label:
                return label
    return None


def _producers_from_credits(data: dict) -> str | None:
    names: list[str] = []
    for ac in data.get("artist-credit") or []:
        artist = ac.get("artist") or {}
        name = artist.get("name")
        if name:
            names.append(name)
    for rel in data.get("relations") or []:
        if rel.get("type") == "producer":
            artist = rel.get("artist") or {}
            name = artist.get("name")
            if name and name not in names:
                names.append(name)
    return "; ".join(names) if names else None


async def _resolve_release_group_mbid(
    db: Session,
    band: Band,
    title: str,
) -> str | None:
    rel = _match_db_release(db, band.bnd_id, title)
    if rel and rel.rel_release_code:
        code = rel.rel_release_code.strip()
        if re.match(r"^[0-9a-f-]{36}$", code, re.I):
            return code
    if not band.bnd_code:
        return None
    matches = await search_release_groups(
        artist_mbid=band.bnd_code,
        title=title,
        limit=3,
        user_agent=_user_agent(),
    )
    if not matches:
        return None
    want = title.casefold()
    for m in matches:
        if (m.get("title") or "").casefold() == want:
            return m.get("mbid")
    return matches[0].get("mbid")


def _encode_db_description(text: str) -> str:
    return text.replace(".", "■").replace("'", "█")


def _producer_db_ref(db: Session, producer: str) -> str:
    names = [part.strip() for part in re.split(r"[;,]", producer) if part.strip()]
    refs: list[str] = []
    for name in names:
        matched: str | None = None
        want = name.casefold()
        for artist in db.scalars(select(Artist)).all():
            stage = (artist.art_stage_name or "").casefold()
            legal = (artist.art_name or "").casefold()
            if want in {stage, legal}:
                matched = str(artist.art_id)
                break
        refs.append(matched or name)
    return ";".join(refs)


def _get_or_create_db_release(
    db: Session,
    band_id: int,
    title: str,
    *,
    date_iso: str | None = None,
) -> Release:
    rel = _match_db_release(db, band_id, title)
    if rel:
        return rel
    next_id = (db.scalar(select(func.max(Release.rel_id))) or 0) + 1
    rel = Release(
        rel_id=next_id,
        rel_title=title,
        rel_fk_bands=str(band_id),
        rel_date=date_iso,
    )
    db.add(rel)
    db.flush()
    return rel


def persist_release_metadata_to_db(
    db: Session,
    band_id: int,
    title: str,
    cache_payload: dict,
    *,
    date_iso: str | None = None,
) -> None:
    rel = _get_or_create_db_release(db, band_id, title, date_iso=date_iso)
    if cache_payload.get("description"):
        rel.rel_fk_desc = _encode_db_description(cache_payload["description"])
    subgenres = cache_payload.get("subgenres")
    if subgenres:
        rel.rel_fk_subgenres = ";".join(subgenres)
    if cache_payload.get("label"):
        rel.rel_fk_companies = cache_payload["label"]
    producer = cache_payload.get("producer")
    if producer:
        rel.rel_fk_artists = _producer_db_ref(db, producer)
    if cache_payload.get("release_group_mbid"):
        rel.rel_release_code = cache_payload["release_group_mbid"]
    db.commit()


async def refresh_release_metadata(
    db: Session,
    band_id: int,
    release_id: str,
    *,
    include_wikipedia: bool = True,
) -> dict:
    resolved = resolve_release_content(db, band_id, release_id)
    if not resolved:
        return {"ok": False, "error": "Release not found"}
    band, card, _, _ = resolved
    title = card.get("title") or ""
    artist_name = (band.bnd_name or "").strip()

    cache_payload: dict = {"refreshed_at": _now()}
    description: str | None = None
    description_source: str | None = None

    rg_mbid = await _resolve_release_group_mbid(db, band, title)
    if rg_mbid:
        data = await fetch_release_group(rg_mbid, user_agent=_user_agent())
        relations = data.get("relations") or []
        cache_payload["release_group_mbid"] = rg_mbid
        cache_payload["subgenres"] = _tags_as_subgenres(data)
        cache_payload["label"] = _label_from_release_group(data)
        cache_payload["producer"] = _producers_from_credits(data)
        cache_payload["reviews"] = _reviews_from_relations(relations)
        cache_payload["release_code"] = rg_mbid

        annotation = (data.get("annotation") or "").strip()
        if annotation:
            description = _normalize_bio(annotation)
            description_source = "musicbrainz"

        if include_wikipedia:
            wiki_url = _wikipedia_url(relations)
            if wiki_url:
                wiki_text = await _fetch_wikipedia_extract(wiki_url)
                if wiki_text:
                    description = wiki_text
                    description_source = "wikipedia"

    if include_wikipedia and not description:
        wiki_text = await _search_wikipedia_for_album(artist_name, title)
        if wiki_text:
            description = _normalize_bio(wiki_text)
            description_source = "wikipedia"

    if description:
        cache_payload["description"] = description
        cache_payload["description_source"] = description_source

    save_mb_cache(band_id, release_id, cache_payload)

    persist_release_metadata_to_db(
        db,
        band_id,
        title,
        cache_payload,
        date_iso=card.get("date_iso"),
    )

    overview = build_release_overview(db, band_id, release_id)
    if overview:
        overview = apply_release_overrides(overview, band_id, release_id)

    got_metadata = bool(
        description
        or cache_payload.get("subgenres")
        or cache_payload.get("label")
        or cache_payload.get("producer")
    )
    if not got_metadata:
        return {
            "ok": False,
            "error": "No metadata found for this release",
            "refreshed_at": cache_payload["refreshed_at"],
        }

    return {
        "ok": True,
        "refreshed_at": cache_payload["refreshed_at"],
        "release_group_mbid": cache_payload.get("release_group_mbid"),
        "overview": overview,
    }


def apply_mb_cache(payload: dict, band_id: int, release_id: str) -> dict:
    override = load_release_override(band_id, release_id)
    cached = load_mb_cache(band_id, release_id)
    if not cached:
        return payload

    from_db = bool(payload.get("metadata_from_database"))
    payload.pop("metadata_from_database", None)

    if cached.get("description") and not override.get("description"):
        if not payload.get("description_manual") and not from_db and not payload.get("description"):
            payload["description"] = cached["description"]
            payload["description_source"] = cached.get("description_source") or "musicbrainz"
    if cached.get("subgenres") and not override.get("subgenres"):
        if not from_db and not payload.get("subgenres"):
            payload["subgenres"] = [
                {"id": i, "name": name}
                for i, name in enumerate(cached["subgenres"])
            ]
    if cached.get("producer") and not override.get("producer"):
        if not from_db and not payload.get("producer"):
            payload["producer"] = cached["producer"]
    if cached.get("label") and not override.get("label"):
        if not from_db and not payload.get("label"):
            payload["label"] = cached["label"]
    if cached.get("release_code") and not payload.get("release_code"):
        payload["release_code"] = cached["release_code"]
    if cached.get("reviews") and not payload.get("reviews"):
        payload["reviews"] = cached["reviews"]
    payload["metadata_refreshed_at"] = cached.get("refreshed_at")
    return payload
