"""Organize loose ROM files dumped at Games/{Platform}/ into normal game trees.

Admin flow: scan platform root → preview → create folders + move files →
optional IGDB enrich (exact title match only).
"""

from __future__ import annotations

import asyncio
import re
import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.franchise_index import GAME_PLATFORMS
from app.gallery import _letter_folder

MAX_BATCH = 500

ROM_EXTENSIONS = frozenset(
    {
        ".3ds",
        ".7z",
        ".a26",
        ".a78",
        ".bin",
        ".ccd",
        ".chd",
        ".cia",
        ".ciso",
        ".cso",
        ".cue",
        ".dmg",
        ".dol",
        ".gb",
        ".gba",
        ".gbc",
        ".gcm",
        ".gcz",
        ".gg",
        ".gz",
        ".img",
        ".iso",
        ".mds",
        ".mdf",
        ".n64",
        ".nds",
        ".nes",
        ".nsp",
        ".pbp",
        ".rar",
        ".rvz",
        ".sfc",
        ".smc",
        ".v64",
        ".vb",
        ".wbfs",
        ".wad",
        ".wii",
        ".wua",
        ".xci",
        ".z64",
        ".zip",
    }
)

# Trailing exact franchise marker only: "Title [Franchise]"
_FRANCHISE_SUFFIX_RE = re.compile(r"^(?P<title>.+?)\s*\[(?P<franchise>[^\]]+)\]\s*$")

# Common dump tags to strip before matching / folder naming.
_REGION_TAG_RE = re.compile(
    r"\s*[\(\[](?:"
    r"USA|U|EUR|Europe|JPN|Japan|J|World|W|"
    r"En|Eng|English|Fr|Fra|French|De|Ger|German|Es|Spa|Spanish|"
    r"It|Ita|Italian|Nl|Dut|Dutch|Pt|Por|Portuguese|Ru|Rus|Russian|"
    r"Ko|Kor|Korean|Zh|Chi|Chinese|Tw|Hk|"
    r"Rev\s*[A-Z0-9.]+|Disk\s*\d+|Disc\s*\d+|CD\s*\d+|"
    r"Virtual Console|WiiU Virtual Console|Switch Online|"
    r"Proto|Beta|Demo|Sample|Promo|Unl|Pirate|!"
    r")[\)\]]",
    re.IGNORECASE,
)

_INVALID = re.compile(r'[<>:"/\\|?*]')


def _media_root() -> Path:
    root = Path(settings.media_root or "")
    if not root.is_dir():
        raise FileNotFoundError("Media root is not configured")
    return root


def _safe_name(value: str, fallback: str = "Untitled") -> str:
    text = (value or "").replace("█", "'").replace("■", ",").strip()
    text = re.sub(r"\s*:\s*", " - ", text)
    text = _INVALID.sub("-", text)
    text = re.sub(r"\s{2,}", " ", text).strip(" .")
    return text or fallback


def _canonicalize_platform(raw: str) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None
    hit = next((p for p in GAME_PLATFORMS if p.casefold() == text.casefold()), None)
    return hit


def list_rom_platforms() -> list[dict]:
    """Platforms available for organize (canonical names; mark which exist on disk)."""
    root = _media_root()
    games = root / "Games"
    on_disk: set[str] = set()
    if games.is_dir():
        for child in games.iterdir():
            if not child.is_dir():
                continue
            canon = _canonicalize_platform(child.name)
            if canon:
                on_disk.add(canon.casefold())
            else:
                # Non-canonical folder still selectable by its on-disk name.
                on_disk.add(child.name.casefold())
    out: list[dict] = []
    seen: set[str] = set()
    for name in GAME_PLATFORMS:
        key = name.casefold()
        seen.add(key)
        out.append({"name": name, "exists": key in on_disk})
    if games.is_dir():
        for child in sorted(games.iterdir(), key=lambda p: p.name.casefold()):
            if not child.is_dir():
                continue
            if child.name.casefold() in seen:
                continue
            if child.name.startswith("["):
                continue
            out.append({"name": child.name, "exists": True})
    return out


def _platform_dir(platform: str) -> Path:
    canon = _canonicalize_platform(platform) or (platform or "").strip()
    if not canon:
        raise ValueError("Platform is required")
    root = _media_root()
    games = root / "Games"
    if not games.is_dir():
        raise FileNotFoundError("Games folder not found")
    # Prefer exact canonical folder; else case-insensitive match on disk.
    direct = games / canon
    if direct.is_dir():
        return direct
    for child in games.iterdir():
        if child.is_dir() and child.name.casefold() == canon.casefold():
            return child
    # Allow organizing into a canonical platform even if folder is empty/missing.
    direct.mkdir(parents=True, exist_ok=True)
    return direct


