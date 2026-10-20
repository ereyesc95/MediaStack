"""Photos module — year folders under Photos/YYYY/ plus NSFW Exclusive/{person}/."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, get_nsfw_unlocked, require_admin
from app.media_item_overview import _file_url
from app.models import User

router = APIRouter(prefix="/api/photos", tags=["photos"])

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v"}
EXCLUSIVE_YEAR = "Exclusive"


def _photos_root() -> Path | None:
    root = Path(settings.media_root or "")
    if not root.is_dir():
        return None
    photos = root / "Photos"
    return photos if photos.is_dir() or root.is_dir() else None


def _item_from_file(
    f: Path, year: str, subfolder: str, root: Path
) -> dict | None:
    if not f.is_file():
        return None
    ext = f.suffix.lower()
    if ext not in IMAGE_EXTS and ext not in VIDEO_EXTS:
        return None
    url = _file_url(f, root)
    kind = "video" if ext in VIDEO_EXTS else "image"
    rel_id = (
        f"{year}/{subfolder}/{f.name}"
        if subfolder and subfolder != "General"
        else f"{year}/{f.name}"
    )
    return {
        "id": rel_id,
        "url": url,
        "thumb_url": url if kind == "image" else None,
        "title": f.stem,
        "kind": kind,
        "subfolder": subfolder or "General",
    }


def _scan_year_dir(yd: Path, root: Path) -> dict | None:
    items: list[dict] = []
    subfolder_names: list[str] = []
    try:
        entries = sorted(yd.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        entries = []
    for entry in entries:
        if entry.is_file():
            it = _item_from_file(entry, yd.name, "General", root)
            if it:
                items.append(it)
        elif entry.is_dir() and not entry.name.startswith("."):
            subfolder_names.append(entry.name)
            try:
                nested = sorted(entry.iterdir(), key=lambda p: p.name.casefold())
            except OSError:
                nested = []
            for f in nested:
                it = _item_from_file(f, yd.name, entry.name, root)
                if it:
                    items.append(it)
    if not items:
        return None
    tabs: list[str] = []
    if subfolder_names:
        tabs.append("General")
        tabs.extend(sorted(subfolder_names, key=lambda s: s.casefold()))
    return {
        "year": yd.name,
        "items": items,
        "subfolders": tabs,
        "has_images": any(i["kind"] == "image" for i in items),
        "has_videos": any(i["kind"] == "video" for i in items),
        "is_exclusive": False,
    }


def _scan_exclusive(exclusive: Path, root: Path) -> dict | None:
    """Exclusive/{person}/media — person folders become subfolders."""
    items: list[dict] = []
    person_names: list[str] = []
    try:
        people = sorted(
            (p for p in exclusive.iterdir() if p.is_dir() and not p.name.startswith(".")),
            key=lambda p: p.name.casefold(),
        )
    except OSError:
        people = []
    for person in people:
        person_names.append(person.name)
        try:
            nested = sorted(person.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            nested = []
        for f in nested:
            it = _item_from_file(f, EXCLUSIVE_YEAR, person.name, root)
            if it:
                items.append(it)
        # Also allow one more nesting level if files live deeper.
        for child in nested:
            if not child.is_dir():
                continue
            try:
                deeper = sorted(child.iterdir(), key=lambda p: p.name.casefold())
            except OSError:
                deeper = []
            for f in deeper:
                it = _item_from_file(
                    f, EXCLUSIVE_YEAR, f"{person.name}/{child.name}", root
                )
                if it:
                    items.append(it)
    if not items:
        return None
    return {
        "year": EXCLUSIVE_YEAR,
        "items": items,
        "subfolders": sorted(person_names, key=lambda s: s.casefold()),
        "has_images": any(i["kind"] == "image" for i in items),
        "has_videos": any(i["kind"] == "video" for i in items),
        "is_exclusive": True,
    }


@router.get("/years")
def list_photo_years(
    _user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    root = Path(settings.media_root or "")
    photos = root / "Photos"
    if not photos.is_dir():
        return {"years": [], "exclusive_available": False}

    exclusive_available = False
    if nsfw_unlocked:
        from app.folder_icons import ensure_exclusive_folder

        exclusive = ensure_exclusive_folder(photos / EXCLUSIVE_YEAR)
        exclusive_available = True
        # Tab only when there is media under Exclusive/{person}/.
        exclusive_bucket = _scan_exclusive(exclusive, root)
    else:
        exclusive_bucket = None

    years: list[dict] = []
    try:
        year_dirs = sorted(
            (
                p
                for p in photos.iterdir()
                if p.is_dir()
                and p.name.isdigit()
                and not p.name.startswith(".")
            ),
            key=lambda p: p.name,
            reverse=True,
        )
    except OSError:
        return {
            "years": [],
            "exclusive_available": exclusive_available,
        }

    for yd in year_dirs:
        bucket = _scan_year_dir(yd, root)
        if bucket:
            years.append(bucket)

    if exclusive_bucket:
        years.append(exclusive_bucket)
        exclusive_available = True
    elif nsfw_unlocked:
        # Folder ensured but empty — check other modules before hiding Exclusive.
        from app.exclusive_hub import build_exclusive_hub

        hub = build_exclusive_hub(ensure_photos_exclusive=False)
        exclusive_available = bool(hub.get("available"))

    return {"years": years, "exclusive_available": exclusive_available}


@router.get("/exclusive-hub")
def exclusive_hub(
    _user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    """Cross-module Exclusive media index (NSFW session required)."""
    if not nsfw_unlocked:
        return {"modules": [], "sources": [], "available": False}
    from app.exclusive_hub import build_exclusive_hub

    return build_exclusive_hub(ensure_photos_exclusive=True)


class ExclusiveLinkIn(BaseModel):
    media_type: str = "photos"
    content_type: str = "photo"
    title: str | None = None
    url: str
    entity_name: str
    entity_id: str | None = None
    franchise_name: str | None = None


class ExclusiveLinkPatch(BaseModel):
    media_type: str | None = None
    content_type: str | None = None
    title: str | None = None
    url: str | None = None
    entity_name: str | None = None
    entity_id: str | None = None
    franchise_name: str | None = None


@router.get("/exclusive-links")
def exclusive_links_list(
    media_type: str | None = None,
    entity_key: str | None = None,
    entity_name: str | None = None,
    _user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
    db: Session = Depends(get_db),
):
    if not nsfw_unlocked:
        return {"items": []}
    from app.exclusive_links import list_links

    return {
        "items": list_links(
            db,
            media_type=media_type,
            entity_key=entity_key,
            entity_name=entity_name,
        )
    }


@router.get("/exclusive-links/suggest-title")
def exclusive_links_suggest_title(
    media_type: str = "photos",
    content_type: str = "photo",
    _admin: User = Depends(require_admin),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
    db: Session = Depends(get_db),
):
    if not nsfw_unlocked:
        raise HTTPException(403, "NSFW unlock required")
    from app.exclusive_links import suggest_title

    return {"title": suggest_title(db, media_type=media_type, content_type=content_type)}


@router.get("/exclusive-links/entities")
def exclusive_links_entities(
    media_type: str = "photos",
    _admin: User = Depends(require_admin),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
    db: Session = Depends(get_db),
):
    if not nsfw_unlocked:
        raise HTTPException(403, "NSFW unlock required")
    from app.exclusive_links import list_entities

    return {"items": list_entities(db, media_type)}


@router.post("/exclusive-links")
def exclusive_links_create(
    body: ExclusiveLinkIn,
    _admin: User = Depends(require_admin),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
    db: Session = Depends(get_db),
):
    if not nsfw_unlocked:
        raise HTTPException(403, "NSFW unlock required")
    from app.exclusive_links import create_link

    try:
        return create_link(db, body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.patch("/exclusive-links/{link_id}")
def exclusive_links_patch(
    link_id: int,
    body: ExclusiveLinkPatch,
    _admin: User = Depends(require_admin),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
    db: Session = Depends(get_db),
):
    if not nsfw_unlocked:
        raise HTTPException(403, "NSFW unlock required")
    from app.exclusive_links import update_link

    try:
        return update_link(
            db, link_id, {k: v for k, v in body.model_dump().items() if v is not None}
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.delete("/exclusive-links/{link_id}")
def exclusive_links_delete(
    link_id: int,
    _admin: User = Depends(require_admin),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
    db: Session = Depends(get_db),
):
    if not nsfw_unlocked:
        raise HTTPException(403, "NSFW unlock required")
    from app.exclusive_links import delete_link

    try:
        delete_link(db, link_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"ok": True}
