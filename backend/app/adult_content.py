"""Adult / NSFW genre classification for catalog visibility."""
from __future__ import annotations

# Parent genres whose entire subgenre tree is adult-only.
ADULT_PARENT_GENRES = frozenset(
    {
        "adult",
        "adult print",
    }
)

# Explicit subgenres under Anime / Manga (and anywhere else) that are adult-only.
ADULT_SUBGENRES = frozenset(
    {
        "ecchi",
        "harem",
        "lolicon",
        "yuri",
        "yaoi",
        "reverse harem",
    }
)


def _norm(name: str | None) -> str:
    return (name or "").strip().casefold()


def is_adult_subgenre_name(name: str | None) -> bool:
    return _norm(name) in ADULT_SUBGENRES


def is_adult_parent_genre_name(name: str | None) -> bool:
    return _norm(name) in ADULT_PARENT_GENRES


def is_adult_taxonomy(*, parent_name: str | None, subgenre_name: str | None) -> bool:
    if is_adult_parent_genre_name(parent_name):
        return True
    if is_adult_subgenre_name(subgenre_name):
        return True
    return False


def card_has_adult_genres(
    *,
    genre_names: list[str] | None = None,
    genre_ids: list | None = None,
    parent_genre_names: list[str] | None = None,
    extra_adult_subgenres: set[str] | frozenset[str] | None = None,
) -> bool:
    for n in parent_genre_names or []:
        if is_adult_parent_genre_name(n):
            return True
    extra = {
        _norm(x) for x in (extra_adult_subgenres or ()) if isinstance(x, str)
    }
    for n in genre_names or []:
        nn = _norm(n)
        if (
            is_adult_subgenre_name(n)
            or is_adult_parent_genre_name(n)
            or (nn and nn in extra)
        ):
            return True
    # genre_ids alone cannot decide without DB lookup; callers should pass names.
    _ = genre_ids
    return False


def adult_subgenre_names_from_db(db) -> set[str]:
    """Subgenre display names whose parent genre is Adult / Adult Print."""
    from sqlalchemy import select

    from app.models import Genre, Subgenre

    parent_ids = {
        g.gen_id
        for g in db.scalars(select(Genre)).all()
        if g.gen_id and is_adult_parent_genre_name(g.gen_name)
    }
    if not parent_ids:
        return set()
    out: set[str] = set()
    for s in db.scalars(select(Subgenre)).all():
        if s.sgn_genre_id in parent_ids and (s.sgn_name or "").strip():
            out.add(s.sgn_name.strip())
    return out


def sfw_series_franchise_ids(db) -> set[str]:
    """Series catalog franchise ids visible when NSFW is locked."""
    from app.franchise_index import normalize_franchise_slug
    from app.series_catalog_meta import enrich_catalog_metadata
    from app.series_index import build_series_catalog

    catalog = enrich_catalog_metadata(db, build_series_catalog())
    kept = filter_adult_cards(
        catalog.get("franchises") or [],
        nsfw_unlocked=False,
        extra_adult_subgenres=adult_subgenre_names_from_db(db),
    )
    out: set[str] = set()
    for card in kept:
        if not isinstance(card, dict):
            continue
        cid = (card.get("id") or "").strip()
        name = (card.get("name") or "").strip()
        if cid:
            out.add(cid.casefold())
            out.add(normalize_franchise_slug(cid) or cid.casefold())
        if name:
            out.add(name.casefold())
            out.add(normalize_franchise_slug(name) or name.casefold())
    return {x for x in out if x}


def series_franchise_is_sfw(db, franchise_slug: str, *, sfw_ids: set[str] | None = None) -> bool:
    """True when the franchise may appear under SFW profiles."""
    from app.franchise_index import normalize_franchise_slug

    raw = (franchise_slug or "").strip()
    if not raw:
        return True
    ids = sfw_ids if sfw_ids is not None else sfw_series_franchise_ids(db)
    keys = {
        raw.casefold(),
        normalize_franchise_slug(raw) or raw.casefold(),
    }
    return bool(keys & ids)