def strip_region_tags(stem: str) -> str:
    text = (stem or "").strip()
    prev = None
    while prev != text:
        prev = text
        text = _REGION_TAG_RE.sub("", text).strip()
    text = re.sub(r"\s{2,}", " ", text).strip(" .-_")
    return text


def parse_rom_stem(stem: str) -> tuple[str, str | None]:
    """Return (title, franchise_or_none) from a file stem."""
    raw = (stem or "").strip()
    franchise = None
    m = _FRANCHISE_SUFFIX_RE.match(raw)
    if m:
        raw = m.group("title").strip()
        franchise = _safe_name(m.group("franchise").strip(), fallback="")
        if not franchise:
            franchise = None
    title = _safe_name(strip_region_tags(raw))
    return title, franchise


def _group_key(title: str, franchise: str | None) -> str:
    return f"{(franchise or '').casefold()}::{title.casefold()}"


def _franchise_exists_elsewhere(root: Path, franchise: str) -> bool:
    """True if a same-named franchise folder exists under Series/Movies/Books/Games."""
    safe = _safe_name(franchise)
    if not safe:
        return False
    letter = _letter_folder(safe)
    for module in ("Series", "Movies", "Books"):
        candidate = root / module / letter / safe
        if candidate.is_dir():
            return True
    games = root / "Games"
    if games.is_dir():
        for platform in games.iterdir():
            if not platform.is_dir():
                continue
            candidate = platform / letter / safe
            if candidate.is_dir():
                return True
    from app.franchise_identity import explicit_franchise_home

    return explicit_franchise_home(safe) is not None


def scan_platform_roms(platform: str) -> dict:
    platform_dir = _platform_dir(platform)
    files = [
        f
        for f in platform_dir.iterdir()
        if f.is_file() and f.suffix.casefold() in ROM_EXTENSIONS
    ]
    files.sort(key=lambda p: p.name.casefold())
    if len(files) > MAX_BATCH:
        files = files[:MAX_BATCH]
        truncated = True
    else:
        truncated = False

    groups: dict[str, dict] = {}
    for path in files:
        title, franchise = parse_rom_stem(path.stem)
        key = _group_key(title, franchise)
        row = groups.get(key)
        if not row:
            letter_src = franchise or title
            letter = _letter_folder(letter_src)
            if franchise:
                work_name = _safe_name(franchise)
                leaf_name = title
                dest_rel = (
                    f"Games/{platform_dir.name}/{letter}/{work_name}/{leaf_name}"
                )
            else:
                work_name = title
                leaf_name = title
                dest_rel = (
                    f"Games/{platform_dir.name}/{letter}/{work_name}/{leaf_name}"
                )
            root = _media_root()
            dest = root.joinpath(*dest_rel.split("/"))
            conflict = dest.is_dir()
            groups[key] = {
                "key": key,
                "title": title,
                "franchise": franchise,
                "standalone": franchise is None,
                "letter": letter,
                "dest_rel": dest_rel.replace("\\", "/"),
                "conflict": conflict,
                "action": "skip" if conflict else "organize",
                "files": [],
            }
            row = groups[key]
        row["files"].append(
            {
                "name": path.name,
                "stem": path.stem,
                "ext": path.suffix,
                "size": path.stat().st_size,
            }
        )

    items = sorted(
        groups.values(),
        key=lambda r: (
            (r.get("franchise") or r.get("title") or "").casefold(),
            (r.get("title") or "").casefold(),
        ),
    )
    return {
        "platform": platform_dir.name,
        "platform_path": str(platform_dir),
        "count": len(items),
        "file_count": sum(len(i["files"]) for i in items),
        "truncated": truncated,
        "max_batch": MAX_BATCH,
        "items": items,
    }


def _scaffold_game_leaf(leaf_dir: Path) -> None:
    from app.catalog_import import AUDIO_CATEGORIES, _gallery_tree, _mkdir_tree
    from app.folder_icons import decorate_folder, write_desktop_ini

    leaf_dir.mkdir(parents=True, exist_ok=True)
    _gallery_tree(leaf_dir)
    _mkdir_tree(
        leaf_dir,
        (*(f"Audio/{category}" for category in AUDIO_CATEGORIES),),
    )
    write_desktop_ini(leaf_dir)
    decorate_folder(leaf_dir)


def _dest_rom_name(original_name: str) -> str:
    """Strip [Franchise] and region tags from the filename; keep extension."""
    path = Path(original_name)
    title, _franchise = parse_rom_stem(path.stem)
    safe = _safe_name(title, fallback=path.stem)
    return f"{safe}{path.suffix}"


