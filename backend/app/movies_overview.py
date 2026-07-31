"""Build SeriesOverview-shaped payloads for Movies works and films."""
from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.franchise_index import (
    build_franchise_index,
    load_franchise_index,
    normalize_franchise_slug,
    related_for_path,
    save_franchise_index,
    FRANCHISE_INDEX_VERSION,
)
from app.models import Country
from app.movies_index import (
    build_film_detail,
    build_work_detail,
    find_film_dir,
    find_work_dir,
)
from app.movies_refresh import ensure_movie_work, find_movie_work, _load_meta
from app.movies_universes import universe_for_work
from app.series_artwork import build_local_eras, ensure_artwork_cached
from app.series_overview import _enrich_cast_member, _enrich_related_cards
from app.series_paths import find_logo_file, gallery_sections


def _ensure_franchise_index(media_root: Path):
    cached = load_franchise_index()
    if (
        cached
        and cached.franchises
        and getattr(cached, "index_version", 0) == FRANCHISE_INDEX_VERSION
    ):
        return cached
    index = build_franchise_index(media_root)
    save_franchise_index(index)
    return index


def _group_links(links_raw: list) -> dict:
    by_cat: dict[str, list] = {
        "social": [],
        "streaming": [],
        "shopping": [],
        "downloads": [],
        "databases": [],
        "lyrics": [],
    }
    for link in links_raw or []:
        if not isinstance(link, dict) or not link.get("url"):
            continue
        item = dict(link)
        if not item.get("id"):
            item["id"] = f"lnk-{uuid.uuid4().hex[:10]}"
        cat = item.get("category") or "databases"
        if cat not in by_cat:
            cat = "databases"
        logo_url = item.get("logo_url") or "/assets/links/link.svg"
        by_cat[cat].append(
            {
                "id": item["id"],
                "label": item.get("label") or item["url"],
                "url": item["url"],
                "category": cat,
                "logo_url": logo_url,
                "logo_key": item.get("logo_key"),
            }
        )
    categories = [
        {"id": cid, "label": cid.upper(), "count": len(items)}
        for cid, items in by_cat.items()
        if items
    ]
    return {
        "entity_type": "movies",
        "entity_id": 0,
        "categories": categories,
        "groups": {c: by_cat[c] for c in by_cat if by_cat[c]},
        "total": sum(len(v) for v in by_cat.values()),
    }


def _activity_periods(meta: dict) -> list[dict]:
    periods = meta.get("activity_periods")
    if isinstance(periods, list) and periods:
        out = []
        for p in periods:
            if not isinstance(p, dict):
                continue
            start = p.get("start")
            end = p.get("end")
            label = p.get("label")
            if not label and start:
                sy = str(start)[:4]
                ey = str(end)[:4] if end else None
                label = f"{sy}–{ey}" if ey and ey != sy else sy
            out.append({"label": label or "", "start": start, "end": end})
        return out
    return []


def build_movies_gallery(rel_path: str, media_root: Path | None = None) -> dict:
    """Gallery for a Movies work/film folder (mirrors Series gallery_sections)."""
    root = Path(media_root or settings.media_root or "")
    if not root.is_dir():
        return {"folder_path": rel_path, "items": [], "sections": []}
    norm = (rel_path or "").replace("\\", "/").strip("/")
    folder = root / norm
    if not folder.is_dir():
        return {"folder_path": rel_path, "items": [], "sections": []}
    try:
        folder.relative_to(root / "Movies")
    except ValueError:
        return {"folder_path": rel_path, "items": [], "sections": []}
    sections = gallery_sections(folder, root)
    items: list[dict] = []
    for sec in sections:
        items.extend(sec.get("items") or [])
    return {
        "folder_path": folder.relative_to(root).as_posix(),
        "items": items,
        "sections": sections,
    }


def _country_payload(db: Session, meta: dict) -> dict | None:
    countries = meta.get("origin_countries") or []
    iso = None
    if countries:
        iso = str(countries[0]).lower()[:2]
    if not iso:
        return None
    crow = db.scalars(select(Country).where(Country.cou_iso == iso)).first()
    if crow:
        return {"id": crow.cou_id, "name": crow.cou_name, "iso": crow.cou_iso}
    return {"id": 0, "name": iso.upper(), "iso": iso}


