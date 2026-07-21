"""Overview payload for Video / Library folder items."""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.band_library import DATE_PREFIX_RE, TRACK_PREFIX_RE
from app.config import settings
from app.gallery import IMAGE_EXTS, _media_url
from app.media_index import (
    DISC_DIR_RE,
    DISC_LOOSE_RE,
    SIDE_LOOSE_RE,
    SIDE_RE,
    format_display_date,
)
from app.media_paths_util import entry_display_name, safe_relative
from app.media_tabs_index import (
    _folder_cover,
    _title_from_folder,
    find_resolved_media_item,
    iter_resolved_media_items,
)
from app.models import Band
from app.release_tracklist import _duration_from_file, _format_duration

TEXT_EXTS = {".txt", ".md", ".nfo"}
VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".m4v", ".webm"}
DOC_EXTS = {".pdf", ".epub", ".cbz", ".cbr", ".djvu"}
READABLE_EXTS = DOC_EXTS | {".html", ".htm"}
DEFAULT_DISC_URL = "/api/assets/default/disc.png"


def _mp4_duration_from_mvhd(path: Path) -> float | None:
    """Parse timescale/duration from the mvhd atom when mutagen reports 0."""
    try:
        data = path.read_bytes()
    except OSError:
        return None
    idx = data.find(b"mvhd")
    if idx < 0 or idx + 24 > len(data):
        return None
    # Atom header is size(4)+type(4); version follows type.
    ver = data[idx + 4]
    try:
        if ver == 1:
            if idx + 32 > len(data):
                return None
            timescale = int.from_bytes(data[idx + 20 : idx + 24], "big")
            duration = int.from_bytes(data[idx + 24 : idx + 32], "big")
        else:
            timescale = int.from_bytes(data[idx + 16 : idx + 20], "big")
            duration = int.from_bytes(data[idx + 20 : idx + 24], "big")
    except Exception:
        return None
    if timescale <= 0 or duration <= 0:
        return None
    return float(duration) / float(timescale)


def _video_duration_sec(path: Path) -> float | None:
    """Best-effort video length; skip zero/invalid mutagen results."""
    try:
        from mutagen.mp4 import MP4

        mp4 = MP4(path)
        length = getattr(getattr(mp4, "info", None), "length", None)
        if length and float(length) > 0:
            return float(length)
    except Exception:
        pass
    length = _duration_from_file(path)
    if length and float(length) > 0:
        return float(length)
    if path.suffix.casefold() in {".mp4", ".m4v", ".mov"}:
        return _mp4_duration_from_mvhd(path)
    return None


def _pdf_page_count(path: Path) -> int | None:
    if path.suffix.casefold() != ".pdf":
        return None
    try:
        from PyPDF2 import PdfReader

        reader = PdfReader(str(path))
        n = len(reader.pages)
        return n if n > 0 else None
    except Exception:
        return None


