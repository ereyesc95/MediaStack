from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import EpisodeOut, SeasonOut, SeriesListOut, SeriesOut

router = APIRouter(prefix="/api/series", tags=["series"])


@router.get("/catalog")
def series_catalog():
    """Filesystem catalog: Series/{Letter}/{Franchise}/ (+ subseries/seasons counts)."""
    from app.series_index import build_series_catalog

    return build_series_catalog()


@router.get("/filters/options")
def series_filter_options(db: Session = Depends(get_db)):
    """Catalog filter options — decades ascending; genres from movies/series, not music."""
    from sqlalchemy import select

    from app.media_item_admin import list_people_for_kind, list_publishers_for_kind
    from app.models import Continent, Genre
    from app.music_filters import all_country_groups, decade_options
    from app.seed_music import ensure_music_lookup_data
    from app.series_index import build_series_catalog

    ensure_music_lookup_data(db)
    continents = [
        {"id": c.con_id, "name": c.con_name}
        for c in db.scalars(select(Continent).order_by(Continent.con_name)).all()
        if c.con_name and c.con_id != 1007
    ]

    # Movies (300) + Series (400) genres — not music (200)
    by_bucket: dict[str, list[dict]] = {"Movies": [], "Series": []}
    for g in db.scalars(
        select(Genre)
        .where(Genre.gen_media_type_id.in_([300, 400]))
        .order_by(Genre.gen_name)
    ).all():
        if not g.gen_name or not g.gen_name.strip():
            continue
        bucket = "Series" if g.gen_media_type_id == 400 else "Movies"
        by_bucket[bucket].append({"id": g.gen_id, "name": g.gen_name})
    subgenre_groups = [
        {"genre": label, "items": items}
        for label, items in by_bucket.items()
        if items
    ]

    catalog = build_series_catalog()
    decades: set[int] = set(decade_options())
    for f in catalog.get("franchises") or []:
        for s in f.get("subseries") or []:
            iso = s.get("date_iso") or ""
            if len(iso) >= 4 and iso[:4].isdigit():
                decades.add((int(iso[:4]) // 10) * 10)

    return {
        "continents": continents,
        "country_groups": all_country_groups(db),
        "subgenre_groups": subgenre_groups,
        "decades": sorted(decades),  # ascending: 1950s → …
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
        origin_city=body.get("origin_city"),
        country_id=body.get("country_id"),
        activity_start=body.get("activity_start"),
        activity_end=body.get("activity_end"),
        publishers=body.get("publishers"),
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
