"""Scan Series/{Letter}/{Franchise}/ into catalog + detail payloads for the Series module."""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from app.band_library import DATE_PREFIX_RE, _find_artwork_subdir
from app.config import settings
from app.franchise_index import normalize_franchise_slug, parse_dated_folder_name
from app.gallery import IMAGE_EXTS, _media_url
from app.media_index import format_display_date
from app.media_item_overview import VIDEO_EXTS, _file_url
from app.media_paths_util import safe_relative
from app.media_tabs_index import _folder_cover

_BRACKET_META = frozenset({"[artwork]", "artwork", "[extras]", "extras"})
# Obsolete cross-media portal folders — not series content
_PORTAL_DIRS = frozenset(
    {
        "audio",
        "video",
        "library",
        "gallery",
        "movies",
        "series",
        "books",
        "games",
        "music",
    }
)
_SEASON_RE = re.compile(r"^(?:season|specials)\b", re.I)
_EPISODE_PREFIX_RE = re.compile(r"^(\d+)\.\s*(.+)$")


def _is_meta_dir(name: str) -> bool:
    return name.casefold() in _BRACKET_META or name.startswith(".")


def _is_skip_dir(name: str) -> bool:
    return _is_meta_dir(name) or name.casefold() in _PORTAL_DIRS


def _is_season_folder(name: str) -> bool:
    low = name.casefold().strip()
    if low == "specials":
        return True
    rest = name
    m = DATE_PREFIX_RE.match(name.strip())
    if m:
        rest = name[m.end() :].lstrip(". ").strip()
    return bool(_SEASON_RE.match(rest))


def _resolve_media_root(media_root: Path | None = None) -> Path:
    root = Path(media_root or settings.media_root or "")
    if not root.is_dir():
        raise FileNotFoundError("Media root is not configured or missing")
    return root


def _safe_under_root(path: Path, media_root: Path) -> Path:
    resolved = path.resolve()
    root = media_root.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise ValueError("Path escapes media root") from exc
    return resolved


def _path_from_rel(rel: str, media_root: Path) -> Path:
    cleaned = (rel or "").replace("\\", "/").lstrip("/")
    if not cleaned or ".." in cleaned.split("/"):
        raise ValueError("Invalid path")
    return _safe_under_root(media_root / cleaned, media_root)


def _has_gallery(folder: Path) -> bool:
    art = _find_artwork_subdir(folder)
    if not art or not art.is_dir():
        return False
    try:
        return any(
            p.is_file() and p.suffix.lower() in IMAGE_EXTS for p in art.iterdir()
        )
    except OSError:
        return False


