"""Scan Series/{Letter}/{Franchise}/ into catalog + detail payloads for the Series module."""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from app.artwork_stems import COVER_BACK_STEM, COVER_FRONT_STEM
from app.band_library import DATE_PREFIX_RE, _find_artwork_subdir
from app.config import settings
from app.franchise_index import normalize_franchise_slug, parse_dated_folder_name
from app.gallery import IMAGE_EXTS, _media_url
from app.media_index import format_display_date
from app.media_item_overview import VIDEO_EXTS, _file_url
from app.media_paths_util import safe_relative
from app.media_tabs_index import _folder_cover
from app.release_tracklist import _duration_from_file, _format_duration

_BRACKET_META = frozenset(
    {"[artwork]", "artwork", "[extras]", "extras", "[audio]", "audio"}
)
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
    """Count season / arc folders at any depth (hub → nested subseries → seasons)."""
    n = 0
    try:
        for child in folder.iterdir():
            if not child.is_dir() or _is_skip_dir(child.name):
                continue
            if _is_season_folder(child.name) or _folder_has_episode_videos(child):
                n += 1
            else:
                n += _count_seasons_deep(child)
    except OSError:
        return 0
    return n


def _folder_has_episode_videos(folder: Path) -> bool:
    """True when this folder directly contains episode video files."""
    try:
        for child in folder.iterdir():
            if child.is_file() and child.suffix.lower() in VIDEO_EXTS:
                return True
    except OSError:
        return False
    return False


def _artwork_named_cover(
    artwork: Path | None,
    labels: list[str],
    stem: str,
    media_root: Path,
) -> str | None:
    """Match ``{label} cover - front`` (case-insensitive) inside [Artwork]."""
    if not artwork or not artwork.is_dir():
        return None
    stem_cf = stem.casefold().strip()
    label_cfs = [lab.casefold().strip() for lab in labels if lab and lab.strip()]
    if not label_cfs:
        return None
    try:
        files = [p for p in artwork.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS]
    except OSError:
        return None
    for label_cf in label_cfs:
        want = f"{label_cf} {stem_cf}"
        for path in files:
            if path.stem.casefold().strip() == want:
                return _media_url(path, media_root)
    return None


def _season_card(
    season_dir: Path,
    media_root: Path,
    *,
    parent_artwork: Path | None = None,
) -> dict:
    from app.series_artwork import resolve_season_art

    date_iso, title = parse_dated_folder_name(season_dir.name)
    if season_dir.name.casefold() == "specials":
        title = "Specials"
    display_title = title or season_dir.name
    labels = [display_title, season_dir.name]
    if date_iso and title:
        labels.append(f"{date_iso.replace('-', '.')}. {title}")
    portrait, landscape, front, back = resolve_season_art(
        parent_artwork, labels, media_root
    )
    cover = portrait or front or _folder_cover(season_dir, media_root)
    return {
        "id": season_dir.name,
        "title": display_title,
        "date_iso": date_iso,
        "display_date": format_display_date(date_iso),
        "folder_path": season_dir.relative_to(media_root).as_posix(),
        "cover_url": cover,
        "portrait_url": portrait or cover,
        "landscape_url": landscape or portrait or cover,
        "cover_back_url": back,
        "episode_count": _count_episodes(season_dir),
    }


