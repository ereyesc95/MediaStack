"""Scan Movies/{Letter}/{Work}/ into catalog + detail payloads for the Movies module."""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.franchise_index import (
    _iter_work_leaf_items,
    normalize_franchise_slug,
    parse_dated_folder_name,
)
from app.gallery import IMAGE_EXTS, _media_url
from app.media_index import format_display_date
from app.media_item_overview import VIDEO_EXTS, _file_url
from app.media_paths_util import safe_relative
from app.media_tabs_index import _folder_cover

_META_DIRS = frozenset(
    {
        "[artwork]",
        "artwork",
        "gallery",
        "audio",
        "extras",
        "[extras]",
        "[audio]",
    }
)
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
        "extras",
    }
)


def _is_meta_dir(name: str) -> bool:
    return name.casefold() in _META_DIRS or name.startswith(".")


def _is_skip_dir(name: str) -> bool:
    return _is_meta_dir(name) or name.casefold() in _PORTAL_DIRS


def _resolve_media_root(media_root: Path | None = None) -> Path:
    root = Path(media_root or settings.media_root or "")
    if not root.is_dir():
        raise FileNotFoundError("Media root is not configured or missing")
    return root


def _film_id(rel_path: str) -> str:
    digest = hashlib.sha1(rel_path.encode("utf-8")).hexdigest()[:12]
    return f"film_{digest}"


def _folder_has_video(folder: Path) -> bool:
    try:
        for child in folder.iterdir():
            if child.is_file() and child.suffix.lower() in VIDEO_EXTS:
                return True
            if child.is_dir() and not _is_skip_dir(child.name):
                # version / disc subfolders
                for nested in child.iterdir():
                    if nested.is_file() and nested.suffix.lower() in VIDEO_EXTS:
                        return True
    except OSError:
        return False
    return False


def _list_versions(film_dir: Path, media_root: Path) -> list[dict]:
    """Theatrical / Extended / etc. — video files in film root or dated/named subfolders."""
    versions: list[dict] = []
    try:
        root_videos = sorted(
            (
                p
                for p in film_dir.iterdir()
                if p.is_file() and p.suffix.lower() in VIDEO_EXTS
            ),
            key=lambda p: p.name.casefold(),
        )
    except OSError:
        root_videos = []

    for video in root_videos:
        rel = safe_relative(video, media_root)
        versions.append(
            {
                "id": f"ver_{hashlib.sha1(rel.encode()).hexdigest()[:10]}",
                "label": "Theatrical",
                "play_path": rel,
                "file_url": _file_url(video, media_root),
                "file_name": video.name,
            }
        )

    try:
        subdirs = sorted(
            (
                p
                for p in film_dir.iterdir()
                if p.is_dir() and not _is_skip_dir(p.name)
            ),
            key=lambda p: p.name.casefold(),
        )
    except OSError:
        subdirs = []

    for sub in subdirs:
        try:
            videos = [
                p
                for p in sub.iterdir()
                if p.is_file() and p.suffix.lower() in VIDEO_EXTS
            ]
        except OSError:
            continue
        if not videos:
            continue
        video = sorted(videos, key=lambda p: p.name.casefold())[0]
        rel = safe_relative(video, media_root)
        _, label = parse_dated_folder_name(sub.name)
        versions.append(
            {
                "id": f"ver_{hashlib.sha1(rel.encode()).hexdigest()[:10]}",
                "label": label or sub.name,
                "play_path": rel,
                "file_url": _file_url(video, media_root),
                "file_name": video.name,
            }
        )

    return versions


def _work_cover(work_dir: Path, media_root: Path) -> str | None:
    from app.series_index import _series_folder_cover

    cover = _series_folder_cover(work_dir, media_root)
    if cover:
        return cover
    for _item_dir, _date, _title, _hub in _iter_work_leaf_items(work_dir):
        cover = _series_folder_cover(_item_dir, media_root)
        if cover:
            return cover
    return _folder_cover(work_dir, media_root)


def _work_art(work_dir: Path, media_root: Path, resolver) -> str | None:
    """Resolve work artwork, falling back to its dated film folders."""
    art = resolver(work_dir, media_root)
    if art:
        return art
    for item_dir, _date, _title, _hub in _iter_work_leaf_items(work_dir):
        art = resolver(item_dir, media_root)
        if art:
            return art
    return None


