"""Scan Games/{Platform}/{Letter}/{Franchise}/ into catalog + detail payloads."""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.franchise_index import (
    GAME_PLATFORMS,
    _iter_work_leaf_items,
    is_unofficial_folder,
    normalize_franchise_slug,
    parse_dated_folder_name,
    parse_folder_bracket_tags,
)
from app.media_index import format_display_date
from app.media_item_overview import _file_url
from app.media_paths_util import safe_relative
from app.media_tabs_index import _folder_cover

# Preferred launch extensions (first match wins).
GAME_LAUNCH_EXTS: tuple[str, ...] = (
    ".wbfs",
    ".iso",
    ".rvz",
    ".wia",
    ".gcm",
    ".ciso",
    ".nsp",
    ".xci",
    ".nro",
    ".nca",
    ".cia",
    ".3ds",
    ".cci",
    ".cxi",
    ".nds",
    ".gba",
    ".gb",
    ".gbc",
    ".sfc",
    ".smc",
    ".nes",
    ".n64",
    ".z64",
    ".v64",
    ".nds",
    ".cue",
    ".chd",
    ".pbp",
    ".cso",
    ".vpk",
    ".pkg",
    ".xex",
    ".xiso",
    ".wad",
    ".dol",
    ".elf",
    ".exe",
    ".app",
    ".sh",
    ".bat",
    ".cmd",
)

_META_DIRS = frozenset(
    {
        "[artwork]",
        "artwork",
        "gallery",
        "audio",
        "extras",
        "[extras]",
        "[audio]",
        "saves",
        "manuals",
        "covers",
        "branding",
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
        "saves",
        "manuals",
    }
)

_PLATFORM_CF = {p.casefold(): p for p in GAME_PLATFORMS}


def _is_meta_dir(name: str) -> bool:
    return name.casefold() in _META_DIRS or name.startswith(".")


def _is_skip_dir(name: str) -> bool:
    return _is_meta_dir(name) or name.casefold() in _PORTAL_DIRS


def _resolve_media_root(media_root: Path | None = None) -> Path:
    root = Path(media_root or settings.media_root or "")
    if not root.is_dir():
        raise FileNotFoundError("Media root is not configured or missing")
    return root


def _game_id(rel_path: str) -> str:
    digest = hashlib.sha1(rel_path.encode("utf-8")).hexdigest()[:12]
    return f"game_{digest}"


