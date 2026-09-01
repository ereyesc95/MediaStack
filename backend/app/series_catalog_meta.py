"""Enrich Series catalog cards with DB metadata for catalog filters."""
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Country, Genre, Series, Subgenre
from app.series_refresh import find_series_row


def _split_semi(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [p.strip() for p in raw.replace(",", ";").split(";") if p.strip()]


def _genre_lookups(db: Session) -> tuple[dict[int, Subgenre], dict[str, Subgenre], dict[int, str]]:
    sub_by_id: dict[int, Subgenre] = {
        s.sgn_id: s for s in db.scalars(select(Subgenre)).all() if s.sgn_id
    }
    sub_by_name: dict[str, Subgenre] = {}
    for s in sub_by_id.values():
        key = (s.sgn_name or "").strip().casefold()
        if key and key not in sub_by_name:
            sub_by_name[key] = s
    parent_by_id: dict[int, str] = {
        g.gen_id: (g.gen_name or "").strip()
        for g in db.scalars(select(Genre)).all()
        if g.gen_id and g.gen_name
    }
    return sub_by_id, sub_by_name, parent_by_id


def _resolve_genre_lists(
    raw: list | None,
    *,
    sub_by_id: dict[int, Subgenre],
    sub_by_name: dict[str, Subgenre],
    parent_by_id: dict[int, str],
) -> tuple[list, list[str], list[str]]:
    """Return (genre_ids, genre_names, parent_genre_names) from [{id,name}, ...]."""
    genre_ids: list = []
    genre_names: list[str] = []
    parent_names: set[str] = set()
    if not isinstance(raw, list):
        return genre_ids, genre_names, sorted(parent_names)
    for g in raw:
        if isinstance(g, str):
            name_g = g.strip()
            gid_i = None
        elif isinstance(g, dict):
            name_g = (g.get("name") or "").strip()
            gid = g.get("id")
            gid_i = None
            if gid is not None:
                try:
                    gid_i = int(gid)
                except (TypeError, ValueError):
                    gid_i = None
        else:
            continue
        if name_g:
            genre_names.append(name_g)
        if gid_i is not None:
            genre_ids.append(gid_i)
        sub = sub_by_id.get(gid_i) if gid_i is not None else None
        if not sub and name_g:
            sub = sub_by_name.get(name_g.casefold())
        if sub and sub.sgn_genre_id:
            pname = parent_by_id.get(int(sub.sgn_genre_id))
            if pname:
                parent_names.add(pname)
    return genre_ids, genre_names, sorted(parent_names)


def _load_images_subseries(row: Series | None) -> dict[str, dict]:
    if not row:
        return {}
    try:
        images = json.loads(row.ser_images_json or "{}")
    except (json.JSONDecodeError, TypeError):
        return {}
    if not isinstance(images, dict):
        return {}
    raw = images.get("subseries")
    if not isinstance(raw, dict):
        return {}
    out: dict[str, dict] = {}
    for sid, entry in raw.items():
        if isinstance(entry, dict):
            out[str(sid)] = entry
    return out


def enrich_catalog_metadata(db: Session, catalog: dict) -> dict:
    """Attach country/genre/publisher/writer fields from Series rows onto franchise cards.

    Also attaches genre_names / parent_genre_names onto each franchise's subseries
    cards from ``ser_images_json.subseries`` meta (same source as overview).
    """
    franchises = catalog.get("franchises") or []
    if not franchises:
        return catalog

    # Preload countries by ISO for id/continent lookup
    iso_to_country: dict[str, Country] = {}
    for c in db.scalars(select(Country)).all():
        iso = (c.cou_iso or "").strip().lower()
        if iso:
            iso_to_country[iso] = c

    sub_by_id, sub_by_name, parent_by_id = _genre_lookups(db)

    for card in franchises:
        if not isinstance(card, dict):
            continue
        name = card.get("name") or ""
        row = find_series_row(db, name) if name else None
        if not row:
            card.setdefault("country_iso", None)
            card.setdefault("country_id", None)
            card.setdefault("continent_id", None)
            card.setdefault("genre_ids", [])
            card.setdefault("genre_names", [])
            card.setdefault("parent_genre_names", [])
            card.setdefault("publishers", [])
            card.setdefault("writers", [])
            for sub in card.get("subseries") or []:
                if isinstance(sub, dict):
                    sub.setdefault("genre_ids", [])
                    sub.setdefault("genre_names", [])
                    sub.setdefault("parent_genre_names", [])
            continue

        iso = (row.ser_country_iso or "").strip().lower() or None
        crow = iso_to_country.get(iso) if iso else None
        card["country_iso"] = iso
        card["country_id"] = crow.cou_id if crow else None
        card["continent_id"] = getattr(crow, "cou_continent_id", None) if crow else None

        try:
            raw = json.loads(row.ser_genres_json or "[]")
        except (json.JSONDecodeError, TypeError):
            raw = []
        genre_ids, genre_names, parent_names = _resolve_genre_lists(
            raw if isinstance(raw, list) else [],
            sub_by_id=sub_by_id,
            sub_by_name=sub_by_name,
            parent_by_id=parent_by_id,
        )
        card["genre_ids"] = genre_ids
        card["genre_names"] = genre_names
        card["parent_genre_names"] = parent_names
        card["publishers"] = _split_semi(row.ser_publishers)
        card["writers"] = _split_semi(row.ser_writers)

        # Per-subseries genres from images.subseries meta
        subs_meta = _load_images_subseries(row)
        for sub in card.get("subseries") or []:
            if not isinstance(sub, dict):
                continue
            sid = str(sub.get("id") or "")
            entry = subs_meta.get(sid) if sid else None
            if entry is None and sid:
                # Title / folder-name fallback
                title = (sub.get("title") or "").strip().casefold()
                for key, ent in subs_meta.items():
                    if key.casefold() == sid.casefold() or (
                        title and key.casefold() == title
                    ):
                        entry = ent
                        break
            raw_g = entry.get("genres") if isinstance(entry, dict) else None
            if isinstance(raw_g, list) and raw_g:
                s_ids, s_names, s_parents = _resolve_genre_lists(
                    raw_g,
                    sub_by_id=sub_by_id,
                    sub_by_name=sub_by_name,
                    parent_by_id=parent_by_id,
                )
                sub["genre_ids"] = s_ids
                sub["genre_names"] = s_names
                sub["parent_genre_names"] = s_parents
            else:
                sub.setdefault("genre_ids", [])
                sub.setdefault("genre_names", [])
                sub.setdefault("parent_genre_names", [])

    return catalog


def filter_franchise_subseries_lists(
    franchises: list[dict],
    *,
    nsfw_unlocked: bool,
    extra_adult_subgenres: set[str] | frozenset[str] | None = None,
) -> list[dict]:
    """Drop adult subseries cards from each franchise (in place + return list)."""
    from app.adult_content import filter_adult_cards

    if nsfw_unlocked or not franchises:
        return franchises
    for card in franchises:
        if not isinstance(card, dict):
            continue
        subs = card.get("subseries")
        if not isinstance(subs, list) or not subs:
            continue
        filtered = filter_adult_cards(
            [s for s in subs if isinstance(s, dict)],
            nsfw_unlocked=False,
            extra_adult_subgenres=extra_adult_subgenres,
        )
        card["subseries"] = filtered
        if "subseries_count" in card and not card.get("is_standalone"):
            card["subseries_count"] = len(filtered)
    return franchises


def _strip_adult_genre_dicts(
    entries: list | None,
    *,
    extra_adult_subgenres: set[str] | frozenset[str] | None = None,
) -> list:
    from app.adult_content import (
        is_adult_parent_genre_name,
        is_adult_subgenre_name,
    )

    if not entries:
        return []
    extra = {
        (x or "").strip().casefold()
        for x in (extra_adult_subgenres or ())
        if isinstance(x, str)
    }
    out: list = []
    for g in entries:
        if isinstance(g, str):
            name = g.strip()
            payload = g
        elif isinstance(g, dict):
            name = str(g.get("name") or "").strip()
            payload = g
        else:
            continue
        nn = name.casefold()
        if (
            is_adult_subgenre_name(name)
            or is_adult_parent_genre_name(name)
            or (nn and nn in extra)
        ):
            continue
        out.append(payload)
    return out


def apply_nsfw_filter_to_series_overview(
    db: Session, data: dict, *, nsfw_unlocked: bool
) -> dict:
    """Filter overview subseries / genres / related movies when NSFW is locked."""
    from app.adult_content import (
        adult_subgenre_names_from_db,
        filter_adult_cards,
        filter_adult_related_cards,
        is_adult_parent_genre_name,
        is_adult_subgenre_name,
    )

    if nsfw_unlocked or not isinstance(data, dict):
        return data

    extra = adult_subgenre_names_from_db(db)
    meta = data.get("subseries_meta") if isinstance(data.get("subseries_meta"), dict) else {}
    sub_by_id, sub_by_name, parent_by_id = _genre_lookups(db)

    # Enrich + filter subseries cards using per-leaf meta genres
    raw_subs = data.get("subseries") or []
    enriched: list[dict] = []
    for s in raw_subs:
        if not isinstance(s, dict):
            continue
        row = dict(s)
        sid = str(s.get("id") or "")
        sm = meta.get(sid) if sid else None
        if sm is None and sid:
            for key, ent in meta.items():
                if str(key).casefold() == sid.casefold():
                    sm = ent
                    break
        g_list = sm.get("genres") if isinstance(sm, dict) else None
        if isinstance(g_list, list) and g_list:
            _ids, names, parents = _resolve_genre_lists(
                g_list,
                sub_by_id=sub_by_id,
                sub_by_name=sub_by_name,
                parent_by_id=parent_by_id,
            )
            row["genre_ids"] = _ids
            row["genre_names"] = names
            row["parent_genre_names"] = parents
        enriched.append(row)

    kept = filter_adult_cards(
        enriched, nsfw_unlocked=False, extra_adult_subgenres=extra
    )
    data["subseries"] = kept

    # Strip adult genres from franchise + leaf About payloads
    if isinstance(data.get("genres"), list):
        data["genres"] = _strip_adult_genre_dicts(
            data["genres"], extra_adult_subgenres=extra
        )
    parents = data.get("parent_genre_names")
    if isinstance(parents, list):
        data["parent_genre_names"] = [
            p
            for p in parents
            if isinstance(p, str)
            and not is_adult_parent_genre_name(p)
            and not is_adult_subgenre_name(p)
        ]
    if isinstance(meta, dict):
        for sid, sm in list(meta.items()):
            if not isinstance(sm, dict):
                continue
            if isinstance(sm.get("genres"), list):
                sm = dict(sm)
                sm["genres"] = _strip_adult_genre_dicts(
                    sm["genres"], extra_adult_subgenres=extra
                )
                meta[sid] = sm
        data["subseries_meta"] = meta

    related = data.get("related")
    if isinstance(related, dict):
        movies = related.get("movies")
        if isinstance(movies, list) and movies:
            related["movies"] = filter_adult_related_cards(
                db, movies, nsfw_unlocked=False, module="movies"
            )

    return data