def organize_platform_roms(
    db: Session,
    platform: str,
    *,
    keys: list[str] | None = None,
) -> dict:
    preview = scan_platform_roms(platform)
    platform_dir = Path(preview["platform_path"])
    root = _media_root()
    selected = set(keys) if keys else None

    organized: list[dict] = []
    skipped: list[dict] = []
    errors: list[str] = []
    new_franchise_homes: list[str] = []

    for item in preview["items"]:
        if selected is not None and item["key"] not in selected:
            continue
        if item.get("conflict") or item.get("action") == "skip":
            skipped.append(
                {
                    "key": item["key"],
                    "title": item["title"],
                    "reason": "destination exists",
                    "dest_rel": item["dest_rel"],
                }
            )
            continue

        dest_rel = item["dest_rel"]
        leaf_dir = root.joinpath(*dest_rel.split("/"))
        work_dir = leaf_dir.parent
        try:
            if leaf_dir.exists():
                skipped.append(
                    {
                        "key": item["key"],
                        "title": item["title"],
                        "reason": "destination exists",
                        "dest_rel": dest_rel,
                    }
                )
                continue

            franchise = item.get("franchise")
            if franchise:
                exists = _franchise_exists_elsewhere(root, franchise)
                if not exists and not (work_dir / "[Artwork]").is_dir():
                    # Mark Games as franchise home when franchise is new.
                    from app.franchise_identity import set_explicit_franchise_home

                    set_explicit_franchise_home(db, franchise, "games")
                    new_franchise_homes.append(franchise)
                    (work_dir).mkdir(parents=True, exist_ok=True)
                    artwork = work_dir / "[Artwork]"
                    artwork.mkdir(parents=True, exist_ok=True)
                    from app.folder_icons import (
                        cleanup_franchise_artwork_dir,
                        decorate_folder,
                        write_desktop_ini,
                    )

                    write_desktop_ini(artwork)
                    cleanup_franchise_artwork_dir(artwork)
                    decorate_folder(work_dir)
                    decorate_folder(artwork)

            work_dir.mkdir(parents=True, exist_ok=True)
            from app.folder_icons import decorate_folder, write_desktop_ini

            write_desktop_ini(work_dir)
            decorate_folder(platform_dir)
            decorate_folder(work_dir)
            _scaffold_game_leaf(leaf_dir)

            moved: list[str] = []
            for file_info in item["files"]:
                src = platform_dir / file_info["name"]
                if not src.is_file():
                    continue
                dest_name = _dest_rom_name(file_info["name"])
                dest = leaf_dir / dest_name
                if dest.exists():
                    # Keep unique name rather than overwrite.
                    dest = leaf_dir / file_info["name"]
                shutil.move(str(src), str(dest))
                moved.append(dest.name)

            # Register leaf in games store (best-effort).
            try:
                from app.games_index import _game_id
                from app.games_store import (
                    ensure_game_leaf,
                    ensure_game_work,
                    work_slug_for_name,
                )

                work_name = franchise or item["title"]
                wslug = work_slug_for_name(work_name)
                ensure_game_work(
                    db,
                    work_slug=wslug,
                    name=work_name,
                    folder_path=_relative(work_dir, root),
                )
                ensure_game_leaf(
                    db,
                    game_id=_game_id(_relative(leaf_dir, root)),
                    title=item["title"],
                    folder_path=_relative(leaf_dir, root),
                    work_slug=wslug,
                    platform=platform_dir.name,
                )
            except Exception as exc:
                errors.append(f"{item['title']}: catalog register failed ({exc})")

            organized.append(
                {
                    "key": item["key"],
                    "title": item["title"],
                    "franchise": franchise,
                    "dest_rel": dest_rel,
                    "files": moved,
                    "needs_franchise_art": bool(
                        franchise and franchise in new_franchise_homes
                    ),
                }
            )
        except Exception as exc:
            errors.append(f"{item.get('title')}: {exc}")

    try:
        db.commit()
    except Exception:
        db.rollback()

    return {
        "platform": platform_dir.name,
        "organized": organized,
        "skipped": skipped,
        "errors": errors,
        "organized_count": len(organized),
        "skipped_count": len(skipped),
        "new_franchise_homes": new_franchise_homes,
    }


