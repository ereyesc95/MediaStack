"""NSFW-gated Exclusive gallery folders under [Artwork]/Exclusive or Gallery/Exclusive."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

from app.artwork_stems import VIDEO_EXTS
from app.band_library import AUDIO_EXTS
from app.gallery import IMAGE_EXTS, _media_url

EXCLUSIVE_NAME = "exclusive"
GALLERY_MEDIA_EXTS = set(IMAGE_EXTS) | set(VIDEO_EXTS) | set(AUDIO_EXTS)


def path_is_exclusive(rel_path: str) -> bool:
    """True when a media-relative path sits under an Exclusive folder."""
    parts = [p.casefold() for p in rel_path.replace("\\", "/").split("/") if p]
    return EXCLUSIVE_NAME in parts


def _is_exclusive_dir(path: Path) -> bool:
    return path.is_dir() and path.name.casefold() == EXCLUSIVE_NAME


def _media_kind(suffix: str) -> str:
    low = suffix.lower()
    if low in VIDEO_EXTS:
        return "video"
    if low in AUDIO_EXTS:
        return "audio"
    return "image"


def find_exclusive_dir(folder: Path, *, layout: str) -> Path | None:
    """Locate Exclusive under artist [Artwork] or franchise Gallery/."""
    if layout == "music":
        from app.gallery import _gallery_dir

        root = _gallery_dir(folder)
    else:
        from app.series_paths import find_gallery_root

        root = find_gallery_root(folder)
    if not root or not root.is_dir():
        return None
    direct = root / "Exclusive"
    if _is_exclusive_dir(direct):
        return direct
    try:
        for child in root.iterdir():
            if _is_exclusive_dir(child):
                return child
    except OSError:
        return None
    return None


def has_exclusive_content(folder: Path, *, layout: str) -> bool:
    exclusive = find_exclusive_dir(folder, layout=layout)
    if not exclusive:
        return False
    try:
        for path in exclusive.rglob("*"):
            if path.is_file() and path.suffix.lower() in GALLERY_MEDIA_EXTS:
                return True
    except OSError:
        pass
    return False


def _item_id(rel: str) -> str:
    digest = hashlib.sha256(rel.casefold().encode("utf-8")).hexdigest()[:12]
    return f"gal_{digest}"


def _collect_media_items(
    root: Path,
    media_root: Path,
    *,
    section: str,
    prefix: str = "",
) -> list[dict]:
    items: list[dict] = []
    try:
        entries = sorted(root.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return items
    for path in entries:
        if path.name.startswith("."):
            continue
        if path.is_dir():
            sub_prefix = f"{prefix}{path.name}/" if prefix else f"{path.name}/"
            items.extend(
                _collect_media_items(
                    path, media_root, section=section, prefix=sub_prefix
                )
            )
            continue
        if not path.is_file() or path.suffix.lower() not in GALLERY_MEDIA_EXTS:
            continue
        rel = path.relative_to(media_root).as_posix()
        url = _media_url(path, media_root)
        try:
            url = f"{url}&v={int(path.stat().st_mtime)}"
        except OSError:
            pass
        items.append(
            {
                "id": _item_id(rel),
                "url": url,
                "title": path.stem,
                "folder_path": rel,
                "section": section,
                "subsection": prefix.rstrip("/") or None,
                "media_kind": _media_kind(path.suffix),
            }
        )
    return items


def _subsection_key(label: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", label.casefold()).strip("-")
    return slug or "folder"


def build_exclusive_section(exclusive_dir: Path, media_root: Path) -> dict | None:
    """Build Exclusive section with optional subsections for immediate child folders."""
    if not exclusive_dir.is_dir():
        return None

    root_items: list[dict] = []
    subsections: list[dict] = []

    try:
        children = sorted(exclusive_dir.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        children = []

    for child in children:
        if child.name.startswith("."):
            continue
        if child.is_dir():
            items = _collect_media_items(child, media_root, section="exclusive")
            if items:
                subsections.append(
                    {
                        "key": _subsection_key(child.name),
                        "label": child.name,
                        "items": items,
                    }
                )
        elif child.is_file() and child.suffix.lower() in GALLERY_MEDIA_EXTS:
            rel = child.relative_to(media_root).as_posix()
            url = _media_url(child, media_root)
            try:
                url = f"{url}&v={int(child.stat().st_mtime)}"
            except OSError:
                pass
            root_items.append(
                {
                    "id": _item_id(rel),
                    "url": url,
                    "title": child.stem,
                    "folder_path": rel,
                    "section": "exclusive",
                    "subsection": None,
                    "media_kind": _media_kind(child.suffix),
                }
            )

    if not root_items and not subsections:
        return None

    if subsections and root_items:
        subsections.insert(
            0,
            {"key": "_root", "label": "General", "items": root_items},
        )
        root_items = []

    section: dict = {
        "key": "exclusive",
        "label": "Exclusive",
        "items": root_items if not subsections else [],
    }
    if subsections:
        section["subsections"] = subsections
    return section
