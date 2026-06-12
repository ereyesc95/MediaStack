"""Overview payload for Video / Library folder items."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import DATE_PREFIX_RE
from app.config import settings
from app.gallery import IMAGE_EXTS, _artist_dir, _resolve_child_dir
from app.media_paths_util import safe_relative
from app.media_tabs_index import LIBRARY_ROOT, VIDEO_ROOT, _card_id, _folder_cover, _title_from_folder
from app.models import Band

TEXT_EXTS = {".txt", ".md", ".nfo"}
VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".mov", ".wmv", ".m4v", ".webm"}
DOC_EXTS = {".pdf", ".epub", ".cbz", ".cbr", ".djvu"}


def _find_item_folder(
    band: Band, media_root: Path, kind: str, item_id: str
) -> Path | None:
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return None
    root_name = VIDEO_ROOT if kind == "video" else LIBRARY_ROOT
    section = _resolve_child_dir(artist_dir, root_name)
    if not section or not section.is_dir():
        return None

    for cat_dir in section.iterdir():
        if not cat_dir.is_dir():
            continue
        for entry in cat_dir.iterdir():
            if not entry.is_dir():
                continue
            rel = safe_relative(entry, media_root)
            if not rel:
                continue
            if _card_id(kind, rel) == item_id:
                return entry
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


def _list_files(folder: Path, media_root: Path) -> list[dict]:
    items: list[dict] = []
    for path in sorted(folder.rglob("*"), key=lambda p: p.as_posix().casefold()):
        if not path.is_file():
            continue
        rel = safe_relative(path, media_root)
        if not rel:
            continue
        ext = path.suffix.casefold()
        kind = "other"
        if ext in VIDEO_EXTS:
            kind = "video"
        elif ext in IMAGE_EXTS:
            kind = "image"
        elif ext in DOC_EXTS:
            kind = "document"
        elif ext in TEXT_EXTS:
            kind = "text"
        items.append(
            {
                "name": path.name,
                "path": rel,
                "kind": kind,
                "size": path.stat().st_size,
            }
        )
        if len(items) >= 200:
            break
    return items


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
    folder = _find_item_folder(band, media_root, kind, item_id)
    if not folder:
        return None

    rel = safe_relative(folder, media_root) or folder.name
    date_iso = None
    m = DATE_PREFIX_RE.match(folder.name.strip())
    if m:
        y, mo, d = m.group(1), m.group(2), m.group(3)
        date_iso = f"{y}-{mo or '01'}-{d or '01'}"

    return {
        "id": item_id,
        "kind": kind,
        "band_id": band_id,
        "artist_name": band.bnd_name,
        "title": _title_from_folder(folder.name),
        "date_iso": date_iso,
        "folder_path": rel,
        "cover_url": _folder_cover(folder, media_root),
        "description": _read_description(folder),
        "files": _list_files(folder, media_root),
    }
