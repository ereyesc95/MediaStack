from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import crud
from app.config import settings
from app.database import get_db
from app.deps import get_current_user, require_admin
from app.franchise_index import (
    build_franchise_index,
    load_franchise_index,
    normalize_franchise_slug,
    save_franchise_index,
)
from app.models import MovieWork, Series, User
from app.movies_dashboard import build_movies_dashboard
from app.movies_index import (
    build_film_detail,
    build_movies_catalog,
    build_work_detail,
    resolve_movies_path,
)
from app.movies_overview import (
    build_film_overview,
    build_movies_gallery,
    build_work_overview,
)
from app.movies_refresh import refresh_film_metadata, refresh_work_metadata
from app.universes import (
    expand_universe_cards,
    filter_similar_against_universe,
    universe_for_franchise,
)
from app.schemas import MovieListOut

router = APIRouter(prefix="/api/movies", tags=["movies"])


def _franchise_media_items(work_id: str, kind: str) -> list[dict]:
    slug = normalize_franchise_slug(work_id) or work_id.casefold()
    index = load_franchise_index()
    root = Path(settings.media_root or "")
    if index is None and root.is_dir():
        index = build_franchise_index(root)
        save_franchise_index(index)
    items: list[dict] = []
    bucket = index.franchises.get(slug) if index else None
    if not bucket:
        return items
    for entry in bucket.entries:
        if entry.kind != kind:
            continue
        items.append(
            {
                "id": entry.path,
                "title": entry.title or entry.franchise_display,
                "date_iso": entry.date_iso,
                "path": entry.path,
                "cover_url": None,
                "navigate_franchise_id": slug,
                "open_mode": kind if kind != "movie" else "movies",
            }
        )
    return items


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
def movies_catalog(db: Session = Depends(get_db)):
    try:
        from app.movies_catalog_meta import enrich_movies_catalog

        return enrich_movies_catalog(db, build_movies_catalog())
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("/filters/options")
def movies_filter_options(db: Session = Depends(get_db)):
    """Catalog filter options for Movies home/catalog panes."""
    from app.movies_catalog_meta import build_movies_filter_options

    return build_movies_filter_options(db)