def _list_movies(folder: Path, media_root: Path) -> list[dict]:
    """Movie video files under a Movies/ subfolder, or dated movie-like siblings."""
    movies: list[dict] = []
    movie_dirs: list[Path] = []
    try:
        children = sorted(folder.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return []
    for child in children:
        if not child.is_dir() or _is_skip_dir(child.name):
            continue
        if child.name.casefold() in {"movies", "films", "theatrical"}:
            movie_dirs.append(child)
    scan_roots = movie_dirs or []
    for root_dir in scan_roots:
        try:
            entries = sorted(root_dir.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            continue
        for entry in entries:
            if entry.is_file() and entry.suffix.lower() in VIDEO_EXTS:
                rel = entry.relative_to(media_root).as_posix()
                number, title = _parse_episode_name(entry.name)
                movies.append(
                    {
                        "id": _episode_id(rel),
                        "number": number,
                        "title": title,
                        "play_path": rel,
                        "open_url": _file_url(entry, media_root)
                        or f"/api/media/file?path={quote(rel, safe='/')}",
                        "kind": "movie",
                    }
                )
            elif entry.is_dir() and not _is_skip_dir(entry.name):
                # One movie per folder — first video file
                eps = _list_episodes(entry, media_root)
                if not eps:
                    continue
                ep = eps[0]
                date_iso, title = parse_dated_folder_name(entry.name)
                movies.append(
                    {
                        **ep,
                        "id": f"mov_{entry.name}",
                        "title": title or ep.get("title") or entry.name,
                        "date_iso": date_iso,
                        "display_date": format_display_date(date_iso),
                        "cover_url": _folder_cover(entry, media_root),
                        "folder_path": entry.relative_to(media_root).as_posix(),
                        "kind": "movie",
                    }
                )
    return movies


def _list_seasons(folder: Path, media_root: Path) -> list[dict]:
    """Season folders named Season N, Specials, or arc folders with episode videos."""
    seasons: list[dict] = []
    parent_art = _find_artwork_subdir(folder)
    try:
        children = sorted(folder.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return []
    for child in children:
        if not child.is_dir() or _is_skip_dir(child.name):
            continue
        if child.name.casefold() in {"movies", "films", "theatrical"}:
            continue
        if _is_season_folder(child.name):
            seasons.append(
                _season_card(child, media_root, parent_artwork=parent_art)
            )
    if seasons:
        return seasons
    # Story arcs / untitled seasons (e.g. "God of Destruction Beerus") —
    # any non-meta child folder under a subseries when there are no Season N dirs.
    for child in children:
        if not child.is_dir() or _is_skip_dir(child.name):
            continue
        if child.name.casefold() in {"movies", "films", "theatrical"}:
            continue
        # Skip nested hubs that themselves contain further subseries folders
        nested_subs = [
            c
            for c in (list(child.iterdir()) if child.is_dir() else [])
            if c.is_dir()
            and not _is_skip_dir(c.name)
            and not _is_season_folder(c.name)
            and not _folder_has_episode_videos(c)
            and c.name.casefold() not in {"movies", "films", "theatrical"}
        ]
        # If child looks like another franchise hub (has nested subseries of its own
        # without being a leaf), leave it for _list_subseries — but arc folders
        # either have videos or are empty leaves.
        if nested_subs and not _folder_has_episode_videos(child):
            # Heuristic: nested dated folders without videos → still treat as arcs
            # when they share the same parent pattern (all leaves). Prefer listing.
            pass
        seasons.append(
            _season_card(child, media_root, parent_artwork=parent_art)
        )
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
        # Leaf episode containers and arc folders under a show are seasons
        if _folder_has_episode_videos(child):
            continue
        if child.name.casefold() in {"movies", "films", "theatrical"}:
            continue
        # If parent already treats children as seasons (no Season N dirs),
        # a child with only empty/video leaf siblings isn't a subseries hub —
        # skip dirs that have no nested content hubs.
        date_iso, title = parse_dated_folder_name(child.name)
        seasons = _list_seasons(child, media_root)
        # When _list_seasons falls back to listing all children as arcs, a true
        # subseries (e.g. Dragon Ball Super) will have seasons. Nested empty
        # arcs should not also appear as subseries at the franchise level —
        # franchise children like Super have seasons; Super's arcs are seasons.
        # At franchise level, Super is a subseries because its children aren't
        # classic seasons AND Super itself has no videos — _list_seasons(Super)
        # returns the arcs. Good.
        #
        # Problem: at franchise level, would we also list Super's arcs as
        # subseries? _list_subseries(franchise) iterates Super, Z, etc.
        # For Super: not season folder, no videos at Super root → continues.
        # seasons = _list_seasons(Super) → 5 arcs. season_count = 5. Appended
        # as one subseries. Good — arcs are NOT iterated at franchise level.
        #
        # At Super level via _list_subseries(Super): each arc has no videos
        # (except Beerus) — wait Beerus HAS videos so we `continue`. Empty
        # arcs don't have videos, so they'd be listed as nested subseries!
        # Fix: if _list_seasons(parent) already claimed these as seasons,
        # don't list them as subseries. Easiest: if a child has no nested
        # seasons AND no nested subseries-worthy children, skip it when the
        # parent's season fallback would include it.
        #
        # Simpler rule: skip child if it has no child directories and no nested
        # season-named folders and no nested dirs with videos — i.e. empty
        # leaf OR only files. Actually empty arcs SHOULD be seasons via
        # _list_seasons on parent, so _list_subseries on parent shouldn't
        # include them.
        #
        # Rule: skip children that look like season/arc leaves (no further
        # subdirectory hubs). A hub has at least one non-meta child dir that
        # is itself a container (has dirs or many videos).
        try:
            child_dirs = [
                c
                for c in child.iterdir()
                if c.is_dir() and not _is_skip_dir(c.name)
            ]
        except OSError:
            child_dirs = []
        if not child_dirs:
            # Empty leaf or files-only → season candidate, not subseries
            continue
        # Has only episode videos in nested? already handled by has_videos
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
        duration_sec = _duration_from_file(child)
        if duration_sec is None and child.suffix.lower() in {".mp4", ".m4v", ".mov"}:
            try:
                from app.media_item_overview import _mp4_duration_from_mvhd

                duration_sec = _mp4_duration_from_mvhd(child)
            except Exception:
                duration_sec = None
        episodes.append(
            {
                "id": _episode_id(rel),
                "number": number,
                "title": title,
                "play_path": rel,
                "open_url": open_url
                or f"/api/media/file?path={quote(rel, safe='/')}",
                "duration_sec": duration_sec,
                "duration": _format_duration(duration_sec),
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
    from app.series_artwork import resolve_series_photocards
    from app.series_overview import _list_brand_assets

    logo_url, icon_url = _list_brand_assets(folder, root)
    photocards = resolve_series_photocards(folder, root)
    from app.band_library import _find_artwork_subdir
    from app.artwork_stems import _media_file_in_artwork

    art = _find_artwork_subdir(folder)
    cover_front = _folder_cover(folder, root)
    cover_back = None
    if art:
        back_file = _media_file_in_artwork(art, COVER_BACK_STEM)
        if back_file:
            cover_back = _media_url(back_file, root)
    base = {
        "id": folder.name,
        "title": title or folder.name,
        "date_iso": date_iso,
        "display_date": format_display_date(date_iso),
        "folder_path": folder.relative_to(root).as_posix(),
        "cover_url": cover_front,
        "cover_back_url": cover_back,
        "logo_url": logo_url,
        "icon_url": icon_url,
        "photocards": photocards,
        "has_gallery": _has_gallery(folder),
    }

    if _is_season_folder(folder.name) or _folder_has_episode_videos(folder):
        episodes = _list_episodes(folder, root)
        return {
            **base,
            "kind": "season",
            "seasons": [],
            "subseries": [],
            "episodes": episodes,
            "episode_count": len(episodes),
            "movies": [],
        }

    seasons = _list_seasons(folder, root)
    subseries = _list_subseries(folder, root)
    movies = _list_movies(folder, root)
    # Also treat root-level video files that aren't in a season as movies
    if not movies:
        try:
            for child in sorted(folder.iterdir(), key=lambda p: p.name.casefold()):
                if child.is_file() and child.suffix.lower() in VIDEO_EXTS:
                    rel = child.relative_to(root).as_posix()
                    number, title = _parse_episode_name(child.name)
                    movies.append(
                        {
                            "id": _episode_id(rel),
                            "number": number,
                            "title": title,
                            "play_path": rel,
                            "open_url": _file_url(child, root)
                            or f"/api/media/file?path={quote(rel, safe='/')}",
                            "kind": "movie",
                        }
                    )
        except OSError:
            pass
    return {
        **base,
        "kind": "subseries" if seasons or movies or not subseries else "folder",
        "seasons": seasons,
        "subseries": subseries,
        "episodes": [],
        "movies": movies,
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
