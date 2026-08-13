"""Enrich Movies catalog cards with DB metadata for catalog filters."""
from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Country, Genre, MovieWork, Subgenre
from app.play_stats import subgenre_image_url

MOVIES_MEDIA_TYPE = 300

# TMDb parent-genre aliases → taxonomy names (movie media type 300)
_TMDB_NAME_ALIASES: dict[str, str] = {
    "science fiction": "sci-fi",
    "sci fi": "sci-fi",
    "tv movie": "drama",
    # No bare "Adventure" movie subgenre — map TMDb Adventure → Action-Adventure
    "adventure": "action-adventure",
}


def _load_meta(row: MovieWork) -> dict:
    try:
        raw = json.loads(row.mwk_metadata_json or "{}")
    except (json.JSONDecodeError, TypeError):
        return {}
    return raw if isinstance(raw, dict) else {}


def _iter_meta_blobs(meta: dict) -> list[dict]:
    blobs: list[dict] = [meta]
    films = meta.get("films")
    if isinstance(films, dict):
        blobs.extend(b for b in films.values() if isinstance(b, dict))
    return blobs


def build_movie_subgenre_index(db: Session) -> dict[str, dict]:
    """Map casefolded subgenre name → {id, name, genre_id, genre_name} for mt 300."""
    parents = {
        g.gen_id: (g.gen_name or "").strip()
        for g in db.scalars(
            select(Genre).where(Genre.gen_media_type_id == MOVIES_MEDIA_TYPE)
        ).all()
        if g.gen_name
    }
    by_name: dict[str, dict] = {}
    for s in db.scalars(
        select(Subgenre).where(Subgenre.sgn_media_type_id == MOVIES_MEDIA_TYPE)
    ).all():
        name = (s.sgn_name or "").strip()
        if not name:
            continue
        key = name.casefold()
        # Prefer exact same-name-as-parent entries when duplicates exist
        parent_name = parents.get(s.sgn_genre_id or 0) or ""
        entry = {
            "id": s.sgn_id,
            "name": name,
            "genre_id": s.sgn_genre_id,
            "genre_name": parent_name or "Other",
        }
        existing = by_name.get(key)
        if not existing:
            by_name[key] = entry
        elif parent_name.casefold() == key:
            by_name[key] = entry
    return by_name


def resolve_movie_subgenre(
    name: str,
    by_name: dict[str, dict],
    parents_by_name: dict[str, int] | None = None,
) -> dict | None:
    """Resolve a TMDb/genre label to a movie Subgenre row."""
    raw = (name or "").strip()
    if not raw:
        return None
    key = _TMDB_NAME_ALIASES.get(raw.casefold(), raw.casefold())
    hit = by_name.get(key)
    if hit:
        return hit
    # Compound labels: "Action & Adventure" → first matching part
    for part in re.split(r"\s*[&/|,]\s*", raw):
        part_key = _TMDB_NAME_ALIASES.get(part.strip().casefold(), part.strip().casefold())
        hit = by_name.get(part_key)
        if hit:
            return hit
    # Fall back: first subgenre under a matching parent genre
    if parents_by_name:
        pid = parents_by_name.get(key)
        if pid:
            for entry in by_name.values():
                if entry.get("genre_id") == pid:
                    return entry
    return None


