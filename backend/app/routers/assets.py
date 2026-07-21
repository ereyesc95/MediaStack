from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.config import settings
from app.paths import DATA_DIR, PROJECT_ROOT

router = APIRouter(prefix="/api", tags=["assets"])

# Flat layout: assets/{media,icons,playlists,...} (formerly assets/...)
ASSETS_DIR = PROJECT_ROOT / "assets"
LEGACY_SYSTEM_DIR = ASSETS_DIR / "system"
MEDIA_SLUGS = ("music", "series", "movies", "books", "games")
PANE_SLUGS = ("pane-on-repeat", "pane-icons", "pane-vibes", "pane-global")
NESTED_PREFIXES = ("continent", "genre", "subgenre", "decade")
DATA_FILE_PREFIXES = ("people", "links")


def _first_existing(base: Path, stem: str) -> Path | None:
    for ext in (".png", ".jpg", ".webp", ".svg"):
        path = base / f"{stem}{ext}"
        if path.is_file():
            return path
    return None


def _stem(name: str) -> str:
    for ext in (".png", ".jpg", ".webp"):
        if name.lower().endswith(ext):
            return name[: -len(ext)]
    return name


def _resolve_under(root: Path, slug: str) -> Path | None:
    slug = slug.strip("/")
    if not slug or not root.is_dir():
        return None

    if "/" in slug:
        folder, name = slug.split("/", 1)
        stem = _stem(name)
        if folder == "media":
            return _first_existing(root / "media", stem)
        if folder == "icons":
            return _first_existing(root / "icons", stem)
        if folder == "playlists":
            return _first_existing(root / "playlists", stem)
        if folder == "labels":
            return _first_existing(root / "labels", stem)
        if folder == "default":
            return _first_existing(root / "default", stem)
        if folder in NESTED_PREFIXES:
            return _first_existing(root / folder, stem)

    if slug in MEDIA_SLUGS:
        found = _first_existing(root / "media", slug)
        if found:
            return found

    if slug in PANE_SLUGS:
        found = _first_existing(root / "icons", slug)
        if found:
            return found

    nested = slug.replace("_", "-").split("-", 1)
    if len(nested) == 2 and nested[0] in NESTED_PREFIXES:
        folder, name = nested
        found = _first_existing(root / folder, name)
        if found:
            return found

    return _first_existing(root, slug)


def _resolve_asset_path(slug: str) -> Path | None:
    found = _resolve_under(ASSETS_DIR, slug)
    if found:
        return found
    return _resolve_under(LEGACY_SYSTEM_DIR, slug)


@router.get("/assets/{slug:path}")
def asset_file(slug: str):
    # Accept legacy /api/assets/system/... as well as /api/assets/...
    cleaned = slug[7:] if slug.startswith("system/") else slug
    path = _resolve_asset_path(cleaned)
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


@router.get("/data/file")
def data_file(path: str = Query(..., min_length=1)):
    """Serve complementary resources under data/people and data/links."""
    rel = path.replace("\\", "/").lstrip("/")
    top = rel.split("/", 1)[0].casefold()
    if top not in DATA_FILE_PREFIXES:
        raise HTTPException(403, "Invalid path")
    root = DATA_DIR.resolve()
    target = (root / rel).resolve()
    if not str(target).startswith(str(root)):
        raise HTTPException(403, "Invalid path")
    if not target.is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(target)