def build_work_overview(
    db: Session,
    work_id: str,
    *,
    orientation: str = "portrait",
) -> dict | None:
    root = Path(settings.media_root or "")
    if not root.is_dir():
        return None
    detail = build_work_detail(work_id, root)
    if not detail:
        return None
    found = find_work_dir(work_id, root)
    if not found:
        return None
    work_dir, letter = found
    name = detail["name"]
    slug = detail.get("slug") or normalize_franchise_slug(name)
    folder_path = detail["folder_path"]

    row = find_movie_work(db, slug) or ensure_movie_work(
        db, work_slug=slug, name=name, folder_path=folder_path
    )
    db.commit()
    meta = _load_meta(row)

    from app.series_languages import (
        language_options_for_franchise,
        normalize_lang_code,
        origin_language_code,
    )

    origin_lang = (
        normalize_lang_code(meta.get("origin_language"))
        or origin_language_code(country_iso=None)
        or "en"
    )
    selected_langs = meta.get("languages")
    if not isinstance(selected_langs, list) or not selected_langs:
        selected_langs = [origin_lang]
    else:
        selected_langs = [normalize_lang_code(c) or c for c in selected_langs if c]

    cast_raw = meta.get("cast") if isinstance(meta.get("cast"), dict) else {}
    characters = [
        m for m in (cast_raw.get("characters") or cast_raw.get("animated") or []) if isinstance(m, dict)
    ]
    staff = [
        m for m in (cast_raw.get("staff") or cast_raw.get("people") or []) if isinstance(m, dict)
    ]
    cast = {
        "characters": [
            _enrich_cast_member(
                m,
                franchise_dir=work_dir,
                media_root=root,
                character_centered=True,
                default_language=origin_lang,
            )
            for m in characters
        ],
        "staff": [
            _enrich_cast_member(
                m,
                franchise_dir=work_dir,
                media_root=root,
                character_centered=False,
            )
            for m in staff
        ],
    }
    cast["animated"] = cast["characters"]
    cast["people"] = cast["staff"]

    posters = meta.get("posters") or []
    backdrops = meta.get("backdrops") or []
    if posters or backdrops or meta.get("poster_url") or meta.get("backdrop_url"):
        ensure_artwork_cached(
            work_dir,
            root,
            posters=posters or ([meta["poster_url"]] if meta.get("poster_url") else []),
            backdrops=backdrops
            or ([meta["backdrop_url"]] if meta.get("backdrop_url") else []),
        )
    local_eras = build_local_eras(work_dir, root)
    logo_url, icon_url = find_logo_file(work_dir, root)

    links_payload = _group_links(meta.get("links") or [])
    links_payload["entity_id"] = row.mwk_id or 0

    index = _ensure_franchise_index(root)
    related_disk = related_for_path(index, folder_path)
    related_tmdb = meta.get("related") if isinstance(meta.get("related"), dict) else {}
    creator = [
        r
        for r in (related_tmdb.get("creator") or [])
        if isinstance(r, dict) and not r.get("hidden")
    ]
    similar = [
        r
        for r in (related_tmdb.get("similar") or [])
        if isinstance(r, dict) and not r.get("hidden")
    ]

    gallery = build_movies_gallery(folder_path, root)
    has_gallery = bool(gallery.get("items")) or bool(local_eras)

    # Audio: [Audio] under work folder
    has_audio = False
    for audio_name in ("[Audio]", "Audio", "audio"):
        if (work_dir / audio_name).is_dir():
            try:
                if any((work_dir / audio_name).iterdir()):
                    has_audio = True
                    break
            except OSError:
                pass

    media_flags = {
        "has_audio": has_audio,
        "has_series": bool(related_disk.get("series")),
        "has_movies": bool(detail.get("films")),
        "has_library": bool(related_disk.get("books")),
        "has_games": bool(related_disk.get("games")),
        "has_gallery": has_gallery,
    }

    genres = [
        {"id": g.get("id") or i, "name": g.get("name") or str(g)}
        for i, g in enumerate(meta.get("genres") or [])
        if isinstance(g, dict) and (g.get("name") or g)
    ]
    writers = meta.get("writers") or []
    if isinstance(writers, str):
        writers = [w for w in writers.split(";") if w.strip()]
    publishers = meta.get("publishers") or []
    if isinstance(publishers, str):
        publishers = [p for p in publishers.split(";") if p.strip()]

    bio = row.mwk_bio or meta.get("bio")
    # Prefer universe overview when work bio empty
    universe = universe_for_work(db, slug)
    if not bio and universe and universe.get("overview"):
        bio = universe["overview"]

    films = detail.get("films") or []
    # Map films → subseries-shaped for SeriesAbout filmography grid reuse
    subseries = [
        {
            "id": f["id"],
            "title": f.get("title"),
            "date_iso": f.get("date_iso"),
            "display_date": f.get("display_date"),
            "cover_url": f.get("cover_url"),
            "logo_url": f.get("logo_url"),
            "icon_url": f.get("icon_url"),
            "badge_url": f.get("badge_url"),
            "folder_path": f.get("folder_path"),
            "season_count": f.get("version_count") or 0,
        }
        for f in films
    ]

    language_options = language_options_for_franchise(
        selected_langs, origin_code=origin_lang
    )

    return {
        "id": detail["id"],
        "mwk_id": row.mwk_id,
        "ser_id": row.mwk_id,
        "name": name,
        "letter": letter,
        "slug": slug,
        "folder_path": folder_path,
        "cover_url": detail.get("cover_url"),
        "bio": bio,
        "bio_manual": bool(meta.get("bio_manual")),
        "writers": writers,
        "aliases": meta.get("aliases") or [],
        "city": None,
        "country": _country_payload(db, meta),
        "languages": selected_langs,
        "origin_language": origin_lang,
        "language_options": language_options,
        "cast_languages": language_options,
        "activity_periods": _activity_periods(meta),
        "genres": genres,
        "publishers": publishers,
        "status": meta.get("status"),
        "type": meta.get("type") or "Collection",
        "is_animated": bool(meta.get("is_animated")),
        "tmdb_id": str(row.mwk_tmdb_collection_id or row.mwk_tmdb_movie_id or "")
        or None,
        "eras": local_eras,
        "logo_url": logo_url or detail.get("logo_url"),
        "icon_url": icon_url or detail.get("icon_url"),
        "cast": cast,
        "media": media_flags,
        "links": links_payload,
        "related": {
            "movies": _enrich_related_cards(related_disk.get("movies") or [], root),
            "series": _enrich_related_cards(related_disk.get("series") or [], root),
            "books": _enrich_related_cards(related_disk.get("books") or [], root),
            "games": _enrich_related_cards(related_disk.get("games") or [], root),
            "music": related_disk.get("music") or [],
            "creator": creator,
            "similar": similar,
            "creator_count": len(creator),
            "similar_count": len(similar),
        },
        "subseries": subseries,
        "films": films,
        "seasons": [],
        "universe": universe,
        "metadata_refreshed_at": row.mwk_refreshed_at,
        "needs_metadata": not bool(row.mwk_refreshed_at),
        "orientation": orientation,
        "is_standalone": detail.get("is_standalone"),
        "primary_film_id": detail.get("primary_film_id"),
        "film_count": detail.get("film_count") or len(films),
        "kind": "franchise",
    }


