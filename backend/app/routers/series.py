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
