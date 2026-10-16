"""Admin endpoints for Windows Explorer folder icons (desktop.ini + folder.ico)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.folder_icons import (
    count_existing_icos,
    ensure_ini_tree,
    ensure_media_module_roots,
    generate_icons_tree,
    resolve_artist_folder,
    resolve_franchise_folder,
)
from app.models import Band, User

router = APIRouter(prefix="/api/folder-icons", tags=["folder-icons"])


class FranchiseIconBody(BaseModel):
    module: str = Field(..., description="series | movies | books | games")
    franchise_id: str
    folder_path: str | None = None
    overwrite: bool = False


def _band_folder(band_id: int, db: Session):
    band = db.get(Band, band_id)
    if not band:
        raise HTTPException(404, "Artist not found")
    name = (band.bnd_name or "").strip()
    if not name:
        raise HTTPException(400, "Artist has no name")
    folder = resolve_artist_folder(name)
    if not folder:
        raise HTTPException(404, "Local artist folder not found")
    return band, folder


@router.get("/artist/{band_id}/status")
def artist_icon_status(
    band_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    _, folder = _band_folder(band_id, db)
    return {
        "ok": True,
        "path": folder.as_posix(),
        "existing_icos": count_existing_icos(folder),
    }


@router.post("/artist/{band_id}/ensure-ini")
def artist_ensure_ini(
    band_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    _, folder = _band_folder(band_id, db)
    return ensure_ini_tree(folder)


@router.post("/artist/{band_id}/generate")
def artist_generate_icons(
    band_id: int,
    overwrite: bool = Query(False),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    _, folder = _band_folder(band_id, db)
    return generate_icons_tree(folder, overwrite=overwrite)


@router.post("/franchise/status")
def franchise_icon_status(
    body: FranchiseIconBody,
    _admin: User = Depends(require_admin),
):
    folder = resolve_franchise_folder(
        body.module, body.franchise_id, body.folder_path
    )
    if not folder:
        raise HTTPException(404, "Local franchise folder not found")
    return {
        "ok": True,
        "path": folder.as_posix(),
        "existing_icos": count_existing_icos(folder),
    }


@router.post("/franchise/ensure-ini")
def franchise_ensure_ini(
    body: FranchiseIconBody,
    _admin: User = Depends(require_admin),
):
    folder = resolve_franchise_folder(
        body.module, body.franchise_id, body.folder_path
    )
    if not folder:
        raise HTTPException(404, "Local franchise folder not found")
    return ensure_ini_tree(folder)


@router.post("/franchise/generate")
def franchise_generate_icons(
    body: FranchiseIconBody,
    _admin: User = Depends(require_admin),
):
    folder = resolve_franchise_folder(
        body.module, body.franchise_id, body.folder_path
    )
    if not folder:
        raise HTTPException(404, "Local franchise folder not found")
    return generate_icons_tree(folder, overwrite=body.overwrite)


@router.post("/modules/regenerate")
def regenerate_media_module_icons(
    overwrite: bool = Query(
        True,
        description="Overwrite existing folder.ico and rewrite desktop.ini",
    ),
    _admin: User = Depends(require_admin),
):
    """Regenerate desktop.ini + folder.ico for Music/Movies/Series/Books/Games/Photos."""
    return ensure_media_module_roots(
        overwrite_ico=overwrite, force_ini=overwrite
    )
