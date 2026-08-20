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
NESTED_PREFIXES = ("continent", "genre", "subgenre", "decade", "labels", "links", "people", "universes", "universe")
DATA_FILE_PREFIXES = ("people", "links")


def _first_existing(base: Path, stem: str) -> Path | None:
    for ext in (".png", ".jpg", ".webp", ".svg", ".jpeg"):
        path = base / f"{stem}{ext}"
        if path.is_file():
            return path
    # Case-insensitive stem match (e.g. BMG.png ↔ bmg)
    if base.is_dir():
        want = stem.casefold()
        try:
            for f in base.iterdir():
                if not f.is_file():
                    continue
                if f.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".svg"}:
                    continue
                if f.stem.casefold() == want:
                    return f
        except OSError:
            pass
    return None


def _stem(name: str) -> str:
    for ext in (".png", ".jpg", ".webp", ".svg"):
        if name.lower().endswith(ext):
            return name[: -len(ext)]
    return name


# Legacy / alternate stems for default folder assets.
_DEFAULT_STEM_ALIASES: dict[str, tuple[str, ...]] = {
    "artists": ("placeholder - portrait", "placeholder-portrait"),
    "default artists": ("placeholder - portrait", "placeholder-portrait"),
    "placeholder - portrait": ("placeholder-portrait",),
    "placeholder - landscape": ("placeholder-landscape",),
    "placeholder-portrait": ("placeholder - portrait",),
    "placeholder-landscape": ("placeholder - landscape",),
}


def _resolve_default_asset(root: Path, name: str) -> Path | None:
    stem = _stem(name)
    candidates = (stem, *_DEFAULT_STEM_ALIASES.get(stem.casefold(), ()))
    for candidate in candidates:
        found = _first_existing(root / "default", candidate)
        if found:
            return found
    return None


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
            # playlists/system/{stem}, playlists/users/{stem}, or legacy playlists/{stem}
            playlists_root = root / "playlists"
            if "/" in name:
                sub, rest = name.split("/", 1)
                if sub in ("system", "users"):
                    found = _first_existing(playlists_root / sub, _stem(rest))
                    if found:
                        return found
            stem = _stem(name)
            for sub in ("system", "users", ""):
                base = playlists_root / sub if sub else playlists_root
                found = _first_existing(base, stem)
                if found:
                    return found
            return None
        if folder == "labels":
            return _first_existing(root / "labels", stem)
        if folder == "links":
            return _first_existing(root / "links", stem)
        if folder == "people":
            # people/{Letter}/{Name} — allow nested path after people/
            nested = root / "people" / name
            if nested.is_file():
                return nested
            return _first_existing(root / "people", stem)
        if folder in ("universes", "universe"):
            return _first_existing(root / "universes", stem)
        if folder == "default":
            return _resolve_default_asset(root, name)
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
        raise HTTPException(404, "MYSTACK_MEDIA_ROOT not set")
    root = Path(settings.media_root).resolve()
    target = (root / path.replace("\\", "/")).resolve()
    if not str(target).startswith(str(root)):
        raise HTTPException(403, "Invalid path")
    if not target.is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(target)


@router.get("/data/file")
def data_file(path: str = Query(..., min_length=1)):
    """Serve complementary resources under assets/people and assets/links.

    Also accepts legacy data/people and data/links paths.
    """
    from app.paths import ASSETS_DIR

    rel = path.replace("\\", "/").lstrip("/")
    top = rel.split("/", 1)[0].casefold()
    if top not in DATA_FILE_PREFIXES:
        raise HTTPException(403, "Invalid path")

    candidates = [
        ASSETS_DIR / rel,
        DATA_DIR / rel,
    ]
    for candidate in candidates:
        try:
            target = candidate.resolve()
        except OSError:
            continue
        if not target.is_file():
            continue
        # Must stay under assets/{top} or data/{top}
        for root in (ASSETS_DIR / top, DATA_DIR / top):
            try:
                target.relative_to(root.resolve())
                return FileResponse(target)
            except ValueError:
                continue
    raise HTTPException(404, "File not found")
