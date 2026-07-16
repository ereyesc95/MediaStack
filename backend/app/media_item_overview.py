"""Overview payload for Video / Library folder items."""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.band_library import DATE_PREFIX_RE
from app.config import settings
from app.gallery import IMAGE_EXTS, _media_url
from app.media_index import DISC_DIR_RE, DISC_LOOSE_RE, SIDE_LOOSE_RE, SIDE_RE
from app.media_paths_util import entry_display_name, safe_relative
from app.media_tabs_index import (
    _folder_cover,
    _title_from_folder,
    find_resolved_media_item,
)
from app.models import Band

TEXT_EXTS = {".txt", ".md", ".nfo"}
VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".m4v", ".webm"}
DOC_EXTS = {".pdf", ".epub", ".cbz", ".cbr", ".djvu"}
READABLE_EXTS = DOC_EXTS | {".html", ".htm"}

_SKIP_DIRS = frozenset(
    {
        "[artwork]",
        "artwork",
        "audio",
        "movies",
        "series",
        "video",
        "music",
        "desktop.ini",
        "thumbs.db",
    }
)
_VOLUME_RE = re.compile(r"^(volume|vol)\.?\s*\d+", re.I)


def _file_url(path: Path, media_root: Path) -> str | None:
    try:
        return _media_url(path, media_root)
    except ValueError:
        rel = safe_relative(path, media_root)
        if not rel:
            return None
        return f"/api/media/file?path={quote(rel.replace(chr(92), '/'), safe='/')}"


def _file_kind(ext: str) -> str:
    if ext in VIDEO_EXTS:
        return "video"
    if ext in IMAGE_EXTS:
        return "image"
    if ext in DOC_EXTS:
        return "document"
    if ext in TEXT_EXTS:
        return "text"
    return "other"


def _file_entry(path: Path, media_root: Path) -> dict | None:
    if not path.is_file():
        return None
    rel = safe_relative(path, media_root)
    if not rel:
        return None
    ext = path.suffix.casefold()
    try:
        size = path.stat().st_size
    except OSError:
        size = 0
    return {
        "name": path.name,
        "path": rel.replace("\\", "/"),
        "kind": _file_kind(ext),
        "size": size,
        "url": _file_url(path, media_root),
    }


def _is_group_folder(name: str) -> bool:
    if DISC_DIR_RE.match(name) or DISC_LOOSE_RE.match(name):
        return True
    if SIDE_RE.match(name) or SIDE_LOOSE_RE.match(name):
        return True
    if _VOLUME_RE.match(name.strip()):
        return True
    if DATE_PREFIX_RE.match(name.strip()):
        return True
    return False


def _group_sort_key(name: str) -> tuple[int, str]:
    m = DISC_LOOSE_RE.match(name) or re.match(r"^(\d+)\.\s*Disc\s+(\d+)", name, re.I)
    if m:
        num = m.group(1) if m.lastindex == 1 else m.group(2)
        try:
            return (int(num), name.casefold())
        except ValueError:
            pass
    m = _VOLUME_RE.match(name.strip())
    if m:
        digits = re.search(r"\d+", name)
        if digits:
            return (int(digits.group(0)), name.casefold())
    m = DATE_PREFIX_RE.match(name.strip())
    if m:
        return (0, name.casefold())
    return (999, name.casefold())