def _franchise_cover(franchise_dir: Path, media_root: Path) -> str | None:
    cover = _folder_cover(franchise_dir, media_root)
    if cover:
        return cover
    try:
        children = sorted(franchise_dir.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return None
    for child in children:
        if not child.is_dir() or _is_skip_dir(child.name):
            continue
        cover = _folder_cover(child, media_root)
        if cover:
            return cover
    return None


def _count_episodes(season_dir: Path) -> int:
    n = 0
    try:
        for child in season_dir.iterdir():
            if child.is_file() and child.suffix.lower() in VIDEO_EXTS:
                n += 1
    except OSError:
        return 0
    return n


def _count_seasons(folder: Path) -> int:
    n = 0
    try:
        for child in folder.iterdir():
            if (
                child.is_dir()
                and not _is_skip_dir(child.name)
                and _is_season_folder(child.name)
            ):
                n += 1
    except OSError:
        return 0
    return n


def _count_seasons_deep(folder: Path) -> int:
    """Count season folders at any depth (hub → nested subseries → seasons)."""
    n = 0
    try:
        for child in folder.iterdir():
            if not child.is_dir() or _is_skip_dir(child.name):
                continue
            if _is_season_folder(child.name):
                n += 1
            else:
                n += _count_seasons_deep(child)
    except OSError:
        return 0
    return n


def _count_seasons_deep(folder: Path) -> int:
    """Count season folders at any depth (hub → nested subseries → seasons)."""
    n = 0
    try:
        for child in folder.iterdir():
            if not child.is_dir() or _is_skip_dir(child.name):
                continue
            if _is_season_folder(child.name):
                n += 1
            else:
                n += _count_seasons_deep(child)
    except OSError:
        return 0
    return n


def _season_card(season_dir: Path, media_root: Path) -> dict:
    date_iso, title = parse_dated_folder_name(season_dir.name)
    if season_dir.name.casefold() == "specials":
        title = "Specials"
    return {
        "id": season_dir.name,
        "title": title or season_dir.name,
        "date_iso": date_iso,
        "display_date": format_display_date(date_iso),
        "folder_path": season_dir.relative_to(media_root).as_posix(),
        "cover_url": _folder_cover(season_dir, media_root),
        "episode_count": _count_episodes(season_dir),
    }


def _list_seasons(folder: Path, media_root: Path) -> list[dict]:
    seasons: list[dict] = []
    try:
        children = sorted(folder.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return []
    for child in children:
        if (
            child.is_dir()
            and not _is_skip_dir(child.name)
            and _is_season_folder(child.name)
        ):
            seasons.append(_season_card(child, media_root))
    return seasons


def _list_subseries(folder: Path, media_root: Path) -> list[dict]:
    subseries: list[dict] = []
    try:
        children = sorted(folder.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return []
    for child in children:
        if not child.is_dir() or _is_skip_dir(child.name):
            continue
        if _is_season_folder(child.name):
            continue
        date_iso, title = parse_dated_folder_name(child.name)
        seasons = _list_seasons(child, media_root)
        season_count = len(seasons)
        nested = []
        if season_count == 0:
            nested = _list_subseries(child, media_root)
            season_count = sum(int(s.get("season_count") or 0) for s in nested)
            if season_count == 0:
                season_count = _count_seasons_deep(child)
        subseries.append(
            {
                "id": child.name,
                "title": title or child.name,
                "date_iso": date_iso,
                "display_date": format_display_date(date_iso),
                "folder_path": child.relative_to(media_root).as_posix(),
                "cover_url": _folder_cover(child, media_root),
                "season_count": season_count,
                "has_gallery": _has_gallery(child),
            }
        )
    return subseries


def _episode_id(rel: str) -> str:
    digest = hashlib.sha256(rel.casefold().encode("utf-8")).hexdigest()[:12]
    return f"ep_{digest}"


def _parse_episode_name(filename: str) -> tuple[int | None, str]:
    stem = Path(filename).stem.strip()
    m = _EPISODE_PREFIX_RE.match(stem)
    if m:
        return int(m.group(1)), m.group(2).strip()
    return None, stem


def _list_episodes(season_dir: Path, media_root: Path) -> list[dict]:
    episodes: list[dict] = []
    try:
        children = sorted(season_dir.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return []
    for child in children:
        if not child.is_file() or child.suffix.lower() not in VIDEO_EXTS:
            continue
        rel = child.relative_to(media_root).as_posix()
        number, title = _parse_episode_name(child.name)
        open_url = _file_url(child, media_root)
        episodes.append(
            {
                "id": _episode_id(rel),
                "number": number,
                "title": title,
                "play_path": rel,
                "open_url": open_url
                or f"/api/media/file?path={quote(rel, safe='/')}",
            }
        )
    episodes.sort(
        key=lambda e: (
            e["number"] is None,
            e["number"] if e["number"] is not None else 10**9,
            (e["title"] or "").casefold(),
        )
    )
    return episodes


def _franchise_card(franchise_dir: Path, letter: str, media_root: Path) -> dict:
    rel = franchise_dir.relative_to(media_root).as_posix()
    subseries = _list_subseries(franchise_dir, media_root)
    seasons = _list_seasons(franchise_dir, media_root)
    return {
        "id": normalize_franchise_slug(franchise_dir.name)
        or franchise_dir.name.casefold(),
        "name": franchise_dir.name,
        "letter": letter,
        "slug": normalize_franchise_slug(franchise_dir.name),
        "folder_path": rel,
        "cover_url": _franchise_cover(franchise_dir, media_root),
        "subseries": [
            {
                "id": s["id"],
                "title": s["title"],
                "date_iso": s["date_iso"],
                "display_date": s["display_date"],
                "folder_path": s["folder_path"],
                "cover_url": s["cover_url"],
                "season_count": s["season_count"],
            }
            for s in subseries
        ],
        "season_count": len(seasons)
        + sum(int(s.get("season_count") or 0) for s in subseries),
        "subseries_count": len(subseries),
    }


def iter_franchise_dirs(media_root: Path | None = None) -> list[tuple[Path, str]]:
    root = Path(media_root or settings.media_root or "")
    series_root = root / "Series"
    out: list[tuple[Path, str]] = []
    if not series_root.is_dir():
        return out
    try:
        top = sorted(
            (p for p in series_root.iterdir() if p.is_dir()),
            key=lambda p: p.name.casefold(),
        )
    except OSError:
        return out
    for entry in top:
        if _is_skip_dir(entry.name):
            continue
        if len(entry.name) == 1 or entry.name == "#":
            try:
                children = sorted(entry.iterdir(), key=lambda p: p.name.casefold())
            except OSError:
                continue
            for franchise_dir in children:
                if not franchise_dir.is_dir() or _is_skip_dir(franchise_dir.name):
                    continue
                out.append((franchise_dir, entry.name))
        else:
            letter = entry.name[:1].upper() if entry.name[:1].isalpha() else "#"
            out.append((entry, letter))
    return out


def find_franchise_dir(
    franchise_id: str, media_root: Path | None = None
) -> tuple[Path, str] | None:
    root = _resolve_media_root(media_root)
    want = (franchise_id or "").casefold().strip()
    if not want:
        return None
    for franchise_dir, letter in iter_franchise_dirs(root):
        slug = normalize_franchise_slug(franchise_dir.name) or franchise_dir.name.casefold()
        if slug == want or franchise_dir.name.casefold() == want:
            return franchise_dir, letter
    return None


def build_series_catalog(media_root: Path | None = None) -> dict:
    root = Path(media_root or settings.media_root or "")
    franchises = [
        _franchise_card(franchise_dir, letter, root)
        for franchise_dir, letter in iter_franchise_dirs(root)
    ]
    franchises.sort(key=lambda f: (f.get("name") or "").casefold())
    return {
        "franchises": franchises,
        "scanned_at": datetime.now(timezone.utc).isoformat() if franchises else None,
    }


def build_franchise_detail(
    franchise_id: str, media_root: Path | None = None
) -> dict | None:
    root = _resolve_media_root(media_root)
    found = find_franchise_dir(franchise_id, root)
    if not found:
        return None
    franchise_dir, letter = found
    card = _franchise_card(franchise_dir, letter, root)
    seasons = _list_seasons(franchise_dir, root)
    subseries = _list_subseries(franchise_dir, root)
    return {
        **card,
        "seasons": seasons,
        "subseries": subseries,
        "has_gallery": _has_gallery(franchise_dir),
        "kind": "franchise",
    }


def build_folder_detail(rel_path: str, media_root: Path | None = None) -> dict | None:
    root = _resolve_media_root(media_root)
    try:
        folder = _path_from_rel(rel_path, root)
    except (ValueError, OSError):
        return None
    if not folder.is_dir():
        return None
    # Must live under Series/
    try:
        folder.relative_to(root / "Series")
    except ValueError:
        return None

    date_iso, title = parse_dated_folder_name(folder.name)
    if folder.name.casefold() == "specials":
        title = "Specials"
    base = {
        "id": folder.name,
        "title": title or folder.name,
        "date_iso": date_iso,
        "display_date": format_display_date(date_iso),
        "folder_path": folder.relative_to(root).as_posix(),
        "cover_url": _folder_cover(folder, root),
        "has_gallery": _has_gallery(folder),
    }

    if _is_season_folder(folder.name):
        episodes = _list_episodes(folder, root)
        return {
            **base,
            "kind": "season",
            "seasons": [],
            "subseries": [],
            "episodes": episodes,
            "episode_count": len(episodes),
        }

    seasons = _list_seasons(folder, root)
    subseries = _list_subseries(folder, root)
    return {
        **base,
        "kind": "subseries" if seasons or not subseries else "folder",
        "seasons": seasons,
        "subseries": subseries,
        "episodes": [],
        "season_count": len(seasons),
    }


def build_series_gallery(rel_path: str, media_root: Path | None = None) -> dict:
    root = _resolve_media_root(media_root)
    try:
        folder = _path_from_rel(rel_path, root)
    except (ValueError, OSError):
        return {"folder_path": rel_path, "items": []}
    if not folder.is_dir():
        return {"folder_path": rel_path, "items": []}
    try:
        folder.relative_to(root / "Series")
    except ValueError:
        return {"folder_path": rel_path, "items": []}

    art = _find_artwork_subdir(folder)
    items: list[dict] = []
    if art and art.is_dir():
        try:
            files = sorted(art.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            files = []
        for path in files:
            if not path.is_file() or path.suffix.lower() not in IMAGE_EXTS:
                continue
            rel = safe_relative(path, root) or path.name
            digest = hashlib.sha256(rel.casefold().encode("utf-8")).hexdigest()[:12]
            items.append(
                {
                    "id": f"gal_{digest}",
                    "url": _media_url(path, root),
                    "title": path.stem,
                    "folder_path": rel,
                    "section": "artwork",
                }
            )
    return {
        "folder_path": folder.relative_to(root).as_posix(),
        "items": items,
    }