@router.get("/publishers")
def movies_publishers(db: Session = Depends(get_db)):
    """Unique publisher names recorded in Series and MovieWork metadata."""
    publishers: dict[str, str] = {}

    def add(values) -> None:
        if isinstance(values, str):
            values = values.replace(",", ";").split(";")
        if not isinstance(values, list):
            return
        for value in values:
            name = str(value).strip()
            if name:
                publishers.setdefault(name.casefold(), name)

    for row in db.scalars(select(Series)).all():
        add(row.ser_publishers)
    for row in db.scalars(select(MovieWork)).all():
        try:
            meta = json.loads(row.mwk_metadata_json or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(meta, dict):
            continue
        add(meta.get("publishers"))
        films = meta.get("films")
        if isinstance(films, dict):
            for film_meta in films.values():
                if isinstance(film_meta, dict):
                    add(film_meta.get("publishers"))

    return {"publishers": sorted(publishers.values(), key=str.casefold)}


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
def movies_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Home panes: On Repeat, Icons, Film Vibes, Global Acts."""
    try:
        return build_movies_dashboard(db, user.usr_id)
    except Exception:
        return {
            "top_episodes": [],
            "top_series": [],
            "top_genres": [],
            "top_countries": [],
            "franchise_count": 0,
            "film_count": 0,
            "top_franchises": [],
            "top_films": [],
        }


@router.get("/franchises/{work_id}")
def movies_franchise(work_id: str, db: Session = Depends(get_db)):
    try:
        detail = build_work_detail(work_id)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    if not detail:
        raise HTTPException(404, "Franchise not found")
    universe = universe_for_franchise(db, "movies", detail.get("slug") or work_id)
    detail["universe"] = universe
    if universe:
        detail["universe_cards"] = expand_universe_cards(db, universe["id"])
    return detail


@router.get("/franchises/{work_id}/overview")
def movies_franchise_overview(
    work_id: str,
    orientation: str = Query("portrait"),
    db: Session = Depends(get_db),
):
    overview = build_work_overview(db, work_id, orientation=orientation)
    if not overview:
        raise HTTPException(404, "Franchise not found")
    return overview


@router.post("/franchises/{work_id}/refresh-metadata")
async def movies_refresh_work_metadata(
    work_id: str,
    include_bio: bool = Query(True),
    refresh_films: bool = Query(True),
    db: Session = Depends(get_db),
):
    result = await refresh_work_metadata(
        db,
        work_id,
        include_bio=include_bio,
        refresh_films=refresh_films,
    )
    if not result.get("ok"):
        raise HTTPException(400, result.get("error") or "Refresh failed")
    return result


@router.get("/franchises/{work_id}/media/series")
def movies_franchise_series(work_id: str):
    items = _franchise_media_items(work_id, "series")
    return {"items": items, "count": len(items)}


@router.get("/franchises/{work_id}/media/audio")
def movies_franchise_audio(work_id: str, db: Session = Depends(get_db)):
    """Aggregate Audio/[Audio] releases at a movie work and all of its films."""
    detail = build_work_detail(work_id)
    if not detail:
        raise HTTPException(404, "Franchise not found")
    from app.series_audio import scan_folder_audio

    folder_paths = [detail.get("folder_path") or ""]
    folder_paths.extend(
        film.get("folder_path") or ""
        for film in detail.get("films") or []
        if isinstance(film, dict)
    )
    releases: list[dict] = []
    seen: set[str] = set()
    for folder_path in folder_paths:
        for release in scan_folder_audio(db, folder_path).get("releases") or []:
            key = str(release.get("folder_path") or release.get("id") or "").casefold()
            if key and key in seen:
                continue
            if key:
                seen.add(key)
            releases.append(release)
    categories = sorted(
        {r.get("category") for r in releases if r.get("category")}
    )
    return {
        "releases": releases,
        "categories": categories,
        "band_id": None,
        "source": "movies",
    }


@router.get("/films/{film_id}/media/audio")
def movies_film_audio(film_id: str, db: Session = Depends(get_db)):
    """Audio under the film folder's [Audio] bucket — movie-centered, not Series."""
    detail = build_film_detail(film_id)
    if not detail:
        raise HTTPException(404, "Film not found")
    from app.series_audio import scan_folder_audio

    return scan_folder_audio(db, detail.get("folder_path") or "")


@router.get("/films/{film_id}/player-tracks")
def movies_film_player_tracks(film_id: str, db: Session = Depends(get_db)):
    """Playable audio tracks from a film folder's Audio/ shortcuts."""
    from app.series_extras import collect_film_audio_tracks

    tracks = collect_film_audio_tracks(db, film_id)
    return {"tracks": tracks, "count": len(tracks)}


@router.get("/franchises/{work_id}/media/library")
def movies_franchise_library(work_id: str, db: Session = Depends(get_db)):
    overview = build_work_overview(db, work_id)
    if not overview:
        raise HTTPException(404, "Franchise not found")
    return {"items": (overview.get("related") or {}).get("books") or []}


@router.get("/franchises/{work_id}/media/games")
def movies_franchise_games(work_id: str, db: Session = Depends(get_db)):
    overview = build_work_overview(db, work_id)
    if not overview:
        raise HTTPException(404, "Franchise not found")
    return {"items": (overview.get("related") or {}).get("games") or []}


@router.get("/franchises/{work_id}/media/movies")
def movies_franchise_movies(work_id: str, db: Session = Depends(get_db)):
    overview = build_work_overview(db, work_id)
    if not overview:
        raise HTTPException(404, "Franchise not found")
    films = overview.get("films") or overview.get("subseries") or []
    return {"items": films, "count": len(films)}


@router.get("/gallery")
def movies_gallery(path: str = Query(..., min_length=1)):
    return build_movies_gallery(path)


@router.get("/films/{film_id}")
def movies_film(film_id: str, db: Session = Depends(get_db)):
    try:
        detail = build_film_detail(film_id)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    if not detail:
        raise HTTPException(404, "Film not found")
    work = detail.get("work") or {}
    detail["universe"] = universe_for_franchise(db, "movies", work.get("id") or "")
    return detail


@router.get("/films/{film_id}/overview")
def movies_film_overview(
    film_id: str,
    orientation: str = Query("portrait"),
    db: Session = Depends(get_db),
):
    overview = build_film_overview(db, film_id, orientation=orientation)
    if not overview:
        raise HTTPException(404, "Film not found")
    return overview


@router.post("/films/{film_id}/refresh-metadata")
async def movies_refresh_film_metadata(
    film_id: str,
    include_bio: bool = Query(True),
    db: Session = Depends(get_db),
):
    result = await refresh_film_metadata(
        db, film_id, include_bio=include_bio
    )
    if not result.get("ok"):
        raise HTTPException(400, result.get("error") or "Refresh failed")
    return result


@router.get("/films/{film_id}/trailer")
def movies_film_trailer_get(film_id: str, db: Session = Depends(get_db)):
    from app.movies_admin import get_film_trailer_db

    url = get_film_trailer_db(db, film_id)
    if url is None:
        # Film exists check — 404 if unknown id
        from app.movies_index import find_film_dir

        if not find_film_dir(film_id):
            raise HTTPException(404, "Film not found")
    return {"trailer_url": url}


@router.patch("/films/{film_id}/about")
def movies_film_patch_about(
    film_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.movies_admin import patch_film_about

    try:
        result = patch_film_about(
            db,
            film_id,
            bio=body.get("bio"),
            writers=body.get("writers"),
            publishers=body.get("publishers"),
            country_id=body.get("country_id"),
            languages=body.get("languages"),
            genres=body.get("genres"),
            activity_start=body.get("activity_start"),
            activity_end=body.get("activity_end"),
            directors=body.get("directors"),
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return result


@router.put("/films/{film_id}/trailer")
def movies_film_trailer_put(
    film_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.movies_admin import save_film_trailer_db

    url = body.get("trailer_url") if isinstance(body, dict) else None
    try:
        saved = save_film_trailer_db(db, film_id, url)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"trailer_url": saved}


@router.post("/films/{film_id}/cast")
def movies_film_add_cast(
    film_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.movies_admin import add_film_cast_member

    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name required")
    kind = body.get("kind") or body.get("bucket") or "characters"
    try:
        member = add_film_cast_member(
            db,
            film_id,
            kind=kind,
            name=name,
            character=body.get("character"),
            photo_url=body.get("photo_url"),
            character_photo_url=body.get("character_photo_url"),
            roles=body.get("roles"),
            language=body.get("language"),
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return member


@router.patch("/films/{film_id}/cast/{member_id}")
def movies_film_patch_cast(
    film_id: str,
    member_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.movies_admin import patch_film_cast_member

    kind = body.get("kind") or body.get("bucket") or "characters"
    try:
        member = patch_film_cast_member(
            db,
            film_id,
            member_id,
            kind=kind,
            name=body.get("name"),
            character=body.get("character"),
            photo_url=body.get("photo_url"),
            actor_photo_url=body.get("actor_photo_url"),
            actors=body.get("actors"),
            roles=body.get("roles"),
            language=body.get("language"),
            delete=bool(body.get("delete")),
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    if not member:
        raise HTTPException(404, "Cast member not found")
    return member