def _list_films(work_dir: Path, media_root: Path) -> list[dict]:
    from app.series_index import (
        _series_folder_banner,
        _series_folder_cover,
        _series_folder_landscape,
    )
    from app.series_paths import find_badge_file, find_logo_file

    films: list[dict] = []
    for item_dir, date_iso, title, hub in _iter_work_leaf_items(work_dir):
        rel = item_dir.relative_to(media_root).as_posix()
        logo_url, icon_url = find_logo_file(item_dir, media_root)
        versions = _list_versions(item_dir, media_root)
        primary = versions[0] if versions else None
        films.append(
            {
                "id": _film_id(rel),
                "title": title or item_dir.name,
                "date_iso": date_iso,
                "display_date": format_display_date(date_iso),
                "folder_path": rel,
                "folder_name": item_dir.name,
                "path": rel,
                "cover_url": _series_folder_cover(item_dir, media_root)
                or _folder_cover(item_dir, media_root),
                "portrait_url": _series_folder_cover(item_dir, media_root),
                "landscape_url": _series_folder_landscape(item_dir, media_root),
                "banner_url": _series_folder_banner(item_dir, media_root),
                "logo_url": logo_url,
                "icon_url": icon_url,
                "badge_url": find_badge_file(item_dir, media_root),
                "has_video": _folder_has_video(item_dir),
                "version_count": len(versions),
                "open_url": (primary or {}).get("file_url"),
                "open_mode": "local" if primary else None,
                "open_label": "Play video" if primary else None,
                "hub_title": hub,
            }
        )
    films.sort(
        key=lambda f: (
            f.get("date_iso") or "9999",
            (f.get("title") or "").casefold(),
        )
    )
    return films