def _collect_direct_files(folder: Path, media_root: Path) -> list[dict]:
    items: list[dict] = []
    try:
        children = sorted(folder.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return items
    for child in children:
        if not child.is_file():
            continue
        if child.name.casefold() in _SKIP_DIRS:
            continue
        entry = _file_entry(child, media_root)
        if entry and entry["kind"] != "image":
            items.append(entry)
    return items


def _collect_group_files(folder: Path, media_root: Path) -> list[dict]:
    """Files in a disc/volume folder (non-recursive except ignoring artwork)."""
    items = _collect_direct_files(folder, media_root)
    if items:
        return items
    # One nesting level for wrappers like Disc/Title/file.mp4
    try:
        children = sorted(folder.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return items
    for child in children:
        if not child.is_dir() or child.name.casefold() in _SKIP_DIRS:
            continue
        items.extend(_collect_direct_files(child, media_root))
    return items


def _build_groups(folder: Path, media_root: Path, *, kind: str) -> list[dict]:
    groups: list[dict] = []
    try:
        children = sorted(folder.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        children = []

    group_dirs = [
        c
        for c in children
        if c.is_dir()
        and c.name.casefold() not in _SKIP_DIRS
        and _is_group_folder(c.name)
    ]
    # Prefer disc/volume labels over generic dated folders when both exist
    disc_dirs = [
        c
        for c in group_dirs
        if DISC_DIR_RE.match(c.name) or DISC_LOOSE_RE.match(c.name) or _VOLUME_RE.match(c.name)
    ]
    use_dirs = disc_dirs if disc_dirs else group_dirs

    if use_dirs:
        for group_dir in sorted(use_dirs, key=lambda p: _group_sort_key(p.name)):
            files = _collect_group_files(group_dir, media_root)
            if not files:
                continue
            groups.append(
                {
                    "label": entry_display_name(group_dir),
                    "files": files,
                }
            )
        if groups:
            return groups

    # Flat files at item root (ignore portal/franchise helper folders)
    root_files = _collect_direct_files(folder, media_root)
    if root_files:
        return [{"label": "Contents", "files": root_files}]

    # Non-group content folders (e.g. nested untitled wrappers) as volumes
    for child in children:
        if not child.is_dir() or child.name.casefold() in _SKIP_DIRS:
            continue
        if _is_group_folder(child.name):
            continue
        files = _collect_group_files(child, media_root)
        if files:
            groups.append(
                {
                    "label": _title_from_folder(entry_display_name(child)),
                    "files": files,
                }
            )
    return groups


def _readable_files(groups: list[dict]) -> list[dict]:
    out: list[dict] = []
    for group in groups:
        for f in group.get("files") or []:
            if f.get("kind") in ("document",) or Path(f.get("name") or "").suffix.casefold() in READABLE_EXTS:
                out.append(f)
    return out


def _read_description(folder: Path) -> str | None:
    for name in ("description.txt", "readme.txt", "about.txt", "info.txt", "overview.txt"):
        path = folder / name
        if path.is_file():
            try:
                text = path.read_text(encoding="utf-8", errors="replace").strip()
                if text:
                    return text
            except OSError:
                continue
    for path in sorted(folder.glob("*.txt")):
        if path.name.casefold().startswith("cover"):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace").strip()
            if len(text) > 40:
                return text[:4000]
        except OSError:
            continue
    return None


def build_media_item_overview(
    db: Session,
    band_id: int,
    kind: str,
    item_id: str,
) -> dict | None:
    band = db.get(Band, band_id)
    if not band or not settings.media_root:
        return None
    media_root = Path(settings.media_root)
    found = find_resolved_media_item(
        band, media_root, kind=kind, item_id=item_id
    )
    if not found:
        return None
    card, display_entry, folder = found

    display_name = entry_display_name(display_entry)
    rel = safe_relative(folder, media_root) or safe_relative(display_entry, media_root) or folder.name
    if isinstance(rel, str):
        rel = rel.replace("\\", "/")
    date_iso = card.get("date_iso")
    if not date_iso:
        m = DATE_PREFIX_RE.match(display_name.strip())
        if m:
            y, mo, d = m.group(1), m.group(2), m.group(3)
            date_iso = f"{y}-{mo or '01'}-{d or '01'}"

    groups = _build_groups(folder, media_root, kind=kind)
    flat_files = [f for g in groups for f in (g.get("files") or [])]
    readable = _readable_files(groups)
    open_url = None
    # Library: a single readable document opens directly in a new tab
    if kind == "library" and len(readable) == 1 and len(flat_files) <= 1:
        open_url = readable[0].get("url")

    return {
        "id": item_id,
        "kind": kind,
        "band_id": band_id,
        "artist_name": band.bnd_name,
        "title": card.get("title") or _title_from_folder(display_name),
        "date_iso": date_iso,
        "folder_path": rel,
        "cover_url": card.get("cover_url") or _folder_cover(folder, media_root),
        "description": _read_description(folder),
        "groups": groups,
        "files": flat_files,
        "open_url": open_url,
    }
