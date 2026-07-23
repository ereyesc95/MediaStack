from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import EpisodeOut, SeasonOut, SeriesListOut, SeriesOut

router = APIRouter(prefix="/api/series", tags=["series"])


@router.get("/catalog")
def series_catalog(db: Session = Depends(get_db)):
    """Filesystem catalog: Series/{Letter}/{Franchise}/ (+ DB filter metadata)."""
    from app.series_catalog_meta import enrich_catalog_metadata
    from app.series_index import build_series_catalog

    return enrich_catalog_metadata(db, build_series_catalog())


@router.get("/filters/options")
def series_filter_options(db: Session = Depends(get_db)):
    """Catalog filter options — used genres/countries for catalog; full lists for editors."""
    import json
    import re

    from sqlalchemy import select

    from app.media_item_admin import list_people_for_kind, list_publishers_for_kind
    from app.models import Continent, Country, Genre, Series, Subgenre
    from app.music_filters import (
        _country_groups_from_ids,
        all_country_groups,
        decade_options,
    )
    from app.seed_music import ensure_music_lookup_data
    from app.series_index import build_series_catalog

    ensure_music_lookup_data(db)
    continents = [
        {"id": c.con_id, "name": c.con_name}
        for c in db.scalars(select(Continent).order_by(Continent.con_name)).all()
        if c.con_name and c.con_id != 1007
    ]

    # Full taxonomy (Movies 300 + Series 400) for Edit about
    parent_genres = {
        g.gen_id: g.gen_name
        for g in db.scalars(
            select(Genre).where(Genre.gen_media_type_id.in_([300, 400]))
        ).all()
        if g.gen_name and g.gen_name.strip()
    }
    all_by_parent: dict[str, list[dict]] = {}
    for s in db.scalars(
        select(Subgenre)
        .where(Subgenre.sgn_media_type_id.in_([300, 400]))
        .order_by(Subgenre.sgn_name)
    ).all():
        if not s.sgn_name or not s.sgn_name.strip():
            continue
        parent = parent_genres.get(s.sgn_genre_id or 0)
        if not parent:
            g = db.get(Genre, s.sgn_genre_id or 0)
            parent = (g.gen_name if g and g.gen_name else None) or "Other"
        all_by_parent.setdefault(parent, []).append(
            {
                "id": s.sgn_id,
                "name": s.sgn_name,
                "genre_id": s.sgn_genre_id,
            }
        )
    for items in all_by_parent.values():
        items.sort(key=lambda x: (x.get("name") or "").casefold())
    all_subgenre_groups = [
        {"genre": name, "items": items}
        for name, items in sorted(
            all_by_parent.items(), key=lambda x: x[0].casefold()
        )
    ]

    # Used genres / countries from Series rows already in the DB
    used_isos: set[str] = set()
    used_genre_entries: list[dict] = []
    seen_genre_keys: set[str] = set()
    for row in db.scalars(select(Series)).all():
        iso = (row.ser_country_iso or "").strip().lower()
        if iso:
            used_isos.add(iso)
        try:
            raw = json.loads(row.ser_genres_json or "[]")
        except (json.JSONDecodeError, TypeError):
            raw = []
        if not isinstance(raw, list):
            continue
        for g in raw:
            if not isinstance(g, dict):
                continue
            name = (g.get("name") or "").strip()
            if not name:
                continue
            key = name.casefold()
            if key in seen_genre_keys:
                continue
            seen_genre_keys.add(key)
            used_genre_entries.append(
                {"id": g.get("id") or name, "name": name}
            )

    # Map used genre names onto parent buckets when possible
    parent_by_name = {
        (n or "").casefold(): n for n in parent_genres.values() if n
    }
    used_by_parent: dict[str, list[dict]] = {}
    for entry in used_genre_entries:
        name = entry["name"]
        parent = parent_by_name.get(name.casefold())
        if not parent:
            # "Action & Adventure" → prefer first matching parent part
            for part in re.split(r"\s*[&/|,]\s*", name):
                part = part.strip()
                if part.casefold() in parent_by_name:
                    parent = parent_by_name[part.casefold()]
                    break
        if not parent:
            parent = name
        gid = entry["id"]
        # Prefer matching subgenre id when name matches taxonomy
        for items in all_by_parent.get(parent, []) or []:
            if (items.get("name") or "").casefold() == name.casefold():
                gid = items["id"]
                break
        used_by_parent.setdefault(parent, []).append(
            {
                "id": gid if isinstance(gid, int) or str(gid).isdigit() else hash(name) % 10_000_000,
                "name": name,
                "genre_id": None,
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

    used_country_ids: set[int] = set()
    if used_isos:
        for c in db.scalars(select(Country)).all():
            if (c.cou_iso or "").strip().lower() in used_isos:
                used_country_ids.add(c.cou_id)
    country_groups = _country_groups_from_ids(db, used_country_ids or None)
    if not used_isos:
        country_groups = []

    catalog = build_series_catalog()
    decades: set[int] = set(decade_options())
    for f in catalog.get("franchises") or []:
        for s in f.get("subseries") or []:
            iso = s.get("date_iso") or ""
            if len(iso) >= 4 and iso[:4].isdigit():
                decades.add((int(iso[:4]) // 10) * 10)

    return {
        "continents": continents,
        "country_groups": country_groups,
        "all_country_groups": all_country_groups(db),
        "subgenre_groups": subgenre_groups,
        "all_subgenre_groups": all_subgenre_groups,
        "decades": sorted(decades),
        "publishers": list_publishers_for_kind(db, "video"),
        "writers": list_people_for_kind(db, "video", "author")
        or list_people_for_kind(db, "video", "director"),
    }


@router.get("/dashboard")
def series_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Home panes: On Repeat, Icons, Show Vibes, Global Acts."""
    from app.series_dashboard import build_series_dashboard

    try:
        return build_series_dashboard(db, user.usr_id)
    except Exception:
        return {
            "top_episodes": [],
            "top_series": [],
            "top_genres": [],
            "top_countries": [],
        }


@router.get("/franchises/{franchise_id}")
def series_franchise(franchise_id: str):
    """Franchise detail: subseries and/or direct seasons."""
    from app.series_index import build_franchise_detail

    detail = build_franchise_detail(franchise_id)
    if not detail:
        raise HTTPException(404, "Series franchise not found")
    return detail


@router.get("/franchises/{franchise_id}/overview")
def series_franchise_overview(
    franchise_id: str,
    orientation: str = Query("portrait"),
    db: Session = Depends(get_db),
):
    """Artist-parity overview: bio/cast/links + disk subseries + related media."""
    from app.series_overview import build_series_overview

    data = build_series_overview(db, franchise_id, orientation=orientation)
    if not data:
        raise HTTPException(404, "Series franchise not found")
    return data


@router.post("/franchises/{franchise_id}/refresh-metadata")
async def series_refresh_metadata(
    franchise_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    include_bio: bool = True,
):
    """Admin: pull TMDb metadata into the Series row for this franchise."""
    from app.series_index import build_franchise_detail, find_franchise_dir
    from app.series_refresh import refresh_series_metadata

    found = find_franchise_dir(franchise_id)
    if not found:
        raise HTTPException(404, "Series franchise not found")
    franchise_dir, _letter = found
    detail = build_franchise_detail(franchise_id) or {}
    sub_titles = [
        s.get("title")
        for s in (detail.get("subseries") or [])
        if s.get("title")
    ]
    result = await refresh_series_metadata(
        db,
        franchise_dir.name,
        include_bio=include_bio,
        subseries_titles=sub_titles,
    )
    if not result.get("ok"):
        raise HTTPException(400, result.get("error") or "Refresh failed")
    return result


@router.patch("/franchises/{franchise_id}/about")
def series_patch_about(
    franchise_id: str,
    body: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.series_admin import patch_series_about
    from app.series_index import find_franchise_dir

    found = find_franchise_dir(franchise_id)
    if not found:
        raise HTTPException(404, "Series franchise not found")
    franchise_dir, _ = found
    row = patch_series_about(
        db,
        franchise_dir.name,
        bio=body.get("bio"),
        writers=body.get("writers"),
        country_id=body.get("country_id"),
        activity_start=body.get("activity_start"),
        activity_end=body.get("activity_end"),
        publishers=body.get("publishers"),
        languages=body.get("languages"),
        genres=body.get("genres"),
    )
    return {"ok": True, "ser_id": row.ser_id}


@router.post("/franchises/{franchise_id}/cast")
def series_add_cast(
    franchise_id: str,
    body: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.series_admin import add_series_cast_member
    from app.series_index import find_franchise_dir

    found = find_franchise_dir(franchise_id)
    if not found:
        raise HTTPException(404, "Series franchise not found")
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name required")
    member = add_series_cast_member(
        db,
        found[0].name,
        bucket=body.get("bucket") or "characters",
        name=name,
        character=body.get("character"),
        photo_url=body.get("photo_url"),
        character_photo_url=body.get("character_photo_url"),
        roles=body.get("roles"),
        language=body.get("language"),
    )
    return member


@router.delete("/franchises/{franchise_id}/cast/{member_id}")
def series_remove_cast(
    franchise_id: str,
    member_id: str,
    bucket: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.series_admin import remove_series_cast_member
    from app.series_index import find_franchise_dir

    found = find_franchise_dir(franchise_id)
    if not found:
        raise HTTPException(404, "Series franchise not found")
    ok = remove_series_cast_member(
        db, found[0].name, member_id=member_id, bucket=bucket
    )
    if not ok:
        raise HTTPException(404, "Cast member not found")
    return {"ok": True}


@router.patch("/franchises/{franchise_id}/cast/{member_id}")
def series_patch_cast(
    franchise_id: str,
    member_id: str,
    body: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.series_admin import patch_series_cast_member
    from app.series_index import find_franchise_dir

    found = find_franchise_dir(franchise_id)
    if not found:
        raise HTTPException(404, "Series franchise not found")
    member = patch_series_cast_member(
        db,
        found[0].name,
        member_id,
        bucket=body.get("bucket") or "characters",
        name=body.get("name"),
        character=body.get("character"),
        photo_url=body.get("photo_url"),
        actor_photo_url=body.get("actor_photo_url"),
        actors=body.get("actors"),
        roles=body.get("roles"),
        language=body.get("language"),
        performances=body.get("performances"),
    )
    if not member:
        raise HTTPException(404, "Cast member not found")
    return member


@router.post("/franchises/{franchise_id}/related")
def series_add_related(
    franchise_id: str,
    body: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.series_admin import add_series_related
    from app.series_index import find_franchise_dir

    found = find_franchise_dir(franchise_id)
    if not found:
        raise HTTPException(404, "Series franchise not found")
    title = (body.get("title") or body.get("name") or "").strip()
    if not title:
        raise HTTPException(400, "title required")
    item = add_series_related(
        db,
        found[0].name,
        bucket=body.get("bucket") or "similar",
        title=title,
        tmdb_id=body.get("tmdb_id"),
        date_iso=body.get("date_iso"),
        poster_url=body.get("poster_url") or body.get("cover_url"),
        overview=body.get("overview"),
    )
    return {"ok": True, "item": item}


@router.delete("/franchises/{franchise_id}/related/{item_id}")
def series_remove_related(
    franchise_id: str,
    item_id: str,
    bucket: str = "similar",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.series_admin import remove_series_related
    from app.series_index import find_franchise_dir

    found = find_franchise_dir(franchise_id)
    if not found:
        raise HTTPException(404, "Series franchise not found")
    ok = remove_series_related(
        db, found[0].name, bucket=bucket, item_id=item_id
    )
    if not ok:
        raise HTTPException(404, "Related entry not found")
    return {"ok": True}


@router.post("/franchises/{franchise_id}/links")
def series_add_link(
    franchise_id: str,
    body: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.series_admin import add_series_link
    from app.series_index import find_franchise_dir

    found = find_franchise_dir(franchise_id)
    if not found:
        raise HTTPException(404, "Series franchise not found")
    url = (body.get("url") or "").strip()
    if not url:
        raise HTTPException(400, "url required")
    item = add_series_link(
        db,
        found[0].name,
        category=body.get("category") or "databases",
        label=body.get("label") or "Link",
        url=url,
        logo_key=body.get("logo_key"),
        logo_url=body.get("logo_url"),
    )
    return {"ok": True, "id": item["id"], "link": item}


@router.patch("/franchises/{franchise_id}/links/{link_id}")
def series_patch_link(
    franchise_id: str,
    link_id: str,
    body: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.series_admin import patch_series_link
    from app.series_index import find_franchise_dir

    found = find_franchise_dir(franchise_id)
    if not found:
        raise HTTPException(404, "Series franchise not found")
    item = patch_series_link(
        db,
        found[0].name,
        link_id,
        category=body.get("category"),
        label=body.get("label"),
        url=body.get("url"),
        logo_key=body.get("logo_key"),
        logo_url=body.get("logo_url"),
        clear_logo_key=bool(body.get("clear_logo_upload")),
    )
    if not item:
        raise HTTPException(404, "Link not found")
    return {"ok": True, "link": item}


@router.delete("/franchises/{franchise_id}/links/{link_id}")
def series_delete_link(
    franchise_id: str,
    link_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.series_admin import remove_series_link
    from app.series_index import find_franchise_dir

    found = find_franchise_dir(franchise_id)
    if not found:
        raise HTTPException(404, "Series franchise not found")
    if not remove_series_link(db, found[0].name, link_id):
        raise HTTPException(404, "Link not found")
    return {"ok": True}


@router.get("/franchises/{franchise_id}/media/movies")
def series_franchise_movies(franchise_id: str, db: Session = Depends(get_db)):
    from app.series_overview import build_series_overview

    overview = build_series_overview(db, franchise_id)
    if not overview:
        raise HTTPException(404, "Series franchise not found")
    return {"items": (overview.get("related") or {}).get("movies") or []}


@router.get("/franchises/{franchise_id}/media/audio")
def series_franchise_audio(
    franchise_id: str,
    db: Session = Depends(get_db),
):
    """Audio releases when a Music artist matches the franchise name."""
    from app.media_index import get_audio_index
    from app.models import Band
    from app.series_overview import build_series_overview

    overview = build_series_overview(db, franchise_id)
    if not overview:
        raise HTTPException(404, "Series franchise not found")
    band_id = overview.get("music_band_id")
    if not band_id:
        return {"releases": [], "categories": [], "band_id": None}
    band = db.get(Band, band_id)
    if not band:
        return {"releases": [], "categories": [], "band_id": None}
    index = get_audio_index(db, band)
    return {**index, "band_id": band_id}


@router.get("/franchises/{franchise_id}/media/series")
def series_franchise_shows(franchise_id: str, db: Session = Depends(get_db)):
    """Subseries (and direct seasons) as release-style cards."""
    from app.series_overview import build_series_overview

    overview = build_series_overview(db, franchise_id)
    if not overview:
        raise HTTPException(404, "Series franchise not found")
    cards = list(overview.get("subseries") or [])
    if not cards:
        for s in overview.get("seasons") or []:
            cards.append(
                {
                    "id": s.get("id"),
                    "title": s.get("title"),
                    "date_iso": s.get("date_iso"),
                    "display_date": s.get("display_date"),
                    "cover_url": s.get("cover_url") or overview.get("cover_url"),
                    "folder_path": s.get("folder_path"),
                    "season_count": 0,
                    "episode_count": s.get("episode_count"),
                }
            )
    return {"items": cards}


@router.get("/franchises/{franchise_id}/media/library")
def series_franchise_library(franchise_id: str, db: Session = Depends(get_db)):
    from app.series_overview import build_series_overview

    overview = build_series_overview(db, franchise_id)
    if not overview:
        raise HTTPException(404, "Series franchise not found")
    return {"items": (overview.get("related") or {}).get("books") or []}


@router.get("/franchises/{franchise_id}/media/games")
def series_franchise_games(franchise_id: str, db: Session = Depends(get_db)):
    from app.series_overview import build_series_overview

    overview = build_series_overview(db, franchise_id)
    if not overview:
        raise HTTPException(404, "Series franchise not found")
    return {"items": (overview.get("related") or {}).get("games") or []}


@router.get("/folder")
def series_folder(path: str = Query(..., min_length=1)):
    """Subseries or season folder detail (seasons or episodes)."""
    from app.series_index import build_folder_detail

    detail = build_folder_detail(path)
    if not detail:
        raise HTTPException(404, "Series folder not found")
    return detail


@router.get("/gallery")
def series_gallery(path: str = Query(..., min_length=1)):
    """[Artwork] images for a Series franchise / subseries / season folder."""
    from app.series_index import build_series_gallery

    return build_series_gallery(path)


# DB-backed stubs — under /db so they never steal /catalog, /folder, etc.
@router.get("/db", response_model=SeriesListOut)
def list_series(
    db: Session = Depends(get_db),
    search: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(48, ge=1, le=200),
):
    items, total = crud.list_series(db, search=search, page=page, page_size=page_size)
    return SeriesListOut(items=items, total=total, page=page, page_size=page_size)


@router.get("/db/{series_id}", response_model=SeriesOut)
def get_series(series_id: int, db: Session = Depends(get_db)):
    row = crud.get_series(db, series_id)
    if not row:
        raise HTTPException(404, "Series not found")
    return crud.series_to_out(row)


@router.get("/db/{series_id}/seasons", response_model=list[SeasonOut])
def series_seasons(series_id: int, db: Session = Depends(get_db)):
    if not crud.get_series(db, series_id):
        raise HTTPException(404, "Series not found")
    return crud.list_seasons(db, series_id)


@router.get("/db/seasons/{season_id}/episodes", response_model=list[EpisodeOut])
def season_episodes(season_id: int, db: Session = Depends(get_db)):
    return crud.list_episodes(db, season_id)
