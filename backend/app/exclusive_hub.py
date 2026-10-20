"""Cross-module Exclusive hub index for PhotosStack (NSFW-gated).

Scans Photos/Exclusive/{person}/ and leaf Exclusive folders under Music /
Movies / Series / Books / Games. Photos/videos only (no audio).
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

from app.config import settings
from app.gallery import IMAGE_EXTS
from app.media_item_overview import _file_url

VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v"}
MEDIA_EXTS = set(IMAGE_EXTS) | VIDEO_EXTS

DATE_PREFIX_RE = re.compile(
    r"^(\d{4}(?:\.\d{2}(?:\.\d{2})?)?)\.\s+(.+)$"
)

MODULE_ORDER = ("photos", "music", "series", "movies", "books", "games")


def _media_root() -> Path | None:
    root = Path(settings.media_root or "")
    return root if root.is_dir() else None


def _item_id(rel: str) -> str:
    digest = hashlib.sha256(rel.casefold().encode("utf-8")).hexdigest()[:12]
    return f"exh_{digest}"


def _strip_date_prefix(name: str) -> str:
    m = DATE_PREFIX_RE.match(name.strip())
    return (m.group(2) if m else name).strip() or name


def _kind(suffix: str) -> str:
    return "video" if suffix.lower() in VIDEO_EXTS else "image"


def _file_item(
    f: Path,
    *,
    root: Path,
    source_id: str,
    source_title: str,
    franchise_title: str | None,
    module: str,
    link: dict,
    nav_folder: str,
) -> dict | None:
    if not f.is_file() or f.suffix.lower() not in MEDIA_EXTS:
        return None
    rel = f.relative_to(root).as_posix()
    url = _file_url(f, root)
    if not url:
        return None
    return {
        "id": _item_id(rel),
        "url": url,
        "thumb_url": url if _kind(f.suffix) == "image" else None,
        "title": f.stem,
        "kind": _kind(f.suffix),
        "module": module,
        "source_id": source_id,
        "source_title": source_title,
        "franchise_title": franchise_title,
        "folder_path": nav_folder,
        "link": link,
    }


def _list_media_files(folder: Path, *, recursive: bool) -> list[Path]:
    out: list[Path] = []
    if not folder.is_dir():
        return out
    try:
        if recursive:
            for p in folder.rglob("*"):
                if p.is_file() and p.suffix.lower() in MEDIA_EXTS:
                    out.append(p)
        else:
            for p in folder.iterdir():
                if p.is_file() and p.suffix.lower() in MEDIA_EXTS:
                    out.append(p)
    except OSError:
        pass
    out.sort(key=lambda p: p.name.casefold())
    return out


def _source_key(module: str, title: str, franchise: str | None = None) -> str:
    base = f"{module}:{title.casefold()}"
    if franchise:
        base += f":{franchise.casefold()}"
    return base


def _scan_photos(root: Path) -> list[dict]:
    exclusive = root / "Photos" / "Exclusive"
    if not exclusive.is_dir():
        return []
    sources: list[dict] = []
    try:
        people = sorted(
            (p for p in exclusive.iterdir() if p.is_dir() and not p.name.startswith(".")),
            key=lambda p: p.name.casefold(),
        )
    except OSError:
        return []
    for person in people:
        files = _list_media_files(person, recursive=True)
        if not files:
            continue
        sid = _source_key("photos", person.name)
        nav = f"Photos/Exclusive/{person.name}"
        link = {"type": "photos_person", "name": person.name}
        items = [
            it
            for f in files
            if (
                it := _file_item(
                    f,
                    root=root,
                    source_id=sid,
                    source_title=person.name,
                    franchise_title=None,
                    module="photos",
                    link=link,
                    nav_folder=nav,
                )
            )
        ]
        if not items:
            continue
        sources.append(
            {
                "id": sid,
                "module": "photos",
                "title": person.name,
                "franchise_title": None,
                "folder_path": nav,
                "link": link,
                "has_images": any(i["kind"] == "image" for i in items),
                "has_videos": any(i["kind"] == "video" for i in items),
                "items": items,
            }
        )
    return sources


def _scan_music(root: Path) -> list[dict]:
    music = root / "Music"
    if not music.is_dir():
        return []
    sources: list[dict] = []
    try:
        letters = [p for p in music.iterdir() if p.is_dir() and len(p.name) == 1]
    except OSError:
        return []
    for letter in letters:
        try:
            artists = [p for p in letter.iterdir() if p.is_dir()]
        except OSError:
            continue
        for artist in artists:
            exclusive = artist / "[Artwork]" / "Exclusive"
            if not exclusive.is_dir():
                # Case-insensitive Exclusive under [Artwork]
                artwork = artist / "[Artwork]"
                if artwork.is_dir():
                    try:
                        for child in artwork.iterdir():
                            if child.is_dir() and child.name.casefold() == "exclusive":
                                exclusive = child
                                break
                    except OSError:
                        pass
            if not exclusive.is_dir():
                continue
            files = _list_media_files(exclusive, recursive=False)
            if not files:
                continue
            title = artist.name
            sid = _source_key("music", title)
            nav = artist.relative_to(root).as_posix()
            link = {"type": "artist", "name": title}
            items = [
                it
                for f in files
                if (
                    it := _file_item(
                        f,
                        root=root,
                        source_id=sid,
                        source_title=title,
                        franchise_title=None,
                        module="music",
                        link=link,
                        nav_folder=nav,
                    )
                )
            ]
            if not items:
                continue
            sources.append(
                {
                    "id": sid,
                    "module": "music",
                    "title": title,
                    "franchise_title": None,
                    "folder_path": nav,
                    "link": link,
                    "has_images": any(i["kind"] == "image" for i in items),
                    "has_videos": any(i["kind"] == "video" for i in items),
                    "items": items,
                }
            )
    return sources


def _find_exclusive_under_gallery(leaf: Path) -> Path | None:
    gallery = leaf / "Gallery"
    if not gallery.is_dir():
        try:
            for child in leaf.iterdir():
                if child.is_dir() and child.name.casefold() == "gallery":
                    gallery = child
                    break
        except OSError:
            return None
    if not gallery.is_dir():
        return None
    direct = gallery / "Exclusive"
    if direct.is_dir():
        return direct
    try:
        for child in gallery.iterdir():
            if child.is_dir() and child.name.casefold() == "exclusive":
                return child
    except OSError:
        pass
    return None


def _is_letter_tier(name: str) -> bool:
    return len(name) == 1 and name.isalpha()


def _is_dated_or_title_leaf(name: str) -> bool:
    if name.startswith("[") or name.casefold() in {
        "gallery",
        "audio",
        "extras",
        "episodes",
        "specials",
        "artwork",
    }:
        return False
    return True


def _scan_letter_module(
    root: Path,
    module_dir: str,
    module: str,
    link_type: str,
) -> list[dict]:
    """Movies/Series/Books: {Module}/{Letter}/{Franchise}/{leaf?}/Gallery/Exclusive."""
    base = root / module_dir
    if not base.is_dir():
        return []
    sources: list[dict] = []
    try:
        letters = [p for p in base.iterdir() if p.is_dir()]
    except OSError:
        return []
    for letter in letters:
        try:
            franchises = [p for p in letter.iterdir() if p.is_dir()]
        except OSError:
            continue
        for franchise in franchises:
            # Standalone: Exclusive on franchise root Gallery
            leaves: list[tuple[Path, str | None]] = []
            exclusive_root = _find_exclusive_under_gallery(franchise)
            if exclusive_root:
                leaves.append((franchise, None))
            try:
                children = [p for p in franchise.iterdir() if p.is_dir()]
            except OSError:
                children = []
            for child in children:
                if child.name.casefold() in {"[artwork]", "artwork", "gallery", "audio", "extras", "episodes", "specials"}:
                    continue
                if not _is_dated_or_title_leaf(child.name):
                    continue
                ex = _find_exclusive_under_gallery(child)
                if ex:
                    leaves.append((child, franchise.name))

            for leaf, franchise_name in leaves:
                exclusive = _find_exclusive_under_gallery(leaf)
                if not exclusive:
                    continue
                files = _list_media_files(exclusive, recursive=False)
                if not files:
                    continue
                title = _strip_date_prefix(leaf.name)
                # Standalone: franchise_title omitted when leaf is franchise root
                is_standalone = franchise_name is None and leaf == franchise
                ft = None if is_standalone else (franchise_name or franchise.name)
                if ft and ft.casefold() == title.casefold():
                    ft = None
                sid = _source_key(module, title, ft)
                nav = leaf.relative_to(root).as_posix()
                link = {
                    "type": link_type,
                    "path": nav,
                    "title": title,
                    "franchise": ft or franchise.name,
                }
                items = [
                    it
                    for f in files
                    if (
                        it := _file_item(
                            f,
                            root=root,
                            source_id=sid,
                            source_title=title,
                            franchise_title=ft,
                            module=module,
                            link=link,
                            nav_folder=nav,
                        )
                    )
                ]
                if not items:
                    continue
                # Merge duplicates (same title under same franchise)
                existing = next((s for s in sources if s["id"] == sid), None)
                if existing:
                    existing["items"].extend(items)
                    existing["has_images"] = existing["has_images"] or any(
                        i["kind"] == "image" for i in items
                    )
                    existing["has_videos"] = existing["has_videos"] or any(
                        i["kind"] == "video" for i in items
                    )
                else:
                    sources.append(
                        {
                            "id": sid,
                            "module": module,
                            "title": title,
                            "franchise_title": ft,
                            "folder_path": nav,
                            "link": link,
                            "has_images": any(i["kind"] == "image" for i in items),
                            "has_videos": any(i["kind"] == "video" for i in items),
                            "items": items,
                        }
                    )
    return sources


def _scan_games(root: Path) -> list[dict]:
    """Games/{Platform}/{Letter}/{Franchise}/{date}. {Game}/Gallery/Exclusive."""
    games = root / "Games"
    if not games.is_dir():
        return []
    by_key: dict[str, dict] = {}
    try:
        platforms = [p for p in games.iterdir() if p.is_dir()]
    except OSError:
        return []
    for platform in platforms:
        try:
            letters = [p for p in platform.iterdir() if p.is_dir()]
        except OSError:
            continue
        for letter in letters:
            try:
                franchises = [p for p in letter.iterdir() if p.is_dir()]
            except OSError:
                continue
            for franchise in franchises:
                # 3-tier one-off: Exclusive on franchise (title) folder
                candidates: list[tuple[Path, str | None]] = []
                if _find_exclusive_under_gallery(franchise):
                    candidates.append((franchise, None))
                try:
                    children = [p for p in franchise.iterdir() if p.is_dir()]
                except OSError:
                    children = []
                for child in children:
                    if child.name.casefold() in {
                        "[artwork]",
                        "artwork",
                        "gallery",
                        "audio",
                        "extras",
                    }:
                        continue
                    if _find_exclusive_under_gallery(child):
                        candidates.append((child, franchise.name))
                for leaf, franchise_name in candidates:
                    exclusive = _find_exclusive_under_gallery(leaf)
                    if not exclusive:
                        continue
                    files = _list_media_files(exclusive, recursive=False)
                    if not files:
                        continue
                    title = _strip_date_prefix(leaf.name)
                    ft = franchise_name
                    if ft and ft.casefold() == title.casefold():
                        ft = None
                    # Merge across platforms by title + franchise
                    sid = _source_key("games", title, ft or franchise.name)
                    nav = leaf.relative_to(root).as_posix()
                    link = {
                        "type": "game",
                        "path": nav,
                        "title": title,
                        "franchise": ft or franchise.name,
                        "platform": platform.name,
                    }
                    items = [
                        it
                        for f in files
                        if (
                            it := _file_item(
                                f,
                                root=root,
                                source_id=sid,
                                source_title=title,
                                franchise_title=ft,
                                module="games",
                                link=link,
                                nav_folder=nav,
                            )
                        )
                    ]
                    if not items:
                        continue
                    if sid in by_key:
                        by_key[sid]["items"].extend(items)
                        by_key[sid]["has_images"] = by_key[sid]["has_images"] or any(
                            i["kind"] == "image" for i in items
                        )
                        by_key[sid]["has_videos"] = by_key[sid]["has_videos"] or any(
                            i["kind"] == "video" for i in items
                        )
                    else:
                        by_key[sid] = {
                            "id": sid,
                            "module": "games",
                            "title": title,
                            "franchise_title": ft,
                            "folder_path": nav,
                            "link": link,
                            "has_images": any(i["kind"] == "image" for i in items),
                            "has_videos": any(i["kind"] == "video" for i in items),
                            "items": items,
                        }
    return list(by_key.values())


def _merge_link_only_sources(sources: list[dict]) -> tuple[list[dict], bool]:
    """Ensure dropdown entries exist for Exclusive links without folder media."""
    try:
        from app.database import SessionLocal
        from app.exclusive_links import normalize_entity_key
        from app.models import ExclusiveLink
    except Exception:
        return sources, False

    db = SessionLocal()
    has_links = False
    try:
        rows = db.query(ExclusiveLink).all()
        has_links = bool(rows)
        by_id = {s["id"]: s for s in sources}
        for row in rows:
            sid = _source_key(
                row.exl_media_type,
                row.exl_entity_name,
                row.exl_franchise_name,
            )
            # Match existing source by module + normalized entity name
            existing = None
            for s in sources:
                if s["module"] != row.exl_media_type:
                    continue
                if normalize_entity_key(s.get("title") or "") == row.exl_entity_key:
                    existing = s
                    break
            if existing:
                existing["has_links"] = True
                continue
            if sid in by_id:
                by_id[sid]["has_links"] = True
                continue
            link = {
                "type": {
                    "photos": "photos_person",
                    "music": "artist",
                    "movies": "movie",
                    "series": "series",
                    "books": "book",
                    "games": "game",
                }.get(row.exl_media_type, "photos_person"),
                "name": row.exl_entity_name
                if row.exl_media_type in {"photos", "music"}
                else None,
                "path": None,
                "title": row.exl_entity_name,
                "franchise": row.exl_franchise_name,
            }
            entry = {
                "id": sid,
                "module": row.exl_media_type,
                "title": row.exl_entity_name,
                "franchise_title": row.exl_franchise_name,
                "folder_path": None,
                "link": link,
                "has_images": False,
                "has_videos": False,
                "has_links": True,
                "items": [],
            }
            sources.append(entry)
            by_id[sid] = entry
    finally:
        db.close()
    return sources, has_links


def build_exclusive_hub(*, ensure_photos_exclusive: bool = True) -> dict:
    """Build Exclusive hub payload. Caller must gate on NSFW unlock."""
    root = _media_root()
    if not root:
        return {
            "modules": [],
            "sources": [],
            "available": False,
        }

    if ensure_photos_exclusive:
        from app.folder_icons import ensure_exclusive_folder

        ensure_exclusive_folder(root / "Photos" / "Exclusive")

    # Opportunistic cleanup of franchise [Artwork] mistrees while scanning.
    try:
        from app.folder_icons import cleanup_all_franchise_artwork

        cleanup_all_franchise_artwork()
    except Exception:
        pass

    sources: list[dict] = []
    sources.extend(_scan_photos(root))
    sources.extend(_scan_music(root))
    sources.extend(_scan_letter_module(root, "Series", "series", "series"))
    sources.extend(_scan_letter_module(root, "Movies", "movies", "movie"))
    sources.extend(_scan_letter_module(root, "Books", "books", "book"))
    sources.extend(_scan_games(root))
    sources, has_links = _merge_link_only_sources(sources)

    # Sort items within each source; sort sources by title.
    for src in sources:
        src.setdefault("has_links", False)
        src["items"].sort(
            key=lambda i: (
                (i.get("source_title") or "").casefold(),
                (i.get("title") or "").casefold(),
            )
        )
    sources.sort(
        key=lambda s: (
            MODULE_ORDER.index(s["module"])
            if s["module"] in MODULE_ORDER
            else 99,
            (s.get("title") or "").casefold(),
            (s.get("franchise_title") or "").casefold(),
        )
    )

    modules_present = []
    for mod in MODULE_ORDER:
        if any(s["module"] == mod for s in sources):
            modules_present.append(mod)

    return {
        "modules": modules_present,
        "sources": sources,
        "available": bool(sources) or has_links,
    }
