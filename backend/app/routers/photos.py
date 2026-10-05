"""Photos module — year folders under Photos/YYYY/ with optional subfolders."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends

from app.config import settings
from app.deps import get_current_user
from app.media_item_overview import _file_url
from app.models import User

router = APIRouter(prefix="/api/photos", tags=["photos"])

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v"}


def _item_from_file(f: Path, year: str, subfolder: str, root: Path) -> dict | None:
    if not f.is_file():
        return None
    ext = f.suffix.lower()
    if ext not in IMAGE_EXTS and ext not in VIDEO_EXTS:
        return None
    url = _file_url(f, root)
    kind = "video" if ext in VIDEO_EXTS else "image"
    rel_id = (
        f"{year}/{subfolder}/{f.name}"
        if subfolder != "General"
        else f"{year}/{f.name}"
    )
    return {
        "id": rel_id,
        "url": url,
        "thumb_url": url if kind == "image" else None,
        "title": f.stem,
        "kind": kind,
        "subfolder": subfolder,
    }


@router.get("/years")
def list_photo_years(_user: User = Depends(get_current_user)):
    root = Path(settings.media_root or "")
    photos = root / "Photos"
    if not photos.is_dir():
        return {"years": []}
    years: list[dict] = []
    try:
        year_dirs = sorted(
            (p for p in photos.iterdir() if p.is_dir() and p.name.isdigit()),
            key=lambda p: p.name,
            reverse=True,
        )
    except OSError:
        return {"years": []}
    for yd in year_dirs:
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
            continue
        # Subfolders → General first (root-level files), then named folders.
        tabs: list[str] = []
        if subfolder_names:
            tabs.append("General")
            tabs.extend(sorted(subfolder_names, key=lambda s: s.casefold()))
        years.append(
            {
                "year": yd.name,
                "items": items,
                "subfolders": tabs,
                "has_images": any(i["kind"] == "image" for i in items),
                "has_videos": any(i["kind"] == "video" for i in items),
            }
        )
    return {"years": years}
