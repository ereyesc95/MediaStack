"""Lazy MusicBrainz + Wikipedia enrichment for release overview."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, unquote

import httpx
from sqlalchemy.orm import Session

from app.band_overview import _normalize_bio
from app.config import settings
from app.models import Band
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
    names: list[str] = []
    for tag in data.get("tags") or []:
        name = (tag.get("name") or "").strip()
        if name and name not in names:
            names.append(name)
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

    rg_mbid = await _resolve_release_group_mbid(db, band, title)
    if not rg_mbid:
        return {"ok": False, "error": "No MusicBrainz release group found"}

    data = await fetch_release_group(rg_mbid, user_agent=_user_agent())
    relations = data.get("relations") or []

    description: str | None = None
    description_source = "musicbrainz"
    annotation = (data.get("annotation") or "").strip()
    if annotation:
        description = _normalize_bio(annotation)

    wiki_url = _wikipedia_url(relations)
    if include_wikipedia and wiki_url:
        wiki_text = await _fetch_wikipedia_extract(wiki_url)
        if wiki_text:
            description = wiki_text
            description_source = "wikipedia"

    cache_payload = {
        "release_group_mbid": rg_mbid,
        "description": description,
        "description_source": description_source,
        "subgenres": _tags_as_subgenres(data),
        "label": _label_from_release_group(data),
        "producer": _producers_from_credits(data),
        "reviews": _reviews_from_relations(relations),
        "release_code": rg_mbid,
        "refreshed_at": _now(),
    }
    save_mb_cache(band_id, release_id, cache_payload)

    overview = build_release_overview(db, band_id, release_id)
    if overview:
        overview = apply_release_overrides(overview, band_id, release_id)

    return {
        "ok": True,
        "refreshed_at": cache_payload["refreshed_at"],
        "release_group_mbid": rg_mbid,
        "overview": overview,
    }


def apply_mb_cache(payload: dict, band_id: int, release_id: str) -> dict:
    override = load_release_override(band_id, release_id)
    cached = load_mb_cache(band_id, release_id)
    if not cached:
        return payload

    if cached.get("description") and not override.get("description"):
        if not payload.get("description_manual"):
            payload["description"] = cached["description"]
            payload["description_source"] = cached.get("description_source") or "musicbrainz"
    if cached.get("subgenres") and not override.get("subgenres"):
        if not payload.get("subgenres"):
            payload["subgenres"] = [
                {"id": i, "name": name}
                for i, name in enumerate(cached["subgenres"])
            ]
    if cached.get("producer") and not override.get("producer"):
        if not payload.get("producer"):
            payload["producer"] = cached["producer"]
    if cached.get("label") and not override.get("label"):
        if not payload.get("label"):
            payload["label"] = cached["label"]
    if cached.get("release_code") and not payload.get("release_code"):
        payload["release_code"] = cached["release_code"]
    if cached.get("reviews") and not payload.get("reviews"):
        payload["reviews"] = cached["reviews"]
    payload["metadata_refreshed_at"] = cached.get("refreshed_at")
    return payload
