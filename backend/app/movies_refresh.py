"""Refresh Movies work/film metadata from TMDb into MovieWork.mwk_metadata_json."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.crud import get_tmdb_key
from app.franchise_index import normalize_franchise_slug, parse_dated_folder_name
from app.models import MovieWork
from app.movies_index import find_film_dir, find_work_dir, _film_id, _list_films
from app.series_artwork import ensure_artwork_cached
from app.series_refresh import _merge_related, _merge_unique
from app.services.tmdb import (
    build_related_from_movie,
    fetch_collection,
    fetch_movie,
    fetch_person_movie_credits,
    normalize_movie_payload,
    search_collection_id,
    search_movie_id,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def find_movie_work(db: Session, work_slug: str) -> MovieWork | None:
    want = normalize_franchise_slug(work_slug) or (work_slug or "").casefold()
    rows = db.scalars(select(MovieWork)).all()
    for row in rows:
        slug = row.mwk_slug or ""
        if slug == want or normalize_franchise_slug(row.mwk_name or "") == want:
            return row
    return None


def ensure_movie_work(
    db: Session,
    *,
    work_slug: str,
    name: str,
    folder_path: str | None = None,
) -> MovieWork:
    row = find_movie_work(db, work_slug)
    if row:
        if folder_path and not row.mwk_folder_path:
            row.mwk_folder_path = folder_path
        if name and not row.mwk_name:
            row.mwk_name = name
        return row
    row = MovieWork(
        mwk_slug=normalize_franchise_slug(work_slug) or work_slug.casefold(),
        mwk_name=name,
        mwk_folder_path=folder_path,
    )
    db.add(row)
    db.flush()
    return row


def _load_meta(row: MovieWork) -> dict:
    try:
        data = json.loads(row.mwk_metadata_json or "{}")
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def _save_meta(row: MovieWork, meta: dict) -> None:
    row.mwk_metadata_json = json.dumps(meta, ensure_ascii=False)


def _normalize_links(links: list) -> list[dict]:
    out: list[dict] = []
    for link in links or []:
        if not isinstance(link, dict):
            continue
        item = dict(link)
        if not item.get("id"):
            item["id"] = f"tmdb-{uuid.uuid4().hex[:10]}"
        out.append(item)
    return out


async def _related_for_movie(
    raw: dict, data: dict, api_key: str, *, self_id: int | None
) -> dict:
    creator_credits: list = []
    via_by_id: dict[int, str] = {}
    crew = (raw.get("credits") or {}).get("crew") or []
    for c in crew:
        if not isinstance(c, dict):
            continue
        cid = c.get("id")
        name = (c.get("name") or "").strip()
        if isinstance(cid, int) and name:
            via_by_id.setdefault(cid, name)
    fallback_names = [
        str(n).strip()
        for n in list(data.get("directors") or []) + list(data.get("writers") or [])
        if n and str(n).strip()
    ]
    for idx, cid in enumerate((data.get("creator_ids") or [])[:3]):
        try:
            person_id = int(cid)
            person_name = via_by_id.get(person_id) or (
                fallback_names[idx] if idx < len(fallback_names) else ""
            )
            if not person_name and fallback_names:
                person_name = fallback_names[0]
            for credit in await fetch_person_movie_credits(person_id, api_key):
                if person_name and isinstance(credit, dict):
                    credit = {**credit, "_via_person": person_name}
                creator_credits.append(credit)
        except Exception:
            continue
    return build_related_from_movie(
        raw, creator_credits=creator_credits, self_id=self_id
    )


def _film_blob_from_normalized(
    data: dict, related: dict, *, existing_related: dict | None = None
) -> dict:
    cast = data.get("cast") or {}
    characters = (cast.get("characters") or cast.get("animated") or [])[:8]
    staff = (cast.get("staff") or cast.get("people") or [])[:8]
    merged_related = _merge_related(existing_related or {}, related)
    return {
        "tmdb_id": data.get("tmdb_id"),
        "name": data.get("name"),
        "overview": data.get("overview"),
        "status": data.get("status"),
        "type": data.get("type"),
        "is_animated": bool(data.get("is_animated")),
        "release_date": data.get("release_date") or data.get("first_air_date"),
        "genres": data.get("genres") or [],
        "writers": data.get("writers") or [],
        "directors": data.get("directors") or [],
        "publishers": data.get("publishers") or [],
        "origin_place": data.get("origin_place"),
        "origin_countries": data.get("origin_countries") or [],
        "original_language": data.get("original_language"),
        "aliases": data.get("aliases") or [],
        "cast": {
            "characters": characters,
            "staff": staff,
            "animated": characters,
            "people": staff,
        },
        "links": _normalize_links(data.get("links") or []),
        "related": merged_related,
        "posters": data.get("posters") or [],
        "backdrops": data.get("backdrops") or [],
        "poster_url": data.get("poster_url"),
        "backdrop_url": data.get("backdrop_url"),
        "collection_id": data.get("collection_id"),
        "collection_name": data.get("collection_name"),
        "refreshed_at": _now(),
    }


async def refresh_film_metadata(
    db: Session,
    film_id: str,
    *,
    include_bio: bool = True,
    tmdb_id: int | str | None = None,
) -> dict:
    api_key = get_tmdb_key(db)
    if not api_key:
        return {"ok": False, "error": "TMDb API key not configured"}

    root = Path(settings.media_root or "")
    if not root.is_dir():
        return {"ok": False, "error": "Media root missing"}

    found = find_film_dir(film_id, root)
    if not found:
        return {"ok": False, "error": f"Film not found: {film_id}"}
    film_dir, work_dir, _letter = found
    work_slug = normalize_franchise_slug(work_dir.name) or work_dir.name.casefold()
    work_rel = work_dir.relative_to(root).as_posix()
    film_rel = film_dir.relative_to(root).as_posix()
    fid = _film_id(film_rel)
    date_iso, title = parse_dated_folder_name(film_dir.name)
    year = int(date_iso[:4]) if date_iso and date_iso[:4].isdigit() else None

    row = ensure_movie_work(
        db, work_slug=work_slug, name=work_dir.name, folder_path=work_rel
    )
    meta = _load_meta(row)
    films_meta = meta.get("films") if isinstance(meta.get("films"), dict) else {}
    existing_film = films_meta.get(fid) if isinstance(films_meta.get(fid), dict) else {}

    movie_id = tmdb_id or existing_film.get("tmdb_id") or row.mwk_tmdb_movie_id
    if not movie_id:
        movie_id, found_name = await search_movie_id(
            title or film_dir.name, api_key, year=year
        )
        if not movie_id:
            return {"ok": False, "error": f"No TMDb match for “{title or film_dir.name}”"}
        if found_name and not row.mwk_name:
            row.mwk_name = work_dir.name

    raw = await fetch_movie(int(movie_id), api_key)
    data = normalize_movie_payload(raw)
    related = await _related_for_movie(
        raw,
        data,
        api_key,
        self_id=int(movie_id) if str(movie_id).isdigit() else None,
    )
    film_blob = _film_blob_from_normalized(
        data,
        related,
        existing_related=(existing_film.get("related") or {})
        if isinstance(existing_film.get("related"), dict)
        else {},
    )
    films_meta[fid] = film_blob
    meta["films"] = films_meta

    # Seed work-level fields from first refreshed film / collection
    if include_bio and not (meta.get("bio_manual")):
        if data.get("overview") and not meta.get("bio"):
            meta["bio"] = data["overview"]
            row.mwk_bio = data["overview"]
    if data.get("collection_id") and not row.mwk_tmdb_collection_id:
        row.mwk_tmdb_collection_id = int(data["collection_id"])
    row.mwk_tmdb_movie_id = int(data.get("tmdb_id") or movie_id)

    artwork = ensure_artwork_cached(
        film_dir,
        root,
        posters=film_blob["posters"]
        or ([film_blob["poster_url"]] if film_blob.get("poster_url") else []),
        backdrops=film_blob["backdrops"]
        or ([film_blob["backdrop_url"]] if film_blob.get("backdrop_url") else []),
    )

    row.mwk_refreshed_at = _now()
    _save_meta(row, meta)
    db.commit()
    return {
        "ok": True,
        "film_id": fid,
        "tmdb_id": film_blob.get("tmdb_id"),
        "refreshed_at": film_blob.get("refreshed_at"),
        "artwork": artwork,
        "work_slug": work_slug,
    }


async def refresh_work_metadata(
    db: Session,
    work_id: str,
    *,
    include_bio: bool = True,
    refresh_films: bool = True,
) -> dict:
    """Refresh franchise-level About from TMDb collection + optionally each film."""
    api_key = get_tmdb_key(db)
    if not api_key:
        return {"ok": False, "error": "TMDb API key not configured"}

    root = Path(settings.media_root or "")
    if not root.is_dir():
        return {"ok": False, "error": "Media root missing"}

    found = find_work_dir(work_id, root)
    if not found:
        return {"ok": False, "error": f"Work not found: {work_id}"}
    work_dir, _letter = found
    work_slug = normalize_franchise_slug(work_dir.name) or work_dir.name.casefold()
    work_rel = work_dir.relative_to(root).as_posix()
    row = ensure_movie_work(
        db, work_slug=work_slug, name=work_dir.name, folder_path=work_rel
    )
    meta = _load_meta(row)

    films = _list_films(work_dir, root)
    film_results: list[dict] = []
    if refresh_films:
        for film in films:
            try:
                res = await refresh_film_metadata(
                    db, film["id"], include_bio=include_bio
                )
                film_results.append(res)
            except Exception as exc:
                film_results.append(
                    {"ok": False, "film_id": film.get("id"), "error": str(exc)}
                )
        # Reload meta after film refreshes
        db.refresh(row)
        meta = _load_meta(row)

    # Collection-level overview for franchise About
    collection_id = row.mwk_tmdb_collection_id
    collection_name = None
    if not collection_id:
        collection_id, collection_name = await search_collection_id(
            work_dir.name, api_key
        )
    if not collection_id:
        # From first film blob
        films_meta = meta.get("films") if isinstance(meta.get("films"), dict) else {}
        for blob in films_meta.values():
            if isinstance(blob, dict) and blob.get("collection_id"):
                collection_id = blob["collection_id"]
                collection_name = blob.get("collection_name")
                break

    writers: list[str] = list(meta.get("writers") or [])
    publishers: list[str] = list(meta.get("publishers") or [])
    genres: list = list(meta.get("genres") or [])
    first_date = None
    last_date = None
    cast = meta.get("cast") if isinstance(meta.get("cast"), dict) else {
        "characters": [],
        "staff": [],
        "animated": [],
        "people": [],
    }
    links = list(meta.get("links") or [])
    related = meta.get("related") if isinstance(meta.get("related"), dict) else {
        "creator": [],
        "similar": [],
    }
    posters: list[str] = list(meta.get("posters") or [])
    backdrops: list[str] = list(meta.get("backdrops") or [])
    is_animated = bool(meta.get("is_animated"))

    films_meta = meta.get("films") if isinstance(meta.get("films"), dict) else {}
    for blob in films_meta.values():
        if not isinstance(blob, dict):
            continue
        writers = _merge_unique(writers, blob.get("writers") or [])
        publishers = _merge_unique(publishers, blob.get("publishers") or [])
        seen_g = {str(g.get("id") or g.get("name")).casefold() for g in genres if isinstance(g, dict)}
        for g in blob.get("genres") or []:
            if not isinstance(g, dict):
                continue
            key = str(g.get("id") or g.get("name")).casefold()
            if key not in seen_g:
                genres.append(g)
                seen_g.add(key)
        rd = blob.get("release_date")
        if rd and (not first_date or rd < first_date):
            first_date = rd
        if rd and (not last_date or rd > last_date):
            last_date = rd
        if blob.get("is_animated"):
            is_animated = True
        # Prefer richest cast from first film with cast
        if not (cast.get("characters") or cast.get("staff")):
            cast = blob.get("cast") or cast
        if not links:
            links = list(blob.get("links") or [])
        related = _merge_related(related, blob.get("related") or {})
        for p in blob.get("posters") or []:
            if p and p not in posters:
                posters.append(p)
        for b in blob.get("backdrops") or []:
            if b and b not in backdrops:
                backdrops.append(b)

    if collection_id:
        try:
            coll = await fetch_collection(int(collection_id), api_key)
            overview = (coll.get("overview") or "").strip()
            if include_bio and overview and not meta.get("bio_manual"):
                meta["bio"] = overview
                row.mwk_bio = overview
            collection_name = coll.get("name") or collection_name
            row.mwk_tmdb_collection_id = int(collection_id)
            from app.services.tmdb import image_url

            if coll.get("poster_path"):
                pu = image_url(coll["poster_path"], "w780")
                if pu and pu not in posters:
                    posters.insert(0, pu)
            if coll.get("backdrop_path"):
                bu = image_url(coll["backdrop_path"], "w1280")
                if bu and bu not in backdrops:
                    backdrops.insert(0, bu)
        except Exception:
            pass

    from app.series_languages import LANGUAGE_CATALOG, origin_language_code

    origin_lang = origin_language_code(
        tmdb_original_language=None,
        country_iso=None,
    ) or "en"
    # Prefer language from first film
    for blob in films_meta.values():
        if isinstance(blob, dict) and blob.get("original_language"):
            origin_lang = blob["original_language"]
            break

    meta.update(
        {
            "writers": writers,
            "publishers": publishers,
            "genres": genres,
            "cast": cast,
            "links": _normalize_links(links),
            "related": related,
            "posters": posters[:12],
            "backdrops": backdrops[:12],
            "poster_url": posters[0] if posters else None,
            "backdrop_url": backdrops[0] if backdrops else None,
            "is_animated": is_animated,
            "status": meta.get("status") or "Released",
            "type": "Collection" if len(films) > 1 else "Movie",
            "activity_periods": (
                [{"start": first_date, "end": last_date}]
                if first_date or last_date
                else []
            ),
            "languages": [origin_lang] if origin_lang else [LANGUAGE_CATALOG[0]["code"]],
            "origin_language": origin_lang,
            "collection_id": collection_id,
            "collection_name": collection_name,
            "films": films_meta,
        }
    )
    if include_bio and not meta.get("bio") and not meta.get("bio_manual"):
        # Fall back to first film overview
        for blob in films_meta.values():
            if isinstance(blob, dict) and blob.get("overview"):
                meta["bio"] = blob["overview"]
                row.mwk_bio = blob["overview"]
                break

    artwork = ensure_artwork_cached(
        work_dir,
        root,
        posters=meta.get("posters") or [],
        backdrops=meta.get("backdrops") or [],
    )

    row.mwk_refreshed_at = _now()
    _save_meta(row, meta)
    db.commit()
    return {
        "ok": True,
        "work_slug": work_slug,
        "refreshed_at": row.mwk_refreshed_at,
        "collection_id": collection_id,
        "collection_name": collection_name,
        "films_refreshed": film_results,
        "artwork": artwork,
    }
