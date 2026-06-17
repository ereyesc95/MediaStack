from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.config import settings
from app.paths import PROJECT_ROOT

router = APIRouter(prefix="/api", tags=["assets"])

SYSTEM_DIR = PROJECT_ROOT / "assets" / "system"
MEDIA_SLUGS = ("music", "series", "movies", "books", "games")
PANE_SLUGS = ("pane-on-repeat", "pane-icons", "pane-vibes", "pane-global")
NESTED_PREFIXES = ("continent", "genre", "subgenre", "decade")


def _first_existing(base: Path, stem: str) -> Path | None:
    for ext in (".png", ".jpg", ".webp"):
        path = base / f"{stem}{ext}"
        if path.is_file():
            return path
    return None


def _stem(name: str) -> str:
    for ext in (".png", ".jpg", ".webp"):
        if name.lower().endswith(ext):
            return name[: -len(ext)]
    return name


def _resolve_system_path(slug: str) -> Path | None:
    slug = slug.strip("/")
    if not slug:
        return None

    if "/" in slug:
        folder, name = slug.split("/", 1)
        stem = _stem(name)
        if folder == "media":
            return _first_existing(SYSTEM_DIR / "media", stem)
        if folder == "icons":
            return _first_existing(SYSTEM_DIR / "icons", stem)
        if folder == "playlists":
            return _first_existing(SYSTEM_DIR / "playlists", stem)
        if folder == "labels":
            return _first_existing(SYSTEM_DIR / "labels", stem)
        if folder == "default":
            return _first_existing(SYSTEM_DIR / "default", stem)
        if folder in NESTED_PREFIXES:
            return _first_existing(SYSTEM_DIR / folder, stem)

    if slug in MEDIA_SLUGS:
        found = _first_existing(SYSTEM_DIR / "media", slug)
        if found:
            return found

    if slug in PANE_SLUGS:
        found = _first_existing(SYSTEM_DIR / "icons", slug)
        if found:
            return found

    nested = slug.replace("_", "-").split("-", 1)
    if len(nested) == 2 and nested[0] in NESTED_PREFIXES:
        folder, name = nested
        found = _first_existing(SYSTEM_DIR / folder, name)
        if found:
            return found

    return _first_existing(SYSTEM_DIR, slug)


@router.get("/assets/system/{slug:path}")
def system_asset(slug: str):
    path = _resolve_system_path(slug)
    if path:
        return FileResponse(path)
    raise HTTPException(404, "Asset not found")


@router.get("/media/file")
def media_file(path: str = Query(..., min_length=1)):
    if not settings.media_root:
        raise HTTPException(404, "MEDIASTACK_MEDIA_ROOT not set")
    root = Path(settings.media_root).resolve()
    target = (root / path.replace("\\", "/")).resolve()
    if not str(target).startswith(str(root)):
        raise HTTPException(403, "Invalid path")
    if not target.is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(target)
