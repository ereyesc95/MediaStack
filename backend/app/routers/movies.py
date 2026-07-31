from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.movies_index import (
    build_film_detail,
    build_movies_catalog,
    build_movies_dashboard,
    build_work_detail,
    resolve_movies_path,
)
from app.movies_universes import (
    link_work_to_universe,
    list_universes,
    seed_universe_from_tmdb_collection,
    universe_for_work,
    unlink_work_from_universe,
)
from app.schemas import MovieListOut

router = APIRouter(prefix="/api/movies", tags=["movies"])


@router.get("", response_model=MovieListOut)
def list_movies(
    db: Session = Depends(get_db),
    search: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(48, ge=1, le=200),
):
    items, total = crud.list_movies(db, search=search, page=page, page_size=page_size)
    return MovieListOut(items=items, total=total, page=page, page_size=page_size)


@router.get("/catalog")
def movies_catalog():
    try:
        return build_movies_catalog()
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("/resolve")
def movies_resolve_path(path: str = Query(..., min_length=1)):
    try:
        hit = resolve_movies_path(path)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    if not hit:
        raise HTTPException(404, "Path not found under Movies/")
    return hit


@router.get("/dashboard")
def movies_dashboard():
    try:
        return build_movies_dashboard()
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("/universes")
def movies_universes(db: Session = Depends(get_db)):
    return {"universes": list_universes(db)}


@router.post("/universes/seed-collection")
async def movies_seed_universe(
    collection_id: int = Query(..., ge=1),
    work_slug: str | None = None,
    db: Session = Depends(get_db),
):
    api_key = crud.get_tmdb_key(db)
    if not api_key:
        raise HTTPException(400, "TMDb API key not configured")
    try:
        return await seed_universe_from_tmdb_collection(
            db,
            collection_id=collection_id,
            api_key=api_key,
            local_work_slug=work_slug,
        )
    except Exception as exc:
        raise HTTPException(502, f"TMDb collection seed failed: {exc}") from exc


@router.post("/universes/{universe_id}/members")
def movies_universe_add_member(
    universe_id: int,
    work_slug: str = Query(...),
    db: Session = Depends(get_db),
):
    link_work_to_universe(
        db, universe_id=universe_id, work_slug=work_slug, source="manual"
    )
    return {"ok": True}


@router.delete("/universes/{universe_id}/members")
def movies_universe_remove_member(
    universe_id: int,
    work_slug: str = Query(...),
    db: Session = Depends(get_db),
):
    unlink_work_from_universe(db, universe_id=universe_id, work_slug=work_slug)
    return {"ok": True}


@router.get("/franchises/{work_id}")
def movies_franchise(work_id: str, db: Session = Depends(get_db)):
    try:
        detail = build_work_detail(work_id)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    if not detail:
        raise HTTPException(404, "Franchise not found")
    universe = universe_for_work(db, detail.get("slug") or work_id)
    detail["universe"] = universe
    return detail


@router.get("/franchises/{work_id}/media/series")
def movies_franchise_series(work_id: str):
    """Related series via franchise index (same slug)."""
    from pathlib import Path

    from app.config import settings
    from app.franchise_index import (
        build_franchise_index,
        load_franchise_index,
        normalize_franchise_slug,
        save_franchise_index,
    )

    slug = normalize_franchise_slug(work_id) or work_id.casefold()
    index = load_franchise_index()
    root = Path(settings.media_root or "")
    if index is None and root.is_dir():
        index = build_franchise_index(root)
        save_franchise_index(index)
    series = []
    bucket = index.franchises.get(slug) if index else None
    if bucket:
        for entry in bucket.entries:
            if entry.kind == "series":
                series.append(
                    {
                        "id": entry.path,
                        "title": entry.title or entry.franchise_display,
                        "date_iso": entry.date_iso,
                        "path": entry.path,
                        "cover_url": None,
                        "navigate_franchise_id": slug,
                        "open_mode": "series",
                    }
                )
    return {"items": series, "count": len(series)}


@router.get("/films/{film_id}")
def movies_film(film_id: str, db: Session = Depends(get_db)):
    try:
        detail = build_film_detail(film_id)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    if not detail:
        raise HTTPException(404, "Film not found")
    work = detail.get("work") or {}
    detail["universe"] = universe_for_work(db, work.get("id") or "")
    return detail


@router.post("/franchises/{work_id}/refresh-universe")
async def movies_refresh_universe(work_id: str, db: Session = Depends(get_db)):
    """Seed universe from TMDb collection matching the work name (initial pull)."""
    from app.services import tmdb

    api_key = crud.get_tmdb_key(db)
    if not api_key:
        raise HTTPException(400, "TMDb API key not configured")
    detail = build_work_detail(work_id)
    if not detail:
        raise HTTPException(404, "Franchise not found")
    name = detail.get("name") or work_id
    collection_id, collection_name = await tmdb.search_collection_id(name, api_key)
    if not collection_id:
        # Fall back: first film → belongs_to_collection
        films = detail.get("films") or []
        if films:
            title = films[0].get("title") or name
            year = None
            iso = films[0].get("date_iso") or ""
            if len(iso) >= 4 and iso[:4].isdigit():
                year = int(iso[:4])
            movie_id, _ = await tmdb.search_movie_id(title, api_key, year=year)
            if movie_id:
                movie = await tmdb.fetch_movie(movie_id, api_key)
                coll = movie.get("belongs_to_collection") or {}
                collection_id = coll.get("id")
                collection_name = coll.get("name")
    if not collection_id:
        raise HTTPException(404, f"No TMDb collection found for {name!r}")
    return await seed_universe_from_tmdb_collection(
        db,
        collection_id=int(collection_id),
        api_key=api_key,
        local_work_slug=detail.get("slug") or work_id,
    )