def _format_pages(page_count: int | None) -> str | None:
    if not page_count or page_count <= 0:
        return None
    label = "page" if page_count == 1 else "pages"
    return f"{page_count} {label}"

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
_SKIP_META_FILES = frozenset(
    {
        "description.txt",
        "readme.txt",
        "about.txt",
        "info.txt",
        "overview.txt",
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


def _stem_meta(name: str) -> tuple[str, str | None, str | None]:
    """Return (display_title, date_iso, display_date) from a filename stem/name."""
    stem = Path(name).stem
    date_iso = None
    m = DATE_PREFIX_RE.match(stem.strip())
    if m:
        y, mo, d = m.group(1), m.group(2), m.group(3)
        date_iso = f"{y}-{mo or '01'}-{d or '01'}"
        title = _title_from_folder(stem)
    else:
        title = TRACK_PREFIX_RE.sub("", stem).strip() or stem
    return title, date_iso, format_display_date(date_iso)


def _file_entry(path: Path, media_root: Path, *, number: int | None = None) -> dict | None:
    if not path.is_file():
        return None
    rel = safe_relative(path, media_root)
    if not rel:
        return None
    ext = path.suffix.casefold()
    kind = _file_kind(ext)
    try:
        size = path.stat().st_size
    except OSError:
        size = 0
    title, date_iso, display_date = _stem_meta(path.name)
    duration_sec = None
    duration = None
    page_count = None
    pages = None
    if kind == "video":
        duration_sec = _video_duration_sec(path)
        duration = _format_duration(duration_sec)
    elif kind == "document":
        page_count = _pdf_page_count(path)
        pages = _format_pages(page_count)
    return {
        "number": number,
        "name": path.name,
        "title": title,
        "date_iso": date_iso,
        "display_date": display_date,
        "path": rel.replace("\\", "/"),
        "kind": kind,
        "size": size,
        "url": _file_url(path, media_root),
        "duration_sec": duration_sec,
        "duration": duration,
        "page_count": page_count,
        "pages": pages,
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
        if child.name.casefold() in _SKIP_META_FILES:
            continue
        entry = _file_entry(child, media_root)
        if entry and entry["kind"] not in ("image", "text"):
            items.append(entry)
    return items


def _number_files(files: list[dict]) -> list[dict]:
    numbered: list[dict] = []
    for i, entry in enumerate(files, start=1):
        row = dict(entry)
        row["number"] = i
        numbered.append(row)
    return numbered


def _collect_group_files(folder: Path, media_root: Path) -> list[dict]:
    """Files in a disc/volume folder (non-recursive except ignoring artwork)."""
    items = _collect_direct_files(folder, media_root)
    if items:
        return _number_files(items)
    # One nesting level for wrappers like Disc/Title/file.mp4
    try:
        children = sorted(folder.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return items
    for child in children:
        if not child.is_dir() or child.name.casefold() in _SKIP_DIRS:
            continue
        items.extend(_collect_direct_files(child, media_root))
    return _number_files(items)


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
    root_files = _number_files(_collect_direct_files(folder, media_root))
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


def _folder_logo(folder: Path, media_root: Path) -> str | None:
    search_dirs: list[Path] = [folder]
    try:
        for child in folder.iterdir():
            if child.is_dir() and child.name.casefold() in ("[artwork]", "artwork"):
                search_dirs.insert(0, child)
                break
    except OSError:
        pass
    for directory in search_dirs:
        if not directory.is_dir():
            continue
        try:
            matches = sorted(directory.glob("Logo*"), key=lambda p: p.name.casefold())
        except OSError:
            continue
        for path in matches:
            if path.is_file() and path.suffix.lower() in IMAGE_EXTS:
                return _media_url(path, media_root)
    return None


def _folder_disc(folder: Path, media_root: Path) -> str | None:
    search_dirs: list[Path] = [folder]
    try:
        for child in folder.iterdir():
            if child.is_dir() and child.name.casefold() in ("[artwork]", "artwork"):
                search_dirs.insert(0, child)
                break
    except OSError:
        pass
    for directory in search_dirs:
        if not directory.is_dir():
            continue
        try:
            matches = sorted(directory.glob("Disc*"), key=lambda p: p.name.casefold())
        except OSError:
            continue
        for path in matches:
            if path.is_file() and path.suffix.lower() in IMAGE_EXTS:
                return _media_url(path, media_root)
    return None


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


def _prev_next_media_neighbors(
    cards: list[dict],
    item_id: str,
) -> tuple[dict | None, dict | None]:
    """Prev/next within the same kind, ordered by date then title (wraps)."""
    if len(cards) < 2:
        return None, None
    pool = sorted(
        cards,
        key=lambda r: (r.get("date_iso") or "9999-12-31", (r.get("title") or "").casefold()),
    )
    idx = next((i for i, r in enumerate(pool) if r.get("id") == item_id), None)
    if idx is None:
        return None, None
    prev_r = pool[(idx - 1) % len(pool)]
    next_r = pool[(idx + 1) % len(pool)]
    return (
        {
            "id": prev_r["id"],
            "title": prev_r.get("title") or "Previous",
            "cover_url": prev_r.get("cover_url"),
        },
        {
            "id": next_r["id"],
            "title": next_r.get("title") or "Next",
            "cover_url": next_r.get("cover_url"),
        },
    )


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

    cover_url = card.get("cover_url") or _folder_cover(folder, media_root)
    # Library items are books/docs — no disc art; video keeps default disc fallback
    if kind == "library":
        disc_url = None
    else:
        disc_url = _folder_disc(folder, media_root) or DEFAULT_DISC_URL
    logo_url = _folder_logo(folder, media_root)

    all_cards = [
        c for c, _de, _res in iter_resolved_media_items(band, media_root, kind=kind)
    ]
    prev_r, next_r = _prev_next_media_neighbors(all_cards, item_id)

    payload = {
        "id": item_id,
        "kind": kind,
        "band_id": band_id,
        "artist_name": band.bnd_name,
        "title": card.get("title") or _title_from_folder(display_name),
        "date_iso": date_iso,
        "display_date": format_display_date(date_iso),
        "folder_path": rel,
        "cover_url": cover_url,
        "disc_url": disc_url,
        "logo_url": logo_url,
        "description": None,
        "description_manual": False,
        "director": None,
        "author": None,
        "publisher": None,
        "genres": [],
        "groups": groups,
        "files": flat_files,
        "open_url": open_url,
        "prev": prev_r,
        "next": next_r,
    }
    from app.media_item_admin import apply_media_item_meta

    return apply_media_item_meta(payload, db, band_id, kind, item_id)