def _names_match(a: str, b: str) -> bool:
    def key(s: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", (s or "").casefold())

    ka, kb = key(a), key(b)
    if not ka or not kb:
        return False
    return ka == kb or ka in kb or kb in ka


def iter_work_dirs(media_root: Path | None = None) -> list[tuple[Path, str]]:
    root = Path(media_root or settings.media_root or "")
    movies_root = root / "Movies"
    out: list[tuple[Path, str]] = []
    if not movies_root.is_dir():
        return out
    try:
        letters = sorted(
            (p for p in movies_root.iterdir() if p.is_dir()),
            key=lambda p: p.name.casefold(),
        )
    except OSError:
        return out
    for letter_dir in letters:
        if _is_skip_dir(letter_dir.name):
            continue
        letter = letter_dir.name
        try:
            works = sorted(letter_dir.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            continue
        for work_dir in works:
            if not work_dir.is_dir() or _is_skip_dir(work_dir.name):
                continue
            out.append((work_dir, letter))
    return out


def find_work_dir(
    work_id: str, media_root: Path | None = None
) -> tuple[Path, str] | None:
    want = (work_id or "").casefold().strip()
    if not want:
        return None
    for work_dir, letter in iter_work_dirs(media_root):
        slug = normalize_franchise_slug(work_dir.name)
        if slug == want or work_dir.name.casefold() == want:
            return work_dir, letter
    return None


def find_film_dir(
    film_id: str, media_root: Path | None = None
) -> tuple[Path, Path, str] | None:
    """Return (film_dir, work_dir, letter) for a film id."""
    want = (film_id or "").strip()
    if not want:
        return None
    root = _resolve_media_root(media_root)
    for work_dir, letter in iter_work_dirs(root):
        for item_dir, _d, _t, _h in _iter_work_leaf_items(work_dir):
            rel = item_dir.relative_to(root).as_posix()
            if _film_id(rel) == want or item_dir.name.casefold() == want.casefold():
                return item_dir, work_dir, letter
    return None


def _work_card(work_dir: Path, letter: str, media_root: Path) -> dict:
    from app.series_paths import find_badge_file, find_logo_file
    from app.series_index import (
        _series_folder_banner,
        _series_folder_cover,
        _series_folder_landscape,
    )

    films = _list_films(work_dir, media_root)
    logo_url, icon_url = find_logo_file(work_dir, media_root)
    standalone = False
    primary_film_id = None
    if len(films) == 1:
        only = films[0]
        standalone = _names_match(work_dir.name, only.get("title") or "")
        primary_film_id = only.get("id")
    return {
        "id": normalize_franchise_slug(work_dir.name) or work_dir.name.casefold(),
        "name": work_dir.name,
        "letter": letter,
        "slug": normalize_franchise_slug(work_dir.name),
        "folder_path": work_dir.relative_to(media_root).as_posix(),
        "cover_url": _work_cover(work_dir, media_root),
        "portrait_url": _work_art(work_dir, media_root, _series_folder_cover),
        "landscape_url": _work_art(
            work_dir, media_root, _series_folder_landscape
        ),
        "banner_url": _work_art(work_dir, media_root, _series_folder_banner),
        "logo_url": logo_url,
        "icon_url": icon_url,
        "badge_url": find_badge_file(work_dir, media_root),
        "film_count": len(films),
        "films": films,
        "is_standalone": standalone,
        "primary_film_id": primary_film_id if standalone else None,
        # SeriesFranchiseCard-compatible fields for browse reuse
        "subseries_count": 0,
        "season_count": len(films),
        "subseries": [],
    }


def _title_letter(title: str | None) -> str:
    """A–Z catalog bucket from the film title (not the work folder letter)."""
    t = (title or "").strip()
    if not t:
        return "#"
    ch = t[0].upper()
    return ch if "A" <= ch <= "Z" else "#"


def build_movies_catalog(media_root: Path | None = None) -> dict:
    root = Path(media_root or settings.media_root or "")
    franchises = [
        _work_card(work_dir, letter, root)
        for work_dir, letter in iter_work_dirs(root)
    ]
    franchises.sort(key=lambda f: (f.get("name") or "").casefold())
    films: list[dict] = []
    for card in franchises:
        for film in card.get("films") or []:
            films.append(
                {
                    **film,
                    "work_id": card["id"],
                    "work_name": card["name"],
                    "letter": _title_letter(film.get("title")),
                    "work_letter": card["letter"],
                }
            )
    films.sort(
        key=lambda f: (
            f.get("date_iso") or "9999",
            (f.get("title") or "").casefold(),
        )
    )
    return {
        "franchises": franchises,
        "films": films,
        "scanned_at": datetime.now(timezone.utc).isoformat() if franchises else None,
    }


def build_work_detail(work_id: str, media_root: Path | None = None) -> dict | None:
    root = _resolve_media_root(media_root)
    found = find_work_dir(work_id, root)
    if not found:
        return None
    work_dir, letter = found
    card = _work_card(work_dir, letter, root)
    from app.series_index import _has_gallery

    return {
        **card,
        "kind": "franchise",
        "has_gallery": _has_gallery(work_dir),
        "has_series": False,
        "has_movies": card["film_count"] > 0,
    }


def build_film_detail(film_id: str, media_root: Path | None = None) -> dict | None:
    root = _resolve_media_root(media_root)
    found = find_film_dir(film_id, root)
    if not found:
        return None
    film_dir, work_dir, letter = found
    from app.series_index import (
        _has_gallery,
        _series_cover_back,
        _series_folder_banner,
        _series_folder_cover,
        _series_folder_landscape,
    )
    from app.series_paths import find_badge_file, find_logo_file
    from app.series_artwork import resolve_series_photocards

    rel = film_dir.relative_to(root).as_posix()
    date_iso, title = parse_dated_folder_name(film_dir.name)
    logo_url, icon_url = find_logo_file(film_dir, root)
    versions = _list_versions(film_dir, root)
    work_card = _work_card(work_dir, letter, root)
    return {
        "id": _film_id(rel),
        "kind": "film",
        "title": title or film_dir.name,
        "date_iso": date_iso,
        "display_date": format_display_date(date_iso),
        "folder_path": rel,
        "folder_name": film_dir.name,
        "cover_url": _series_folder_cover(film_dir, root) or _folder_cover(film_dir, root),
        "portrait_url": _series_folder_cover(film_dir, root),
        "landscape_url": _series_folder_landscape(film_dir, root),
        "banner_url": _series_folder_banner(film_dir, root)
        or _series_folder_landscape(film_dir, root)
        or _series_folder_cover(film_dir, root),
        "cover_back_url": _series_cover_back(film_dir, root),
        "logo_url": logo_url,
        "icon_url": icon_url,
        "badge_url": find_badge_file(film_dir, root),
        "photocards": resolve_series_photocards(film_dir, root),
        "has_gallery": _has_gallery(film_dir),
        "has_video": _folder_has_video(film_dir),
        "versions": versions,
        "trailer_url": None,
        "seasons": [],
        "subseries": [],
        "episodes": [],
        "movies": [],
        "work": {
            "id": work_card["id"],
            "name": work_card["name"],
            "letter": letter,
            "folder_path": work_card["folder_path"],
            "cover_url": work_card["cover_url"],
            "logo_url": work_card["logo_url"],
            "icon_url": work_card["icon_url"],
            "is_standalone": work_card["is_standalone"],
        },
    }


def resolve_movies_path(
    rel_path: str, media_root: Path | None = None
) -> dict | None:
    """Map a Movies/… relative path to work_id + optional film_id."""
    root = _resolve_media_root(media_root)
    norm = (rel_path or "").replace("\\", "/").strip("/")
    if not norm:
        return None
    want = norm.casefold()
    for work_dir, letter in iter_work_dirs(root):
        work_rel = work_dir.relative_to(root).as_posix()
        work_id = normalize_franchise_slug(work_dir.name) or work_dir.name.casefold()
        if work_rel.casefold() == want:
            return {
                "work_id": work_id,
                "film_id": None,
                "letter": letter,
                "name": work_dir.name,
            }
        for item_dir, _d, _t, _h in _iter_work_leaf_items(work_dir):
            item_rel = item_dir.relative_to(root).as_posix()
            if item_rel.casefold() == want or want.startswith(
                item_rel.casefold() + "/"
            ):
                return {
                    "work_id": work_id,
                    "film_id": _film_id(item_rel),
                    "letter": letter,
                    "name": work_dir.name,
                    "film_title": parse_dated_folder_name(item_dir.name)[1],
                }
    return None


def build_movies_dashboard(media_root: Path | None = None) -> dict:
    catalog = build_movies_catalog(media_root)
    franchises = catalog.get("franchises") or []
    films = catalog.get("films") or []
    return {
        "top_franchises": franchises[:12],
        "top_films": films[:12],
        "franchise_count": len(franchises),
        "film_count": len(films),
        "scanned_at": catalog.get("scanned_at"),
    }