def _names_match(a: str, b: str) -> bool:
    def key(s: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", (s or "").casefold())

    ka, kb = key(a), key(b)
    if not ka or not kb:
        return False
    return ka == kb or ka in kb or kb in ka


def _normalize_platform_name(name: str) -> str:
    hit = _PLATFORM_CF.get((name or "").strip().casefold())
    return hit or (name or "").strip()


def _list_candidate_files(folder: Path) -> list[Path]:
    found: list[Path] = []
    try:
        for child in folder.iterdir():
            if child.is_file():
                found.append(child)
            elif child.is_dir() and not _is_skip_dir(child.name):
                try:
                    for nested in child.iterdir():
                        if nested.is_file():
                            found.append(nested)
                except OSError:
                    continue
    except OSError:
        return []
    return found


def _pick_launch_file(game_dir: Path, title: str | None = None) -> Path | None:
    """Prefer first match by GAME_LAUNCH_EXTS order; else stem match folder title."""
    files = _list_candidate_files(game_dir)
    if not files:
        return None
    by_ext: dict[str, list[Path]] = {}
    for f in files:
        by_ext.setdefault(f.suffix.lower(), []).append(f)
    for ext in GAME_LAUNCH_EXTS:
        cands = by_ext.get(ext) or []
        if cands:
            return sorted(cands, key=lambda p: p.name.casefold())[0]

    want = re.sub(r"[^a-z0-9]+", "", (title or game_dir.name or "").casefold())
    if want:
        for f in sorted(files, key=lambda p: p.name.casefold()):
            stem_key = re.sub(r"[^a-z0-9]+", "", f.stem.casefold())
            if stem_key == want or want in stem_key or stem_key in want:
                return f
    return None


def _title_letter(title: str | None) -> str:
    t = (title or "").strip()
    if not t:
        return "#"
    ch = t[0].upper()
    return ch if "A" <= ch <= "Z" else "#"


def iter_franchise_dirs(
    media_root: Path | None = None,
) -> list[tuple[Path, str, str]]:
    """Yield (franchise_dir, platform, letter)."""
    root = Path(media_root or settings.media_root or "")
    games_root = root / "Games"
    out: list[tuple[Path, str, str]] = []
    if not games_root.is_dir():
        return out
    try:
        platforms = sorted(
            (p for p in games_root.iterdir() if p.is_dir()),
            key=lambda p: p.name.casefold(),
        )
    except OSError:
        return out
    for platform_dir in platforms:
        if _is_skip_dir(platform_dir.name):
            continue
        platform = _normalize_platform_name(platform_dir.name)
        try:
            letters = sorted(
                (p for p in platform_dir.iterdir() if p.is_dir()),
                key=lambda p: p.name.casefold(),
            )
        except OSError:
            continue
        for letter_dir in letters:
            if _is_skip_dir(letter_dir.name):
                continue
            letter = letter_dir.name
            try:
                works = sorted(
                    letter_dir.iterdir(), key=lambda p: p.name.casefold()
                )
            except OSError:
                continue
            for work_dir in works:
                if not work_dir.is_dir() or _is_skip_dir(work_dir.name):
                    continue
                out.append((work_dir, platform, letter))
    return out


def _game_card_from_dir(
    game_dir: Path,
    media_root: Path,
    *,
    title: str,
    date_iso: str | None,
    platform: str,
    franchise_name: str,
    franchise_id: str,
    letter: str,
    hub_title: str | None = None,
) -> dict:
    from app.series_index import (
        _series_folder_banner,
        _series_folder_cover,
        _series_folder_landscape,
    )
    from app.series_paths import find_badge_file, find_logo_file

    rel = game_dir.relative_to(media_root).as_posix()
    launch = _pick_launch_file(game_dir, title=title)
    logo_url, icon_url = find_logo_file(game_dir, media_root)
    launch_rel = safe_relative(launch, media_root) if launch else None
    return {
        "id": _game_id(rel),
        "title": title or parse_folder_bracket_tags(game_dir.name)[0],
        "date_iso": date_iso,
        "display_date": format_display_date(date_iso) if date_iso else None,
        "folder_path": rel,
        "folder_name": game_dir.name,
        "path": rel,
        "platform": platform,
        "work_id": franchise_id,
        "work_name": franchise_name,
        "letter": _title_letter(title),
        "work_letter": letter,
        "cover_url": _series_folder_cover(game_dir, media_root)
        or _folder_cover(game_dir, media_root),
        "portrait_url": _series_folder_cover(game_dir, media_root),
        "landscape_url": _series_folder_landscape(game_dir, media_root),
        "banner_url": _series_folder_banner(game_dir, media_root),
        "logo_url": logo_url,
        "icon_url": icon_url,
        "badge_url": find_badge_file(game_dir, media_root),
        "has_rom": launch is not None,
        "launch_path": launch_rel,
        "open_url": _file_url(launch, media_root) if launch else None,
        "open_mode": "local" if launch else None,
        "open_label": "Launch" if launch else None,
        "hub_title": hub_title,
        "official": not is_unofficial_folder(game_dir.name),
    }


def _list_games_under_franchise(
    work_dir: Path,
    media_root: Path,
    *,
    platform: str,
    letter: str,
) -> list[dict]:
    franchise_id = normalize_franchise_slug(work_dir.name) or work_dir.name.casefold()
    games: list[dict] = []
    for item_dir, date_iso, title, hub in _iter_work_leaf_items(work_dir):
        games.append(
            _game_card_from_dir(
                item_dir,
                media_root,
                title=title or parse_folder_bracket_tags(item_dir.name)[0],
                date_iso=date_iso,
                platform=platform,
                franchise_name=work_dir.name,
                franchise_id=franchise_id,
                letter=letter,
                hub_title=hub,
            )
        )
    # Three-tier one-off: franchise folder itself holds the ROM / dated files
    if not games:
        launch = _pick_launch_file(work_dir, title=work_dir.name)
        if launch or any(
            (work_dir / bucket).is_dir()
            for bucket in ("Gallery", "gallery", "[Artwork]", "Artwork", "Audio")
        ):
            date_iso, title = parse_dated_folder_name(work_dir.name)
            games.append(
                _game_card_from_dir(
                    work_dir,
                    media_root,
                    title=title or work_dir.name,
                    date_iso=date_iso,
                    platform=platform,
                    franchise_name=work_dir.name,
                    franchise_id=franchise_id,
                    letter=letter,
                )
            )
    games.sort(
        key=lambda g: (
            g.get("date_iso") or "9999",
            (g.get("title") or "").casefold(),
            (g.get("platform") or "").casefold(),
        )
    )
    return games


def _work_art(work_dir: Path, media_root: Path, resolver) -> str | None:
    art = resolver(work_dir, media_root)
    if art:
        return art
    for item_dir, _d, _t, _h in _iter_work_leaf_items(work_dir):
        art = resolver(item_dir, media_root)
        if art:
            return art
    return None


def _platform_franchise_card(
    work_dir: Path, platform: str, letter: str, media_root: Path
) -> dict:
    from app.series_index import (
        _series_folder_banner,
        _series_folder_cover,
        _series_folder_landscape,
    )
    from app.series_paths import find_badge_file, find_logo_file

    games = _list_games_under_franchise(
        work_dir, media_root, platform=platform, letter=letter
    )
    logo_url, icon_url = find_logo_file(work_dir, media_root)
    franchise_id = normalize_franchise_slug(work_dir.name) or work_dir.name.casefold()
    standalone = False
    primary_game_id = None
    if len(games) == 1:
        only = games[0]
        standalone = _names_match(work_dir.name, only.get("title") or "")
        primary_game_id = only.get("id")
    card = {
        "id": franchise_id,
        "name": work_dir.name,
        "letter": letter,
        "slug": franchise_id,
        "platform": platform,
        "folder_path": work_dir.relative_to(media_root).as_posix(),
        "cover_url": _work_art(work_dir, media_root, _series_folder_cover)
        or _folder_cover(work_dir, media_root),
        "portrait_url": _work_art(work_dir, media_root, _series_folder_cover),
        "landscape_url": _work_art(work_dir, media_root, _series_folder_landscape),
        "banner_url": _work_art(work_dir, media_root, _series_folder_banner),
        "logo_url": logo_url,
        "icon_url": icon_url,
        "badge_url": find_badge_file(work_dir, media_root),
        "game_count": len(games),
        "film_count": len(games),
        "games": games,
        "films": games,
        "is_standalone": standalone,
        "primary_game_id": primary_game_id if standalone else None,
        "primary_film_id": primary_game_id if standalone else None,
        "subseries_count": 0,
        "season_count": len(games),
        "subseries": [],
        "platforms": [platform] if platform else [],
    }
    try:
        from app.franchise_identity import apply_shared_artwork_to_card

        apply_shared_artwork_to_card(
            card, work_dir, media_root, franchise_name=work_dir.name
        )
    except Exception:
        pass
    return card


def build_games_catalog(media_root: Path | None = None) -> dict:
    """Catalog with merged franchises (all platforms) + flat games + platforms."""
    root = _resolve_media_root(media_root)
    by_slug: dict[str, dict] = {}
    platforms_map: dict[str, dict] = {}

    for work_dir, platform, letter in iter_franchise_dirs(root):
        part = _platform_franchise_card(work_dir, platform, letter, root)
        if int(part.get("game_count") or 0) <= 0:
            continue
        slug = part["id"]
        plat_key = platform.casefold()
        if plat_key not in platforms_map:
            platforms_map[plat_key] = {
                "id": normalize_franchise_slug(platform) or plat_key,
                "name": platform,
                "slug": normalize_franchise_slug(platform) or plat_key,
                "game_count": 0,
                "franchise_count": 0,
                "cover_url": part.get("cover_url"),
                "portrait_url": part.get("portrait_url"),
                "landscape_url": part.get("landscape_url"),
                "banner_url": part.get("banner_url"),
                "logo_url": part.get("logo_url"),
                "icon_url": part.get("icon_url"),
            }
        platforms_map[plat_key]["game_count"] += int(part.get("game_count") or 0)
        platforms_map[plat_key]["franchise_count"] += 1
        if not platforms_map[plat_key].get("cover_url") and part.get("cover_url"):
            platforms_map[plat_key]["cover_url"] = part.get("cover_url")
            platforms_map[plat_key]["portrait_url"] = part.get("portrait_url")
            platforms_map[plat_key]["landscape_url"] = part.get("landscape_url")
            platforms_map[plat_key]["banner_url"] = part.get("banner_url")

        existing = by_slug.get(slug)
        if not existing:
            by_slug[slug] = part
            continue
        # Merge games across platforms into one franchise card
        existing_games = list(existing.get("games") or [])
        seen = {(g.get("id") or "").casefold() for g in existing_games}
        for g in part.get("games") or []:
            gid = (g.get("id") or "").casefold()
            if gid and gid not in seen:
                existing_games.append(g)
                seen.add(gid)
        plats = list(existing.get("platforms") or [])
        if platform and platform not in plats:
            plats.append(platform)
        existing["games"] = existing_games
        existing["films"] = existing_games
        existing["game_count"] = len(existing_games)
        existing["film_count"] = len(existing_games)
        existing["season_count"] = len(existing_games)
        existing["platforms"] = sorted(plats, key=lambda p: p.casefold())
        if not existing.get("badge_url") and part.get("badge_url"):
            existing["badge_url"] = part.get("badge_url")
        if not existing.get("cover_url") and part.get("cover_url"):
            for key in (
                "cover_url",
                "portrait_url",
                "landscape_url",
                "banner_url",
                "logo_url",
                "icon_url",
            ):
                if part.get(key):
                    existing[key] = part.get(key)
        # Standalone only if still a single game after merge
        if len(existing_games) == 1:
            only = existing_games[0]
            existing["is_standalone"] = _names_match(
                existing.get("name") or "", only.get("title") or ""
            )
            existing["primary_game_id"] = (
                only.get("id") if existing["is_standalone"] else None
            )
            existing["primary_film_id"] = existing["primary_game_id"]
        else:
            existing["is_standalone"] = False
            existing["primary_game_id"] = None
            existing["primary_film_id"] = None

    franchises = sorted(
        by_slug.values(), key=lambda f: (f.get("name") or "").casefold()
    )
    games: list[dict] = []
    for card in franchises:
        for game in card.get("games") or []:
            games.append(dict(game))
    games.sort(
        key=lambda g: (
            (g.get("title") or "").casefold(),
            (g.get("platform") or "").casefold(),
            g.get("date_iso") or "",
        )
    )
    platforms = sorted(
        platforms_map.values(), key=lambda p: (p.get("name") or "").casefold()
    )
    return {
        "franchises": franchises,
        "games": games,
        "films": games,
        "platforms": platforms,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }


def find_franchise_dirs(
    work_id: str, media_root: Path | None = None
) -> list[tuple[Path, str, str]]:
    """All platform instances of a franchise slug."""
    want = (work_id or "").casefold().strip()
    if not want:
        return []
    want_slug = normalize_franchise_slug(work_id) or want
    hits: list[tuple[Path, str, str]] = []
    for work_dir, platform, letter in iter_franchise_dirs(media_root):
        slug = normalize_franchise_slug(work_dir.name) or work_dir.name.casefold()
        name = work_dir.name.casefold()
        if slug == want_slug or name == want or slug == want or name == want_slug:
            hits.append((work_dir, platform, letter))
    return hits


def find_work_dir(
    work_id: str, media_root: Path | None = None
) -> tuple[Path, str, str] | None:
    """First franchise folder match (any platform)."""
    hits = find_franchise_dirs(work_id, media_root)
    return hits[0] if hits else None


def find_game_dir(
    game_id: str, media_root: Path | None = None
) -> tuple[Path, Path, str, str] | None:
    """Return (game_dir, franchise_dir, platform, letter)."""
    want = (game_id or "").strip()
    if not want:
        return None
    want_cf = want.casefold()
    want_slug = normalize_franchise_slug(want)
    root = _resolve_media_root(media_root)
    for work_dir, platform, letter in iter_franchise_dirs(root):
        for item_dir, _d, title, _h in _iter_work_leaf_items(work_dir):
            rel = item_dir.relative_to(root).as_posix()
            keys = {_game_id(rel), item_dir.name.casefold()}
            for label in (title, item_dir.name):
                if not label:
                    continue
                keys.add(label.casefold())
                slug = normalize_franchise_slug(label)
                if slug:
                    keys.add(slug)
            if want == _game_id(rel) or want_cf in keys or (want_slug and want_slug in keys):
                return item_dir, work_dir, platform, letter
        # Three-tier: franchise dir is the game
        rel = work_dir.relative_to(root).as_posix()
        if want == _game_id(rel) or want_cf == work_dir.name.casefold():
            return work_dir, work_dir, platform, letter
    return None


def build_work_detail(work_id: str, media_root: Path | None = None) -> dict | None:
    root = _resolve_media_root(media_root)
    hits = find_franchise_dirs(work_id, root)
    if not hits:
        return None
    catalog = build_games_catalog(root)
    slug = normalize_franchise_slug(hits[0][0].name) or hits[0][0].name.casefold()
    for card in catalog.get("franchises") or []:
        if (card.get("id") or "").casefold() == slug.casefold():
            return card
    # Fallback build from first hit
    return _platform_franchise_card(hits[0][0], hits[0][1], hits[0][2], root)


def build_game_detail(game_id: str, media_root: Path | None = None) -> dict | None:
    root = _resolve_media_root(media_root)
    found = find_game_dir(game_id, root)
    if not found:
        return None
    game_dir, work_dir, platform, letter = found
    franchise_id = normalize_franchise_slug(work_dir.name) or work_dir.name.casefold()
    date_iso, title = parse_dated_folder_name(game_dir.name)
    card = _game_card_from_dir(
        game_dir,
        root,
        title=title or parse_folder_bracket_tags(game_dir.name)[0],
        date_iso=date_iso,
        platform=platform,
        franchise_name=work_dir.name,
        franchise_id=franchise_id,
        letter=letter,
    )
    # Sibling games across all platforms of this franchise
    siblings: list[dict] = []
    for other in build_work_detail(franchise_id, root).get("games") or []:
        if (other.get("id") or "") != card["id"]:
            siblings.append(other)
    card["sibling_games"] = siblings
    card["franchise"] = {
        "id": franchise_id,
        "name": work_dir.name,
        "platforms": build_work_detail(franchise_id, root).get("platforms") or [platform],
    }
    return card


def resolve_games_path(
    path: str, media_root: Path | None = None
) -> dict | None:
    """Map a disk-relative path to franchise/game ids for navigation."""
    root = _resolve_media_root(media_root)
    cleaned = (path or "").replace("\\", "/").strip("/")
    if not cleaned:
        return None
    parts = cleaned.split("/")
    if not parts or parts[0].casefold() != "games":
        return None
    target = root / cleaned
    if not target.exists():
        return None

    # Games/{Platform}/{Letter}/{Franchise}/[{Game}/]
    if len(parts) >= 4:
        platform = _normalize_platform_name(parts[1])
        letter = parts[2]
        franchise_name = parts[3]
        franchise_id = (
            normalize_franchise_slug(franchise_name) or franchise_name.casefold()
        )
        if len(parts) >= 5:
            game_dir = root / "/".join(parts[:5])
            if game_dir.is_dir():
                rel = game_dir.relative_to(root).as_posix()
                return {
                    "franchise_id": franchise_id,
                    "game_id": _game_id(rel),
                    "platform": platform,
                    "letter": letter,
                    "path": rel,
                }
        return {
            "franchise_id": franchise_id,
            "game_id": None,
            "platform": platform,
            "letter": letter,
            "path": "/".join(parts[:4]),
        }
    return None