def _relative(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


async def enrich_organized_games(
    db: Session,
    *,
    platform: str,
    organized: list[dict],
) -> dict:
    """Pull IGDB metadata for exact title matches only; fill covers / franchise art."""
    from app.catalog_import import _download_primary
    from app.services import igdb as igdb_service

    if not igdb_service.igdb_configured():
        return {
            "enriched": [],
            "skipped": [
                {"title": r.get("title"), "reason": "IGDB not configured"}
                for r in organized
            ],
            "enriched_count": 0,
        }

    root = _media_root()
    enriched: list[dict] = []
    skipped: list[dict] = []

    for row in organized:
        title = str(row.get("title") or "").strip()
        dest_rel = str(row.get("dest_rel") or "").strip()
        if not title or not dest_rel:
            continue
        leaf_dir = root.joinpath(*dest_rel.split("/"))
        if not leaf_dir.is_dir():
            skipped.append({"title": title, "reason": "leaf missing"})
            continue
        try:
            await asyncio.sleep(0.35)
            hits = await igdb_service.search_games(title, limit=10)
            match = next(
                (
                    h
                    for h in hits
                    if (h.get("name") or "").strip().casefold() == title.casefold()
                ),
                None,
            )
            if not match:
                skipped.append({"title": title, "reason": "no exact IGDB match"})
                continue

            cover_url = match.get("cover_url")
            backdrop_url = match.get("backdrop_url")
            covers = leaf_dir / "Gallery" / "Covers"
            covers.mkdir(parents=True, exist_ok=True)
            await _download_primary(cover_url, covers / "Cover - Portrait")
            await _download_primary(backdrop_url, covers / "Cover - Landscape")
            from app.catalog_import import _download_igdb_gallery_extras

            await _download_igdb_gallery_extras(
                covers,
                portrait_urls=list(match.get("portrait_urls") or []),
                landscape_urls=list(match.get("landscape_urls") or []),
                skip_urls={u for u in (cover_url, backdrop_url) if u},
            )

            # Franchise home [Artwork] only when we just created Games as home
            # and IGDB matched.
            if row.get("needs_franchise_art") and row.get("franchise"):
                work_dir = leaf_dir.parent
                artwork = work_dir / "[Artwork]"
                artwork.mkdir(parents=True, exist_ok=True)
                await _download_primary(cover_url, artwork / "Cover - Portrait")
                await _download_primary(
                    backdrop_url, artwork / "Cover - Landscape"
                )
                from app.folder_icons import (
                    cleanup_franchise_artwork_dir,
                    decorate_folder,
                )

                cleanup_franchise_artwork_dir(artwork)
                decorate_folder(artwork)
                decorate_folder(work_dir)

            # Persist about metadata when possible.
            try:
                from app.games_index import _game_id
                from app.games_store import (
                    ensure_game_leaf,
                    load_game_about,
                    save_game_about,
                    work_slug_for_name,
                )

                game_id = _game_id(_relative(leaf_dir, root))
                work_name = str(row.get("franchise") or title)
                wslug = work_slug_for_name(work_name)
                ensure_game_leaf(
                    db,
                    game_id=game_id,
                    title=title,
                    folder_path=_relative(leaf_dir, root),
                    work_slug=wslug,
                    platform=platform,
                )
                about = load_game_about(
                    leaf_dir, game_id=game_id, folder_path=_relative(leaf_dir, root), db=db
                ) or {}
                about["provider"] = "igdb"
                about["provider_id"] = match.get("provider_id")
                about["overview"] = match.get("overview") or about.get("overview")
                about["date_iso"] = match.get("date_iso") or about.get("date_iso")
                if match.get("genres"):
                    about["genres"] = match.get("genres")
                if match.get("developers"):
                    about["developers"] = match.get("developers")
                if match.get("publishers"):
                    about["publishers"] = match.get("publishers")
                save_game_about(
                    about,
                    game_id=game_id,
                    title=title,
                    folder_path=_relative(leaf_dir, root),
                    work_slug=wslug,
                    platform=platform,
                    db=db,
                )
            except Exception:
                pass

            enriched.append(
                {
                    "title": title,
                    "provider_id": match.get("provider_id"),
                    "dest_rel": dest_rel,
                }
            )
        except Exception as exc:
            skipped.append({"title": title, "reason": str(exc)})

    try:
        db.commit()
    except Exception:
        db.rollback()

    return {
        "enriched": enriched,
        "skipped": skipped,
        "enriched_count": len(enriched),
        "skipped_count": len(skipped),
    }


async def organize_and_enrich(
    db: Session,
    platform: str,
    *,
    keys: list[str] | None = None,
    enrich: bool = True,
) -> dict:
    result = organize_platform_roms(db, platform, keys=keys)
    enrich_result = None
    if enrich and result.get("organized"):
        enrich_result = await enrich_organized_games(
            db,
            platform=result["platform"],
            organized=result["organized"],
        )
    return {**result, "enrich": enrich_result}