def _people_list(blob: dict, *keys: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for key in keys:
        raw = blob.get(key)
        values: list[str] = []
        if isinstance(raw, list):
            values = [str(v).strip() for v in raw if v and str(v).strip()]
        elif isinstance(raw, str):
            values = [p.strip() for p in raw.split(";") if p.strip()]
        for name in values:
            k = name.casefold()
            if k in seen:
                continue
            seen.add(k)
            out.append(name)
    return out


def extract_work_filter_fields(
    row: MovieWork,
    by_name: dict[str, dict],
    iso_to_country: dict[str, Country],
    parents_by_name: dict[str, int],
    *,
    include_nested_film_genres: bool = True,
) -> dict[str, Any]:
    meta = _load_meta(row)
    genre_ids: list[int] = []
    genre_names: list[str] = []
    parent_names_set: set[str] = set()
    seen: set[int] = set()
    isos: list[str] = []
    publishers: list[str] = []
    writers: list[str] = []
    seen_p: set[str] = set()
    seen_w: set[str] = set()

    all_blobs = _iter_meta_blobs(meta)
    genre_blobs = all_blobs if include_nested_film_genres else [meta]

    for blob in genre_blobs:
        for g in blob.get("genres") or []:
            if not isinstance(g, dict):
                continue
            gname = (g.get("name") or "").strip()
            if not gname:
                continue
            resolved = resolve_movie_subgenre(gname, by_name, parents_by_name)
            if not resolved:
                continue
            sid = int(resolved["id"])
            if sid in seen:
                continue
            seen.add(sid)
            genre_ids.append(sid)
            genre_names.append(resolved["name"])
            parent = (resolved.get("genre_name") or "").strip()
            if parent:
                parent_names_set.add(parent)

    for blob in all_blobs:
        for iso in blob.get("origin_countries") or []:
            code = str(iso).strip().lower()[:2]
            if code and code not in isos:
                isos.append(code)
        # Directors first for movies catalog “director” filter (stored as writers).
        for name in _people_list(blob, "directors", "writers"):
            key = name.casefold()
            if key in seen_w:
                continue
            seen_w.add(key)
            writers.append(name)
        for name in _people_list(blob, "publishers"):
            key = name.casefold()
            if key in seen_p:
                continue
            seen_p.add(key)
            publishers.append(name)

    primary_iso = isos[0] if isos else None
    crow = iso_to_country.get(primary_iso) if primary_iso else None
    return {
        "country_iso": primary_iso,
        "country_isos": isos,
        "country_id": crow.cou_id if crow else None,
        "continent_id": getattr(crow, "cou_continent_id", None) if crow else None,
        "genre_ids": genre_ids,
        "genre_names": genre_names,
        "parent_genre_names": sorted(parent_names_set),
        "publishers": publishers,
        "writers": writers,
    }


def enrich_movies_catalog(db: Session, catalog: dict) -> dict:
    """Attach country/genre fields from MovieWork onto franchise + film cards."""
    franchises = catalog.get("franchises") or []
    films = catalog.get("films") or []
    if not franchises and not films:
        return catalog

    by_name = build_movie_subgenre_index(db)
    parents_by_name = {
        (g.gen_name or "").strip().casefold(): g.gen_id
        for g in db.scalars(
            select(Genre).where(Genre.gen_media_type_id == MOVIES_MEDIA_TYPE)
        ).all()
        if g.gen_name
    }
    iso_to_country: dict[str, Country] = {}
    for c in db.scalars(select(Country)).all():
        iso = (c.cou_iso or "").strip().lower()
        if iso:
            iso_to_country[iso] = c

    works = {
        (w.mwk_slug or "").casefold(): w
        for w in db.scalars(select(MovieWork)).all()
        if w.mwk_slug
    }

    for card in franchises:
        if not isinstance(card, dict):
            continue
        wid = (card.get("id") or "").casefold()
        row = works.get(wid)
        if not row:
            card.setdefault("country_iso", None)
            card.setdefault("country_id", None)
            card.setdefault("continent_id", None)
            card.setdefault("genre_ids", [])
            card.setdefault("genre_names", [])
            card.setdefault("parent_genre_names", [])
            card.setdefault("publishers", [])
            card.setdefault("writers", [])
            continue
        fields = extract_work_filter_fields(
            row,
            by_name,
            iso_to_country,
            parents_by_name,
            include_nested_film_genres=False,
        )
        card.update(fields)

    films_by_work: dict[str, list[dict]] = {}
    for film in films:
        if not isinstance(film, dict):
            continue
        wid = (film.get("work_id") or "").casefold()
        films_by_work.setdefault(wid, []).append(film)

    for wid, group in films_by_work.items():
        row = works.get(wid)
        fields = (
            extract_work_filter_fields(
                row,
                by_name,
                iso_to_country,
                parents_by_name,
                include_nested_film_genres=False,
            )
            if row
            else {
                "country_iso": None,
                "country_id": None,
                "continent_id": None,
                "genre_ids": [],
                "genre_names": [],
                "publishers": [],
                "writers": [],
            }
        )
        meta = _load_meta(row) if row else {}
        film_map = meta.get("films") if isinstance(meta.get("films"), dict) else {}
        for film in group:
            # Start from work-level fields, then prefer per-film genres/credits.
            film.update(dict(fields))
            leaf = str(film.get("id") or "")
            film_meta = film_map.get(leaf) if isinstance(film_map.get(leaf), dict) else None
            if not isinstance(film_meta, dict):
                continue
            people = _people_list(film_meta, "directors", "writers")
            pubs = _people_list(film_meta, "publishers")
            if people:
                film["writers"] = people
            if pubs:
                film["publishers"] = pubs
            raw_genres = film_meta.get("genres")
            if not isinstance(raw_genres, list) or not raw_genres:
                continue
            genre_ids: list[int] = []
            genre_names: list[str] = []
            parent_names_set: set[str] = set()
            seen: set[int] = set()
            for g in raw_genres:
                if isinstance(g, dict):
                    gname = (g.get("name") or "").strip()
                else:
                    gname = str(g).strip()
                if not gname:
                    continue
                resolved = resolve_movie_subgenre(gname, by_name, parents_by_name)
                if not resolved:
                    continue
                sid = int(resolved["id"])
                if sid in seen:
                    continue
                seen.add(sid)
                genre_ids.append(sid)
                genre_names.append(resolved["name"])
                parent = (resolved.get("genre_name") or "").strip()
                if parent:
                    parent_names_set.add(parent)
            if genre_names:
                film["genre_ids"] = genre_ids
                film["genre_names"] = genre_names
                film["parent_genre_names"] = sorted(parent_names_set)

    return catalog


def build_movies_filter_options(db: Session, catalog: dict | None = None) -> dict:
    """Catalog filter options for Movies — used subgenres/countries from works."""
    from app.music_filters import (
        _country_groups_from_ids,
        all_country_groups,
        continents_for_country_ids,
    )
    from app.movies_index import build_movies_catalog
    from app.seed_music import ensure_music_lookup_data

    ensure_music_lookup_data(db)
    by_name = build_movie_subgenre_index(db)
    parents_by_name = {
        (g.gen_name or "").strip().casefold(): g.gen_id
        for g in db.scalars(
            select(Genre).where(Genre.gen_media_type_id == MOVIES_MEDIA_TYPE)
        ).all()
        if g.gen_name
    }
    iso_to_country: dict[str, Country] = {}
    for c in db.scalars(select(Country)).all():
        iso = (c.cou_iso or "").strip().lower()
        if iso:
            iso_to_country[iso] = c

    used_sub_ids: set[int] = set()
    used_isos: set[str] = set()
    publishers_map: dict[str, str] = {}
    writers_map: dict[str, str] = {}
    for row in db.scalars(select(MovieWork)).all():
        fields = extract_work_filter_fields(
            row, by_name, iso_to_country, parents_by_name
        )
        for gid in fields["genre_ids"]:
            used_sub_ids.add(int(gid))
        for iso in fields.get("country_isos") or (
            [fields["country_iso"]] if fields.get("country_iso") else []
        ):
            if iso:
                used_isos.add(str(iso))
        for name in fields.get("publishers") or []:
            if isinstance(name, str) and name.strip():
                publishers_map.setdefault(name.casefold(), name.strip())
        for name in fields.get("writers") or []:
            if isinstance(name, str) and name.strip():
                writers_map.setdefault(name.casefold(), name.strip())

    used_by_parent: dict[str, list[dict]] = {}
    for sid in used_sub_ids:
        entry = next((e for e in by_name.values() if e["id"] == sid), None)
        if not entry:
            sub = db.get(Subgenre, sid)
            if not sub or not sub.sgn_name:
                continue
            parent = db.get(Genre, sub.sgn_genre_id or 0)
            entry = {
                "id": sid,
                "name": sub.sgn_name,
                "genre_id": sub.sgn_genre_id,
                "genre_name": (parent.gen_name if parent else None) or "Other",
            }
        parent = entry.get("genre_name") or "Other"
        used_by_parent.setdefault(parent, []).append(
            {
                "id": entry["id"],
                "name": entry["name"],
                "genre_id": entry.get("genre_id"),
            }
        )
    for items in used_by_parent.values():
        items.sort(key=lambda x: (x.get("name") or "").casefold())
    subgenre_groups = [
        {"genre": name, "items": items}
        for name, items in sorted(
            used_by_parent.items(), key=lambda x: x[0].casefold()
        )
    ]

    # Full taxonomy for editors
    parent_genres = {
        g.gen_id: g.gen_name
        for g in db.scalars(
            select(Genre).where(Genre.gen_media_type_id == MOVIES_MEDIA_TYPE)
        ).all()
        if g.gen_name and g.gen_name.strip()
    }
    all_by_parent: dict[str, list[dict]] = {}
    for s in db.scalars(
        select(Subgenre)
        .where(Subgenre.sgn_media_type_id == MOVIES_MEDIA_TYPE)
        .order_by(Subgenre.sgn_name)
    ).all():
        if not s.sgn_name or not s.sgn_name.strip():
            continue
        parent = parent_genres.get(s.sgn_genre_id or 0) or "Other"
        all_by_parent.setdefault(parent, []).append(
            {
                "id": s.sgn_id,
                "name": s.sgn_name,
                "genre_id": s.sgn_genre_id,
            }
        )
    all_subgenre_groups = [
        {"genre": name, "items": items}
        for name, items in sorted(
            all_by_parent.items(), key=lambda x: x[0].casefold()
        )
    ]

    used_country_ids: set[int] = set()
    for c in db.scalars(select(Country)).all():
        if (c.cou_iso or "").strip().lower() in used_isos:
            used_country_ids.add(c.cou_id)
    country_groups = _country_groups_from_ids(db, used_country_ids or None)
    if not used_isos:
        country_groups = []

    continents = continents_for_country_ids(db, used_country_ids)

    cat = catalog if catalog is not None else build_movies_catalog()
    decades: set[int] = set()
    for f in cat.get("films") or []:
        iso = (f.get("date_iso") or "") if isinstance(f, dict) else ""
        if len(iso) >= 4 and iso[:4].isdigit():
            decades.add((int(iso[:4]) // 10) * 10)

    return {
        "continents": continents,
        "country_groups": country_groups,
        "all_country_groups": all_country_groups(db),
        "subgenre_groups": subgenre_groups,
        "all_subgenre_groups": all_subgenre_groups,
        "decades": sorted(decades),
        "publishers": sorted(publishers_map.values(), key=str.casefold),
        "writers": sorted(writers_map.values(), key=str.casefold),
    }


def movie_vibe_rows(db: Session, limit: int = 10) -> list[dict]:
    """Film Vibes pane: count resolved movie subgenres across works."""
    from collections import Counter

    by_name = build_movie_subgenre_index(db)
    parents_by_name = {
        (g.gen_name or "").strip().casefold(): g.gen_id
        for g in db.scalars(
            select(Genre).where(Genre.gen_media_type_id == MOVIES_MEDIA_TYPE)
        ).all()
        if g.gen_name
    }
    iso_to_country: dict[str, Country] = {}
    counts: Counter[int] = Counter()
    meta_by_id: dict[int, dict] = {}
    for row in db.scalars(select(MovieWork)).all():
        fields = extract_work_filter_fields(
            row, by_name, iso_to_country, parents_by_name
        )
        for sid, name in zip(fields["genre_ids"], fields["genre_names"]):
            counts[int(sid)] += 1
            meta_by_id[int(sid)] = {"id": int(sid), "name": name}

    out: list[dict] = []
    for sid, count in counts.most_common(limit):
        meta = meta_by_id.get(sid) or {"id": sid, "name": str(sid)}
        out.append(
            {
                "id": meta["id"],
                "name": meta["name"],
                "play_count": count,
                "image_url": subgenre_image_url(meta["name"]),
            }
        )
    return out