def sfw_movie_work_ids(db) -> set[str]:
    """Movie work / film ids visible when NSFW is locked."""
    from app.franchise_index import normalize_franchise_slug
    from app.movies_catalog_meta import enrich_movies_catalog
    from app.movies_index import build_movies_catalog

    catalog = enrich_movies_catalog(db, build_movies_catalog())
    kept_works = filter_adult_cards(
        catalog.get("franchises") or [],
        nsfw_unlocked=False,
        extra_adult_subgenres=adult_subgenre_names_from_db(db),
    )
    kept_films = filter_adult_cards(
        catalog.get("films") or [],
        nsfw_unlocked=False,
        extra_adult_subgenres=adult_subgenre_names_from_db(db),
    )
    out: set[str] = set()
    for card in list(kept_works) + list(kept_films):
        if not isinstance(card, dict):
            continue
        for key in ("id", "work_id", "name", "title"):
            raw = (card.get(key) or "").strip()
            if not raw:
                continue
            out.add(raw.casefold())
            out.add(normalize_franchise_slug(raw) or raw.casefold())
    return {x for x in out if x}


def movie_work_is_sfw(db, work_slug: str, *, sfw_ids: set[str] | None = None) -> bool:
    from app.franchise_index import normalize_franchise_slug

    raw = (work_slug or "").strip()
    if not raw:
        return True
    ids = sfw_ids if sfw_ids is not None else sfw_movie_work_ids(db)
    keys = {
        raw.casefold(),
        normalize_franchise_slug(raw) or raw.casefold(),
    }
    return bool(keys & ids)


def filter_adult_related_cards(
    db,
    cards: list[dict],
    *,
    nsfw_unlocked: bool,
    module: str = "movies",
) -> list[dict]:
    """Filter related leaf cards (movies/series) under SFW."""
    if nsfw_unlocked or not cards:
        return cards
    if module == "series":
        sfw_ids = sfw_series_franchise_ids(db)
        check = series_franchise_is_sfw
    else:
        sfw_ids = sfw_movie_work_ids(db)
        check = movie_work_is_sfw
    out: list[dict] = []
    for card in cards:
        if not isinstance(card, dict):
            out.append(card)
            continue
        slug = str(
            card.get("work_id")
            or card.get("franchise_id")
            or card.get("id")
            or card.get("path")
            or ""
        )
        # path like Movies/H/Harry Potter/...
        if "/" in slug:
            parts = [p for p in slug.replace("\\", "/").split("/") if p]
            if len(parts) >= 3:
                slug = parts[2]
        if check(db, slug, sfw_ids=sfw_ids):
            out.append(card)
    return out


def filter_adult_cards(
    cards: list[dict],
    *,
    nsfw_unlocked: bool,
    extra_adult_subgenres: set[str] | frozenset[str] | None = None,
) -> list[dict]:
    if nsfw_unlocked:
        return cards
    out: list[dict] = []
    for card in cards:
        if not isinstance(card, dict):
            out.append(card)
            continue
        if card_has_adult_genres(
            genre_names=card.get("genre_names")
            if isinstance(card.get("genre_names"), list)
            else None,
            genre_ids=card.get("genre_ids")
            if isinstance(card.get("genre_ids"), list)
            else None,
            parent_genre_names=card.get("parent_genre_names")
            if isinstance(card.get("parent_genre_names"), list)
            else None,
            extra_adult_subgenres=extra_adult_subgenres,
        ):
            continue
        out.append(card)
    return out


def filter_subgenre_groups(groups: list[dict], *, nsfw_unlocked: bool) -> list[dict]:
    """Drop adult parent groups and adult-named subgenres from filter chips."""
    if nsfw_unlocked:
        return groups
    out: list[dict] = []
    for g in groups or []:
        if not isinstance(g, dict):
            continue
        parent = g.get("name") or g.get("label") or g.get("genre") or ""
        if is_adult_parent_genre_name(str(parent)):
            continue
        items = g.get("items") or g.get("subgenres") or []
        if not isinstance(items, list):
            items = []
        kept = []
        for it in items:
            if not isinstance(it, dict):
                continue
            name = it.get("name") or it.get("label") or ""
            if is_adult_subgenre_name(str(name)) or is_adult_parent_genre_name(
                str(name)
            ):
                continue
            kept.append(it)
        if items and not kept:
            continue
        ng = dict(g)
        if "items" in g:
            ng["items"] = kept
        if "subgenres" in g:
            ng["subgenres"] = kept
        out.append(ng)
    return out


def filter_genre_entries(
    entries: list[dict] | None, *, nsfw_unlocked: bool
) -> list[dict]:
    """Drop adult parent/subgenre rows from flat genre lists (edit dropdowns)."""
    if nsfw_unlocked or not entries:
        return list(entries or [])
    out: list[dict] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        name = entry.get("name") or entry.get("label") or ""
        if is_adult_parent_genre_name(str(name)) or is_adult_subgenre_name(
            str(name)
        ):
            continue
        out.append(entry)
    return out
