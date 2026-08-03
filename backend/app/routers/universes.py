"""Shared universe API (Movies + Series)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import crud
from app.deps import require_admin
from app.database import get_db
from app.universes import (
    ART_KINDS,
    create_universe,
    expand_universe_cards,
    get_universe,
    landing_franchise,
    link_franchise,
    list_universes,
    pull_tmdb_portrait,
    save_universe_art_bytes,
    unlink_franchise,
    universe_for_franchise,
    update_universe,
)

router = APIRouter(prefix="/api/universes", tags=["universes"])


class CreateUniverseBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    overview: str | None = None


class LinkMemberBody(BaseModel):
    module: str
    slug: str


class OverviewBody(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    overview: str | None = None


@router.get("")
def api_list_universes(db: Session = Depends(get_db)):
    return {"universes": list_universes(db)}


@router.post("")
def api_create_universe(
    body: CreateUniverseBody,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    try:
        row = create_universe(db, name=body.name, overview=body.overview)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return get_universe(db, row.uni_id)


@router.get("/lookup")
def api_lookup_universe(
    module: str = Query(...),
    slug: str = Query(...),
    db: Session = Depends(get_db),
):
    if module not in ("movies", "series"):
        raise HTTPException(400, "module must be movies or series")
    data = universe_for_franchise(db, module, slug)  # type: ignore[arg-type]
    return {"universe": data}


@router.get("/{universe_id}")
def api_get_universe(universe_id: int, db: Session = Depends(get_db)):
    data = get_universe(db, universe_id)
    if not data:
        raise HTTPException(404, "Universe not found")
    return data


@router.patch("/{universe_id}")
def api_patch_universe(
    universe_id: int,
    body: OverviewBody,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        data = get_universe(db, universe_id)
        if not data:
            raise HTTPException(404, "Universe not found")
        return data
    try:
        row = update_universe(
            db,
            universe_id,
            name=fields.get("name"),
            overview=fields.get("overview"),
            set_overview="overview" in fields,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not row:
        raise HTTPException(404, "Universe not found")
    return get_universe(db, universe_id)


@router.get("/{universe_id}/cards")
def api_universe_cards(universe_id: int, db: Session = Depends(get_db)):
    if not get_universe(db, universe_id):
        raise HTTPException(404, "Universe not found")
    return {"items": expand_universe_cards(db, universe_id)}


@router.get("/{universe_id}/landing")
def api_universe_landing(
    universe_id: int,
    prefer_module: str = Query("movies"),
    db: Session = Depends(get_db),
):
    if prefer_module not in ("movies", "series"):
        raise HTTPException(400, "prefer_module must be movies or series")
    if not get_universe(db, universe_id):
        raise HTTPException(404, "Universe not found")
    landing = landing_franchise(db, universe_id, prefer_module)  # type: ignore[arg-type]
    if not landing:
        raise HTTPException(404, "Universe has no members")
    return landing


@router.post("/{universe_id}/members")
def api_link_member(
    universe_id: int,
    body: LinkMemberBody,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    try:
        return link_franchise(
            db,
            universe_id=universe_id,
            module=body.module,  # type: ignore[arg-type]
            slug=body.slug,
            source="manual",
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.delete("/{universe_id}/members")
def api_unlink_member(
    universe_id: int,
    module: str = Query(...),
    slug: str = Query(...),
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    if module not in ("movies", "series"):
        raise HTTPException(400, "module must be movies or series")
    unlink_franchise(
        db, module=module, slug=slug, universe_id=universe_id  # type: ignore[arg-type]
    )
    return {"ok": True}


@router.post("/{universe_id}/art")
async def api_upload_art(
    universe_id: int,
    kind: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    from app.models import Universe

    u = db.get(Universe, universe_id)
    if not u:
        raise HTTPException(404, "Universe not found")
    if kind not in ART_KINDS:
        raise HTTPException(400, f"kind must be one of {ART_KINDS}")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    suffix = ".png"
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1].lower()
    try:
        url = save_universe_art_bytes(u, kind, raw, suffix=suffix)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return get_universe(db, universe_id) | {"uploaded": kind, "url": url}


@router.post("/{universe_id}/tmdb-portrait")
async def api_tmdb_portrait(
    universe_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    api_key = crud.get_tmdb_key(db)
    if not api_key:
        raise HTTPException(400, "TMDb API key not configured")
    try:
        return await pull_tmdb_portrait(db, universe_id, api_key)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            502,
            "Couldn't fetch a cover from TMDb right now. Try again in a moment.",
        ) from exc
