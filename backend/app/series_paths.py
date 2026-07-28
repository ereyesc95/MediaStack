"""Series folder layout helpers (Gallery/, Audio/, Episodes/, Extras/, [Artwork]/)."""
from __future__ import annotations

from pathlib import Path

from app.gallery import IMAGE_EXTS, _media_url

# Content buckets under a franchise or subseries folder
GALLERY_NAMES = ("gallery",)
COVERS_NAMES = ("covers",)
RENDERS_NAMES = ("renders",)
EXTRAS_GALLERY_NAMES = ("extras",)
AUDIO_NAMES = ("[audio]", "audio")
EXTRAS_NAMES = ("[extras]", "extras")
EPISODES_NAMES = ("episodes",)
ARTWORK_NAMES = ("[artwork]", "artwork")


def _child_named(folder: Path, names: tuple[str, ...] | frozenset[str] | set[str]) -> Path | None:
    if not folder.is_dir():
        return None
    want = {n.casefold() for n in names}
    try:
        for child in folder.iterdir():
            if child.is_dir() and child.name.casefold() in want:
                return child
    except OSError:
        return None
    return None


def find_gallery_root(folder: Path) -> Path | None:
    return _child_named(folder, GALLERY_NAMES)


def find_covers_dir(folder: Path) -> Path | None:
    """Image covers: Gallery/Covers, else [Artwork]/Artwork."""
    gal = find_gallery_root(folder)
    if gal:
        covers = _child_named(gal, COVERS_NAMES)
        if covers:
            return covers
    return _child_named(folder, ARTWORK_NAMES)


def find_renders_dir(folder: Path) -> Path | None:
    """Logos / badges / PNG renders: Gallery/Renders, else [Artwork]."""
    gal = find_gallery_root(folder)
    if gal:
        renders = _child_named(gal, RENDERS_NAMES)
        if renders:
            return renders
    return _child_named(folder, ARTWORK_NAMES)


def find_artwork_legacy(folder: Path) -> Path | None:
    """Franchise-style [Artwork] / Artwork only."""
    return _child_named(folder, ARTWORK_NAMES)


def find_audio_bucket(folder: Path) -> Path | None:
    return _child_named(folder, AUDIO_NAMES)


def find_extras_dir(folder: Path) -> Path | None:
    """Promo / OP-ED videos (not Gallery/Extras). Prefer top-level Extras/."""
    try:
        for child in folder.iterdir():
            if not child.is_dir():
                continue
            low = child.name.casefold()
            if low in {"[extras]", "extras"}:
                # Skip Gallery/Extras — callers use find_gallery_sections for that
                return child
    except OSError:
        return None
    return None


def find_episodes_root(folder: Path) -> Path:
    """Season folders live under Episodes/ when present, else the folder itself."""
    nested = _child_named(folder, EPISODES_NAMES)
    return nested if nested else folder


def cover_search_dirs(folder: Path) -> list[Path]:
    """Ordered dirs to resolve Cover - Front / season art / photocards."""
    out: list[Path] = []
    covers = find_covers_dir(folder)
    if covers:
        out.append(covers)
    legacy = find_artwork_legacy(folder)
    if legacy and legacy not in out:
        out.append(legacy)
    return out


def render_search_dirs(folder: Path) -> list[Path]:
    out: list[Path] = []
    renders = find_renders_dir(folder)
    if renders:
        out.append(renders)
    legacy = find_artwork_legacy(folder)
    if legacy and legacy not in out:
        out.append(legacy)
    # Also Gallery/Logos if present
    gal = find_gallery_root(folder)
    if gal:
        logos = _child_named(gal, ("logos",))
        if logos and logos not in out:
            out.append(logos)
    return out


def find_badge_file(folder: Path, media_root: Path) -> str | None:
    """Square badge image — stem contains ``badge``."""
    for d in render_search_dirs(folder):
        try:
            files = sorted(d.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            continue
        for f in files:
            if (
                f.is_file()
                and f.suffix.lower() in IMAGE_EXTS
                and "badge" in f.stem.casefold()
            ):
                url = _media_url(f, media_root)
                if url:
                    try:
                        return f"{url}&v={int(f.stat().st_mtime)}"
                    except OSError:
                        return url
    return None


def find_logo_file(folder: Path, media_root: Path) -> tuple[str | None, str | None]:
    """Return (logo_url, icon_url) from renders / artwork."""
    logo_url = None
    icon_url = None
    for d in render_search_dirs(folder):
        try:
            files = list(d.iterdir())
        except OSError:
            continue
        for f in files:
            if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
                continue
            low = f.stem.casefold()
            url = _media_url(f, media_root)
            if not url:
                continue
            try:
                url = f"{url}&v={int(f.stat().st_mtime)}"
            except OSError:
                pass
            if "badge" in low:
                continue
            if "icon" in low and not icon_url:
                icon_url = url
            if "logo" in low and "collapsed" not in low and not logo_url:
                logo_url = url
    return logo_url, icon_url


def gallery_sections(folder: Path, media_root: Path) -> list[dict]:
    """Walk Gallery/{Covers,Renders,Extras…} into sectioned image lists.

    Falls back to flat [Artwork] as section ``covers`` when no Gallery/.
    """
    sections: list[dict] = []
    gal = find_gallery_root(folder)
    roots: list[tuple[str, Path]] = []
    if gal:
        try:
            children = sorted(gal.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            children = []
        for child in children:
            if child.is_dir() and not child.name.startswith("."):
                roots.append((child.name, child))
        # Loose files at Gallery root
        loose = [
            p
            for p in children
            if p.is_file() and p.suffix.lower() in IMAGE_EXTS
        ]
        if loose:
            roots.insert(0, ("Gallery", gal))
    else:
        legacy = find_artwork_legacy(folder)
        if legacy:
            roots.append(("Covers", legacy))

    for label, root_dir in roots:
        items = _collect_images(root_dir, media_root, section=label)
        if items:
            sections.append(
                {
                    "key": label.casefold().replace(" ", "-"),
                    "label": label,
                    "items": items,
                }
            )
    return sections


def _collect_images(
    root: Path, media_root: Path, *, section: str, prefix: str = ""
) -> list[dict]:
    import hashlib

    items: list[dict] = []
    try:
        entries = sorted(root.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return items
    for path in entries:
        if path.name.startswith("."):
            continue
        if path.is_dir():
            # Nested under Extras etc.
            sub_prefix = f"{prefix}{path.name}/" if prefix else f"{path.name}/"
            items.extend(
                _collect_images(path, media_root, section=section, prefix=sub_prefix)
            )
            continue
        if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
            continue
        rel = path.relative_to(media_root).as_posix()
        digest = hashlib.sha256(rel.casefold().encode("utf-8")).hexdigest()[:12]
        url = _media_url(path, media_root)
        try:
            url = f"{url}&v={int(path.stat().st_mtime)}"
        except OSError:
            pass
        items.append(
            {
                "id": f"gal_{digest}",
                "url": url,
                "title": path.stem,
                "folder_path": rel,
                "section": section.casefold(),
                "subsection": prefix.rstrip("/") or None,
            }
        )
    return items


def has_gallery_images(folder: Path) -> bool:
    if find_gallery_root(folder):
        return True
    legacy = find_artwork_legacy(folder)
    if not legacy:
        return False
    try:
        return any(
            p.is_file() and p.suffix.lower() in IMAGE_EXTS for p in legacy.iterdir()
        )
    except OSError:
        return False
