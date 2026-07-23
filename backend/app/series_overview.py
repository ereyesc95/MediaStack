"""Build Series franchise overview payload (disk + TMDb-enriched DB)."""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.franchise_index import (
    build_franchise_index,
    load_franchise_index,
    normalize_franchise_slug,
    related_for_path,
    save_franchise_index,
)
from app.gallery import IMAGE_EXTS, _media_url
from app.media_index import format_display_date
from app.media_tabs_index import _folder_cover
from app.models import Band, Country, Series
from app.series_artwork import (
    build_local_eras,
    ensure_artwork_cached,
    find_character_photo,
    find_person_photo,
)
from app.series_index import (
    build_franchise_detail,
    build_series_gallery,
    find_franchise_dir,
)
from app.series_refresh import ensure_series_row, find_series_row


def _parse_json(raw: str | None, default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return default


def _split_semi(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [p.strip() for p in raw.replace("■", ",").split(";") if p.strip()]



def _activity_periods(
    start: str | None,
    end: str | None,
    status: str | None,
    images: dict | None = None,
) -> list[dict]:
    stored = (images or {}).get("activity_periods") if images else None
    if isinstance(stored, list) and stored:
        out = []
        for p in stored:
            if not isinstance(p, dict):
                continue
            s, e = p.get("start"), p.get("end")

            def year(iso: str | None) -> str | None:
                if not iso:
                    return None
                return iso[:4] if len(iso) >= 4 else iso

            ys, ye = year(s), year(e)
            if ys and ye and ys != ye:
                label = f"{ys}–{ye}"
            elif ys and not ye:
                label = f"{ys}–present"
            else:
                label = ys or ye or ""
            if label:
                out.append({"label": label, "start": s, "end": e})
        if out:
            return out

    def year(iso: str | None) -> str | None:
        if not iso:
            return None
        return iso[:4] if len(iso) >= 4 else iso

    ys, ye = year(start), year(end)
    if not ys and not ye:
        if status:
            return [{"label": status, "start": None, "end": None}]
        return []
    if ys and ye and ys != ye:
        label = f"{ys}–{ye}"
    elif ys and (status or "").casefold() in {"returning series", "in production"}:
        label = f"{ys}–present"
    elif ys:
        label = ys if not ye else f"{ys}–{ye}"
    else:
        label = ye or ""
    periods = [{"label": label, "start": start, "end": end}]
    if status and status.casefold() not in {label.casefold()}:
        periods.append({"label": status, "start": None, "end": None})
    return periods


def _list_brand_assets(franchise_dir: Path, media_root: Path) -> tuple[str | None, str | None]:
    logo_url = None
    icon_url = None
    for sub in ("Gallery/Logos", "[Artwork]", "Artwork"):
        d = franchise_dir / sub
        if not d.is_dir():
            continue
        try:
            files = list(d.iterdir())
        except OSError:
            continue
        for f in files:
            if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
                continue
            low = f.stem.casefold()
            url = _media_url(f, media_root)
            if not url:
                continue
            if "icon" in low and not icon_url:
                icon_url = url
            if "logo" in low and "collapsed" not in low and not logo_url:
                logo_url = url
    return logo_url, icon_url


def _enrich_cast_member(
    m: dict,
    *,
    franchise_dir: Path,
    media_root: Path,
    character_centered: bool = True,
) -> dict:
    name = m.get("name") or ""
    character = m.get("character") or (name if character_centered else None)
    tid = m.get("id") if isinstance(m.get("id"), int) else None
    actors = m.get("actors") if isinstance(m.get("actors"), list) else []
    actor_photo = m.get("actor_photo_url") or m.get("character_photo_url")
    if not actor_photo and actors:
        actor_photo = (actors[0] or {}).get("photo_url")

    if character_centered:
        char_local = find_character_photo(
            character or name,
            franchise_dir=franchise_dir,
            media_root=media_root,
            actor_name=name,
        )
        # Actor local photo (first actor name)
        actor_name = (actors[0] or {}).get("name") if actors else None
        actor_local = None
        if actor_name:
            actor_local = find_person_photo(
                actor_name, franchise_dir=franchise_dir, media_root=media_root
            )
        photo = char_local or m.get("photo_url")
        # Don't keep actor shot as the character front
        if photo and actor_photo and photo == actor_photo and not char_local:
            photo = None
        return {
            **m,
            "name": character or name,
            "character": character or name,
            "photo_url": photo,
            "actor_photo_url": actor_local or actor_photo,
            "character_photo_url": actor_local or actor_photo,
            "actors": actors,
            "roles": m.get("roles")
            or [a.get("name") for a in actors if a.get("name")],
            "tmdb_photo_url": actor_photo,
        }

    local = find_person_photo(
        name, franchise_dir=franchise_dir, media_root=media_root, tmdb_id=tid
    )
    return {
        **m,
        "photo_url": local or m.get("photo_url"),
        "character_photo_url": m.get("character_photo_url"),
        "actor_photo_url": m.get("actor_photo_url"),
        "tmdb_photo_url": m.get("photo_url"),
    }


def _ensure_franchise_index(media_root: Path):
    cached = load_franchise_index()
    if cached and cached.franchises:
        return cached
    index = build_franchise_index(media_root)
    save_franchise_index(index)
    return index


def _enrich_related_cards(
    entries: list[dict], media_root: Path
) -> list[dict]:
    out = []
    for e in entries:
        path = e.get("path") or ""
        folder = media_root / path.replace("\\", "/")
        cover = _folder_cover(folder, media_root) if folder.is_dir() else None
        out.append(
            {
                **e,
                "cover_url": cover,
                "display_date": format_display_date(e.get("date_iso")),
            }
        )
    return out


def _find_music_band(db: Session, franchise_name: str) -> Band | None:
    want = normalize_franchise_slug(franchise_name)
    for band in db.scalars(select(Band)).all():
        name = band.bnd_name or ""
        if normalize_franchise_slug(name) == want:
            return band
    return None


def build_series_overview(
    db: Session,
    franchise_id: str,
    *,
    orientation: str = "portrait",
) -> dict | None:
    root = Path(settings.media_root) if settings.media_root else None
    if not root or not root.is_dir():
        return None
    found = find_franchise_dir(franchise_id, root)
    if not found:
        return None
    franchise_dir, letter = found
    detail = build_franchise_detail(franchise_id, root)
    if not detail:
        return None

    name = detail["name"]
    folder_path = detail["folder_path"]
    row = find_series_row(db, name) or ensure_series_row(db, name)

    genres_raw = _parse_json(row.ser_genres_json, [])
    genres = [
        {"id": g.get("id") or i, "name": g.get("name") or str(g)}
        for i, g in enumerate(genres_raw)
        if (g.get("name") if isinstance(g, dict) else g)
    ]

    cast_raw = _parse_json(row.ser_cast_json, {})
    if not isinstance(cast_raw, dict):
        cast_raw = {}
    characters = cast_raw.get("characters") or cast_raw.get("animated") or []
    staff = cast_raw.get("staff") or cast_raw.get("people") or []
    # Main cast / staff only — avoids overlapping lineup photos
    characters = [m for m in characters if isinstance(m, dict)][:8]
    staff = [m for m in staff if isinstance(m, dict)][:8]
    cast = {
        "characters": [
            _enrich_cast_member(
                m, franchise_dir=franchise_dir, media_root=root, character_centered=True
            )
            for m in characters
        ],
        "staff": [
            _enrich_cast_member(
                m, franchise_dir=franchise_dir, media_root=root, character_centered=False
            )
            for m in staff
        ],
        # legacy aliases for older clients
        "animated": [],
        "people": [],
    }
    cast["animated"] = cast["characters"]
    cast["people"] = cast["staff"]

    links_raw = _parse_json(row.ser_links_json, [])
    # Shape like EntityLinksPayload categories
    by_cat: dict[str, list] = {
        "social": [],
        "streaming": [],
        "shopping": [],
        "downloads": [],
        "databases": [],
        "lyrics": [],
    }
    links_changed = False

    for link in links_raw:
        if not isinstance(link, dict) or not link.get("url"):
            continue
        if not link.get("id"):
            link["id"] = f"lnk-{uuid.uuid4().hex[:10]}"
            links_changed = True
        cat = link.get("category") or "databases"
        if cat not in by_cat:
            cat = "databases"
        logo_key = link.get("logo_key")
        logo_url = link.get("logo_url")
        if logo_key and not logo_url:
            logo_url = f"/assets/links/{logo_key}.svg"
        if not logo_url:
            logo_url = "/assets/links/link.svg"
        by_cat[cat].append(
            {
                "id": link["id"],
                "label": link.get("label") or link["url"],
                "url": link["url"],
                "logo_url": logo_url,
                "logo_key": logo_key,
                "category": cat,
            }
        )
    if links_changed:
        row.ser_links_json = json.dumps(links_raw, ensure_ascii=False)
        db.commit()
    categories = [
        {"id": cid, "label": cid.upper(), "count": len(items)}
        for cid, items in by_cat.items()
        if items
    ]
    links_payload = {
        "entity_type": "series",
        "entity_id": row.ser_id or 0,
        "categories": categories,
        "groups": {c: by_cat[c] for c in by_cat if by_cat[c]},
        "total": sum(len(v) for v in by_cat.values()),
    }

    images = _parse_json(row.ser_images_json, {})
    posters = images.get("posters") or []
    backdrops = images.get("backdrops") or []
    # Ensure local [Artwork] has Portrait/Landscape files (download TMDb if missing)
    if posters or backdrops or row.ser_poster_url or row.ser_backdrop_url:
        ensure_artwork_cached(
            franchise_dir,
            root,
            posters=posters
            or ([row.ser_poster_url] if row.ser_poster_url else []),
            backdrops=backdrops
            or ([row.ser_backdrop_url] if row.ser_backdrop_url else []),
        )
    local_eras = build_local_eras(franchise_dir, root)

    logo_url, icon_url = _list_brand_assets(franchise_dir, root)
    if local_eras and (logo_url or icon_url):
        local_eras[0] = {
            **local_eras[0],
            "logo_url": logo_url or local_eras[0].get("logo_url"),
            "icon_url": icon_url or local_eras[0].get("icon_url"),
        }

    country = None
    if row.ser_country_iso:
        iso = row.ser_country_iso.lower()
        crow = db.scalars(
            select(Country).where(Country.cou_iso == iso)
        ).first()
        if crow:
            country = {
                "id": crow.cou_id,
                "name": crow.cou_name,
                "iso": crow.cou_iso,
            }
        else:
            country = {"id": 0, "name": iso.upper(), "iso": iso}

    index = _ensure_franchise_index(root)
    related = related_for_path(index, folder_path)
    # Exclude this franchise hub from series bucket for related tab
    related_series = [
        e
        for e in related.get("series", [])
        if (e.get("path") or "").casefold().rstrip("/")
        != folder_path.casefold().rstrip("/")
    ]

    music_band = _find_music_band(db, name)
    gallery = build_series_gallery(folder_path, root)
    has_gallery = bool(gallery.get("items"))

    media_flags = {
        "has_audio": music_band is not None,
        "has_series": bool(detail.get("subseries") or detail.get("seasons")),
        "has_movies": bool(related.get("movies")),
        "has_library": bool(related.get("books")),
        "has_games": bool(related.get("games")),
        "has_gallery": has_gallery or bool(local_eras),
    }

    subseries_cards = [
        {
            "id": s["id"],
            "title": s["title"],
            "date_iso": s.get("date_iso"),
            "display_date": s.get("display_date"),
            "cover_url": s.get("cover_url") or detail.get("cover_url"),
            "folder_path": s.get("folder_path"),
            "season_count": s.get("season_count") or 0,
        }
        for s in (detail.get("subseries") or [])
    ]

    return {
        "id": detail["id"],
        "ser_id": row.ser_id,
        "name": name,
        "letter": letter,
        "slug": detail.get("slug"),
        "folder_path": folder_path,
        "cover_url": detail.get("cover_url") or row.ser_poster_url,
        "bio": row.ser_bio,
        "bio_manual": bool(row.ser_bio_manual),
        "writers": _split_semi(row.ser_writers),
        "aliases": _split_semi(row.ser_other_names),
        "city": row.ser_origin_place,
        "country": country,
        "activity_periods": _activity_periods(
            row.ser_starting_date,
            row.ser_ending_date,
            row.ser_status,
            images if isinstance(images, dict) else None,
        ),
        "genres": genres,
        "publishers": _split_semi(row.ser_publishers),
        "status": row.ser_status,
        "type": row.ser_type,
        "is_animated": bool(row.ser_is_animated),
        "tmdb_id": row.ser_code,
        "eras": local_eras,
        "logo_url": logo_url,
        "icon_url": icon_url,
        "cast": cast,
        "links": links_payload,
        "subseries": subseries_cards,
        "seasons": detail.get("seasons") or [],
        "media": media_flags,
        "music_band_id": music_band.bnd_id if music_band else None,
        "related": {
            "movies": _enrich_related_cards(related.get("movies") or [], root),
            "series": _enrich_related_cards(related_series, root),
            "books": _enrich_related_cards(related.get("books") or [], root),
            "games": _enrich_related_cards(related.get("games") or [], root),
            "music": related.get("music") or [],
            "creator": (images.get("related") or {}).get("creator") or [],
            "similar": (images.get("related") or {}).get("similar") or [],
            "creator_count": len((images.get("related") or {}).get("creator") or []),
            "similar_count": len((images.get("related") or {}).get("similar") or []),
        },
        "metadata_refreshed_at": row.ser_metadata_refreshed_at,
        "needs_metadata": not bool(row.ser_metadata_refreshed_at),
    }