def build_film_overview(
    db: Session,
    film_id: str,
    *,
    orientation: str = "portrait",
) -> dict | None:
    root = Path(settings.media_root or "")
    if not root.is_dir():
        return None
    detail = build_film_detail(film_id, root)
    if not detail:
        return None
    found = find_film_dir(film_id, root)
    if not found:
        return None
    film_dir, work_dir, letter = found
    work = detail.get("work") or {}
    work_slug = work.get("id") or normalize_franchise_slug(work_dir.name)
    fid = detail["id"]

    row = find_movie_work(db, work_slug) or ensure_movie_work(
        db,
        work_slug=work_slug,
        name=work_dir.name,
        folder_path=work.get("folder_path"),
    )
    db.commit()
    meta = _load_meta(row)
    films_meta = meta.get("films") if isinstance(meta.get("films"), dict) else {}
    film_meta = films_meta.get(fid) if isinstance(films_meta.get(fid), dict) else {}

    from app.series_languages import (
        language_options_for_franchise,
        normalize_lang_code,
        origin_language_code,
    )

    origin_lang = (
        normalize_lang_code(film_meta.get("original_language"))
        or origin_language_code(country_iso=None)
        or "en"
    )
    selected_langs = [origin_lang]
    language_options = language_options_for_franchise(
        selected_langs, origin_code=origin_lang
    )

    cast_raw = film_meta.get("cast") if isinstance(film_meta.get("cast"), dict) else {}
    characters = [
        m
        for m in (cast_raw.get("characters") or cast_raw.get("animated") or [])
        if isinstance(m, dict)
    ]
    staff = [
        m
        for m in (cast_raw.get("staff") or cast_raw.get("people") or [])
        if isinstance(m, dict)
    ]
    cast = {
        "characters": [
            _enrich_cast_member(
                m,
                franchise_dir=film_dir,
                media_root=root,
                character_centered=True,
                default_language=origin_lang,
            )
            for m in characters
        ],
        "staff": [
            _enrich_cast_member(
                m,
                franchise_dir=film_dir,
                media_root=root,
                character_centered=False,
            )
            for m in staff
        ],
    }
    cast["animated"] = cast["characters"]
    cast["people"] = cast["staff"]

    posters = film_meta.get("posters") or []
    backdrops = film_meta.get("backdrops") or []
    if posters or backdrops:
        ensure_artwork_cached(
            film_dir,
            root,
            posters=posters,
            backdrops=backdrops,
        )
    local_eras = build_local_eras(film_dir, root)
    logo_url, icon_url = find_logo_file(film_dir, root)

    links_payload = _group_links(film_meta.get("links") or [])
    related_tmdb = (
        film_meta.get("related")
        if isinstance(film_meta.get("related"), dict)
        else {}
    )
    creator = [
        r
        for r in (related_tmdb.get("creator") or [])
        if isinstance(r, dict) and not r.get("hidden")
    ]
    similar = [
        r
        for r in (related_tmdb.get("similar") or [])
        if isinstance(r, dict) and not r.get("hidden")
    ]

    folder_path = detail["folder_path"]
    gallery = build_movies_gallery(folder_path, root)
    index = _ensure_franchise_index(root)
    related_disk = related_for_path(index, work.get("folder_path") or folder_path)

    genres = [
        {"id": g.get("id") or i, "name": g.get("name") or str(g)}
        for i, g in enumerate(film_meta.get("genres") or [])
        if isinstance(g, dict) and (g.get("name") or g)
    ]
    writers = film_meta.get("writers") or []
    publishers = film_meta.get("publishers") or []
    rd = film_meta.get("release_date") or detail.get("date_iso")
    periods = (
        [{"label": str(rd)[:4], "start": rd, "end": rd}] if rd else []
    )

    universe = universe_for_work(db, work_slug)

    return {
        "id": fid,
        "mwk_id": row.mwk_id,
        "ser_id": row.mwk_id,
        "name": detail.get("title") or film_dir.name,
        "letter": letter,
        "slug": work_slug,
        "folder_path": folder_path,
        "cover_url": detail.get("cover_url"),
        "bio": film_meta.get("overview") or row.mwk_bio,
        "bio_manual": False,
        "writers": writers,
        "aliases": film_meta.get("aliases") or [],
        "city": None,
        "country": _country_payload(db, film_meta),
        "languages": selected_langs,
        "origin_language": origin_lang,
        "language_options": language_options,
        "cast_languages": language_options,
        "activity_periods": periods,
        "genres": genres,
        "publishers": publishers,
        "status": film_meta.get("status"),
        "type": film_meta.get("type") or "Movie",
        "is_animated": bool(film_meta.get("is_animated")),
        "tmdb_id": str(film_meta.get("tmdb_id") or "") or None,
        "eras": local_eras,
        "logo_url": logo_url or detail.get("logo_url"),
        "icon_url": icon_url or detail.get("icon_url"),
        "cast": cast,
        "media": {
            "has_audio": False,
            "has_series": bool(related_disk.get("series")),
            "has_movies": False,
            "has_library": bool(related_disk.get("books")),
            "has_games": bool(related_disk.get("games")),
            "has_gallery": bool(gallery.get("items")) or bool(local_eras),
        },
        "links": links_payload,
        "related": {
            "movies": [],
            "series": _enrich_related_cards(related_disk.get("series") or [], root),
            "books": _enrich_related_cards(related_disk.get("books") or [], root),
            "games": _enrich_related_cards(related_disk.get("games") or [], root),
            "music": [],
            "creator": creator,
            "similar": similar,
            "creator_count": len(creator),
            "similar_count": len(similar),
        },
        "subseries": [],
        "seasons": [],
        "versions": detail.get("versions") or [],
        "work": work,
        "universe": universe,
        "metadata_refreshed_at": film_meta.get("refreshed_at") or row.mwk_refreshed_at,
        "needs_metadata": not bool(film_meta.get("tmdb_id")),
        "orientation": orientation,
        "kind": "film",
        "date_iso": detail.get("date_iso"),
        "display_date": detail.get("display_date"),
        "banner_url": detail.get("banner_url"),
        "has_video": detail.get("has_video"),
        "directors": film_meta.get("directors") or [],
    }
