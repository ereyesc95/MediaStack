"""Shared universe API (Movies + Series)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import crud
from app.deps import get_nsfw_unlocked, require_admin
from app.database import get_db
from app.universes import (
    ART_KINDS,
    apply_universe_art_paths,
    build_universe_hub,
    create_universe,
    delete_universe,
    expand_universe_cards,
    get_universe,
    landing_franchise,
    link_franchise,
    list_universes,
    pick_media_image_path,
    pull_tmdb_portrait,
    set_universe_art_path,
    unlink_franchise,
    update_universe,
)

router = APIRouter(prefix="/api/universes", tags=["universes"])


class CreateUniverseBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    overview: str | None = None
    portrait_path: str | None = None
    landscape_path: str | None = None
    banner_path: str | None = None
    logo_path: str | None = None


class LinkMemberBody(BaseModel):
    module: str
    slug: str
    """Franchise / work id. When leaf_id is omitted, bulk-adds all children + sync."""
    leaf_id: str | None = None


class OverviewBody(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    overview: str | None = None
    portrait_path: str | None = None
    landscape_path: str | None = None
    banner_path: str | None = None
    logo_path: str | None = None


class SetArtPathBody(BaseModel):
    kind: str
    """Media-relative or absolute path under Media/. Null clears the slot."""
    path: str | None = None


@router.get("")
def api_list_universes(
    module: str | None = Query(None),
    db: Session = Depends(get_db),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    prefer: str | None = None
    if module in ("movies", "series", "books", "games"):
        prefer = module
    return {
        "universes": list_universes(
            db, prefer, nsfw_unlocked=nsfw_unlocked
        )
    }  # type: ignore[arg-type]


@router.post("")
def api_create_universe(
    body: CreateUniverseBody,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    try:
        row = create_universe(
            db,
            name=body.name,
            overview=body.overview,
            portrait_path=body.portrait_path,
            landscape_path=body.landscape_path,
            banner_path=body.banner_path,
            logo_path=body.logo_path,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return get_universe(db, row.uni_id)


@router.post("/pick-media-image")
async def api_pick_media_image(
    kind: str | None = Query(None),
    _admin=Depends(require_admin),
):
    """Native dialog: pick an existing image inside Media/; return relative path + URL."""
    import asyncio

    label = (kind or "image").strip() or "image"
    try:
        result = await asyncio.to_thread(
            lambda: pick_media_image_path(title=f"Choose universe {label}")
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return result


@router.get("/lookup")
def api_lookup_universe(
    module: str = Query(...),
    slug: str = Query(...),
    leaf_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    if module not in ("movies", "series", "books", "games"):
        raise HTTPException(400, "module must be movies, series, books, or games")
    from app.universes import (
        franchise_has_sync,
        universes_for_franchise_scope,
        universes_for_leaf,
    )

    if leaf_id:
        # Leaf scope: explicit leaf rows + franchise sync coverage.
        many = universes_for_leaf(db, module, slug, leaf_id)  # type: ignore[arg-type]
    else:
        # Franchise scope: only whole-franchise membership (sync or all leaves).
        # Partial leaf-only memberships must not block franchise add / show as member.
        many = universes_for_franchise_scope(db, module, slug)  # type: ignore[arg-type]
    data = many[0] if many else None
    synced = []
    for u in many:
        if franchise_has_sync(db, module, slug, u["id"]):  # type: ignore[arg-type]
            synced.append(u["id"])
    return {
        "universe": data,
        "universes": many,
        "leaf_id": leaf_id,
        "sync_universe_ids": synced,
        "scope": "leaf" if leaf_id else "franchise",
    }


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
        if not row:
            raise HTTPException(404, "Universe not found")
        art_keys = (
            "portrait_path",
            "landscape_path",
            "banner_path",
            "logo_path",
        )
        if any(k in fields for k in art_keys):
            apply_universe_art_paths(
                db,
                row,
                portrait_path=fields.get("portrait_path"),
                landscape_path=fields.get("landscape_path"),
                banner_path=fields.get("banner_path"),
                logo_path=fields.get("logo_path"),
                set_portrait="portrait_path" in fields,
                set_landscape="landscape_path" in fields,
                set_banner="banner_path" in fields,
                set_logo="logo_path" in fields,
            )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return get_universe(db, universe_id)


@router.delete("/{universe_id}")
def api_delete_universe(
    universe_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    try:
        delete_universe(db, universe_id)
    except ValueError as exc:
        msg = str(exc)
        if msg == "Universe not found":
            raise HTTPException(404, msg) from exc
        raise HTTPException(400, msg) from exc
    return {"ok": True}


@router.get("/{universe_id}/cards")
def api_universe_cards(universe_id: int, db: Session = Depends(get_db)):
    if not get_universe(db, universe_id):
        raise HTTPException(404, "Universe not found")
    return {"items": expand_universe_cards(db, universe_id)}


@router.get("/{universe_id}/hub")
def api_universe_hub(
    universe_id: int,
    db: Session = Depends(get_db),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    hub = build_universe_hub(db, universe_id, nsfw_unlocked=nsfw_unlocked)
    if not hub:
        raise HTTPException(404, "Universe not found")
    return hub


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
            leaf_id=body.leaf_id,
            source="manual",
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.delete("/{universe_id}/members")
def api_unlink_member(
    universe_id: int,
    module: str = Query(...),
    slug: str = Query(...),
    leaf_id: str | None = Query(None),
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    if module not in ("movies", "series", "books", "games"):
        raise HTTPException(400, "module must be movies, series, books, or games")
    unlink_franchise(
        db,
        module=module,  # type: ignore[arg-type]
        slug=slug,
        universe_id=universe_id,
        leaf_id=leaf_id,
    )
    return {"ok": True}


@router.post("/{universe_id}/art")
def api_set_art_path(
    universe_id: int,
    body: SetArtPathBody,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Point a universe art slot at an existing Media/ file (or clear it)."""
    if body.kind not in ART_KINDS:
        raise HTTPException(400, f"kind must be one of {ART_KINDS}")
    try:
        set_universe_art_path(db, universe_id, kind=body.kind, path=body.path)
    except ValueError as exc:
        msg = str(exc)
        if msg == "Universe not found":
            raise HTTPException(404, msg) from exc
        raise HTTPException(400, msg) from exc
    return get_universe(db, universe_id) | {
        "uploaded": body.kind,
        "path": body.path,
    }


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
