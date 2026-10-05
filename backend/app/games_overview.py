"""Games franchise / game overview payloads (SeriesOverview-shaped)."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.franchise_identity import find_artwork_home
from app.franchise_index import (
    build_franchise_index,
    load_franchise_index,
    related_for_path,
    save_franchise_index,
)
from app.games_index import (
    build_game_detail,
    build_work_detail,
    find_franchise_dirs,
    find_game_dir,
)
from app.series_artwork import build_local_eras
from app.series_overview import _enrich_related_cards
from app.universes import franchise_universe_bundle


def _root() -> Path:
    return Path(settings.media_root or "")


def _ensure_index(root: Path):
    index = load_franchise_index()
    if index is None and root.is_dir():
        index = build_franchise_index(root)
        save_franchise_index(index)
    return index


def _related_for_path(root: Path, folder_path: str, work_name: str = ""):
    index = _ensure_index(root)
    related = related_for_path(index, folder_path) if index else {}
    has_any = any(
        related.get(k) for k in ("series", "movies", "movie", "books", "music")
    )
    if has_any or not root.is_dir():
        return related
    index = build_franchise_index(root)
    save_franchise_index(index)
    related = related_for_path(index, folder_path) if index else {}
    if any(related.get(k) for k in ("series", "movies", "movie", "books", "music")):
        return related
    if work_name and index:
        from app.franchise_index import _KIND_BUCKETS, normalize_franchise_slug
        from dataclasses import asdict

        slug = normalize_franchise_slug(work_name)
        group = index.franchises.get(slug) if slug else None
        if group:
            out: dict[str, list] = {b: [] for b in _KIND_BUCKETS.values()}
            norm = folder_path.replace("\\", "/").casefold().rstrip("/")
            for entry in group.entries:
                if entry.path.casefold().rstrip("/") == norm:
                    continue
                if entry.kind == "game":
                    continue
                bucket = _KIND_BUCKETS.get(entry.kind, "music")
                out[bucket].append(asdict(entry))
            return out
    return related


def _has_audio(folder: Path) -> bool:
    for audio_name in ("[Audio]", "Audio", "audio"):
        d = folder / audio_name
        if d.is_dir():
            try:
                if any(d.iterdir()):
                    return True
            except OSError:
                pass
    return False


def _has_gallery(folder: Path) -> bool:
    try:
        from app.series_paths import has_gallery_images

        return has_gallery_images(folder)
    except Exception:
        return False


def build_work_overview(
    work_id: str,
    db: Session | None = None,
    *,
    orientation: str = "portrait",
) -> dict | None:
    root = _root()
    detail = build_work_detail(work_id, root)
    if not detail:
        return None
    hits = find_franchise_dirs(work_id, root)
    primary_dir = hits[0][0] if hits else None
    folder_path = detail.get("folder_path") or (
        primary_dir.relative_to(root).as_posix() if primary_dir else ""
    )
    related_disk = _related_for_path(root, folder_path, detail.get("name") or "")
    games = detail.get("games") or []
    has_audio = any(
        _has_audio(root / (g.get("folder_path") or ""))
        for g in games
        if g.get("folder_path")
    )
    if primary_dir and _has_audio(primary_dir):
        has_audio = True
    has_gallery = _has_gallery(primary_dir) if primary_dir else False
    if not has_gallery:
        for g in games:
            fp = g.get("folder_path")
            if fp and _has_gallery(root / fp):
                has_gallery = True
                break

    eras = []
    if primary_dir:
        try:
            eras = build_local_eras(primary_dir, root, orientation=orientation)
        except Exception:
            eras = []

    about_disk: dict = {}
    if primary_dir:
        about_path = primary_dir / "[Artwork]" / "about.json"
        if about_path.is_file():
            try:
                import json

                about_disk = json.loads(about_path.read_text(encoding="utf-8"))
            except Exception:
                about_disk = {}

    universes: list = []
    universe = None
    universe_cards: list = []
    merged_universe_cards: list = []
    universe_groups: list = []
    if db is not None:
        try:
            (
                universes,
                universe,
                universe_cards,
                merged_universe_cards,
                universe_groups,
            ) = franchise_universe_bundle(db, "games", work_id)
        except Exception:
            pass

    artwork_home = None
    try:
        artwork_home = find_artwork_home(detail.get("name") or work_id)
    except Exception:
        pass

    return {
        "id": detail.get("id"),
        "name": detail.get("name"),
        "letter": detail.get("letter"),
        "folder_path": folder_path,
        "platforms": detail.get("platforms") or [],
        "cover_url": detail.get("cover_url"),
        "portrait_url": detail.get("portrait_url"),
        "landscape_url": detail.get("landscape_url"),
        "banner_url": detail.get("banner_url"),
        "logo_url": detail.get("logo_url"),
        "icon_url": detail.get("icon_url"),
        "badge_url": detail.get("badge_url"),
        "games": games,
        "films": games,
        "subseries": [
            {
                "id": g["id"],
                "title": g.get("title"),
                "date_iso": g.get("date_iso"),
                "display_date": g.get("display_date"),
                "cover_url": g.get("cover_url"),
                "portrait_url": g.get("portrait_url"),
                "landscape_url": g.get("landscape_url"),
                "banner_url": g.get("banner_url"),
                "platform": g.get("platform"),
                "folder_path": g.get("folder_path"),
            }
            for g in games
        ],
        "game_count": detail.get("game_count") or len(games),
        "is_standalone": detail.get("is_standalone"),
        "primary_game_id": detail.get("primary_game_id"),
        "primary_film_id": detail.get("primary_film_id"),
        "has_audio": has_audio,
        "has_gallery": has_gallery,
        "has_movies": bool(related_disk.get("movies") or related_disk.get("movie")),
        "has_series": bool(related_disk.get("series")),
        "has_books": bool(related_disk.get("books")),
        "has_games": len(games) > 0,
        "has_library": False,
        "eras": eras,
        "about": {
            "overview": about_disk.get("overview"),
            "studio": about_disk.get("studio"),
            "publisher": about_disk.get("publisher"),
            "developers": about_disk.get("developers") or [],
            "publishers": about_disk.get("publishers") or [],
            "platforms": detail.get("platforms") or about_disk.get("platforms") or [],
            "igdb_id": about_disk.get("igdb_id"),
        },
        "related": {
            "movies": _enrich_related_cards(
                related_disk.get("movies") or related_disk.get("movie") or [],
                root,
            ),
            "series": _enrich_related_cards(related_disk.get("series") or [], root),
            "books": _enrich_related_cards(related_disk.get("books") or [], root),
            "games": games,
            "music": _enrich_related_cards(related_disk.get("music") or [], root),
        },
        "universes": universes,
        "universe": universe,
        "universe_cards": universe_cards,
        "merged_universe_cards": merged_universe_cards,
        "universe_groups": universe_groups,
        "artwork_home": artwork_home,
        "module": "games",
    }


def build_game_overview(
    game_id: str,
    db: Session | None = None,
    *,
    orientation: str = "portrait",
) -> dict | None:
    root = _root()
    detail = build_game_detail(game_id, root)
    if not detail:
        return None
    found = find_game_dir(game_id, root)
    game_dir = found[0] if found else None
    folder_path = detail.get("folder_path") or ""
    related_disk = _related_for_path(
        root, folder_path, (detail.get("franchise") or {}).get("name") or ""
    )
    has_audio = bool(game_dir and _has_audio(game_dir))
    has_gallery = bool(game_dir and _has_gallery(game_dir))
    eras = []
    if game_dir:
        try:
            eras = build_local_eras(game_dir, root, orientation=orientation)
        except Exception:
            eras = []

    about_disk: dict = {}
    if game_dir:
        about_path = game_dir / "[Artwork]" / "about.json"
        if about_path.is_file():
            try:
                import json

                about_disk = json.loads(about_path.read_text(encoding="utf-8"))
            except Exception:
                about_disk = {}

    work_id = detail.get("work_id") or (detail.get("franchise") or {}).get("id")
    siblings = detail.get("sibling_games") or []

    return {
        "id": detail.get("id"),
        "title": detail.get("title"),
        "name": detail.get("title"),
        "date_iso": detail.get("date_iso"),
        "display_date": detail.get("display_date"),
        "folder_path": folder_path,
        "platform": detail.get("platform"),
        "work_id": work_id,
        "work_name": detail.get("work_name"),
        "cover_url": detail.get("cover_url"),
        "portrait_url": detail.get("portrait_url"),
        "landscape_url": detail.get("landscape_url"),
        "banner_url": detail.get("banner_url"),
        "logo_url": detail.get("logo_url"),
        "icon_url": detail.get("icon_url"),
        "badge_url": detail.get("badge_url"),
        "launch_path": detail.get("launch_path"),
        "open_url": detail.get("open_url"),
        "open_mode": detail.get("open_mode"),
        "open_label": detail.get("open_label"),
        "has_rom": detail.get("has_rom"),
        "has_audio": has_audio,
        "has_gallery": has_gallery,
        "has_movies": bool(related_disk.get("movies") or related_disk.get("movie")),
        "has_series": bool(related_disk.get("series")),
        "has_books": bool(related_disk.get("books")),
        "has_games": len(siblings) > 0,
        "games": siblings,
        "films": siblings,
        "sibling_games": siblings,
        "eras": eras,
        "about": {
            "overview": about_disk.get("overview"),
            "studio": about_disk.get("studio"),
            "publisher": about_disk.get("publisher"),
            "developers": about_disk.get("developers") or [],
            "publishers": about_disk.get("publishers") or [],
            "platform": detail.get("platform"),
            "platforms": about_disk.get("platforms") or [],
            "release_date": detail.get("display_date") or detail.get("date_iso"),
            "igdb_id": about_disk.get("igdb_id"),
        },
        "related": {
            "movies": _enrich_related_cards(
                related_disk.get("movies") or related_disk.get("movie") or [],
                root,
            ),
            "series": _enrich_related_cards(related_disk.get("series") or [], root),
            "books": _enrich_related_cards(related_disk.get("books") or [], root),
            "games": siblings,
            "music": _enrich_related_cards(related_disk.get("music") or [], root),
        },
        "franchise": detail.get("franchise"),
        "module": "games",
    }


def build_games_gallery(folder_path: str, media_root: Path | None = None) -> dict:
    from app.series_index import build_series_gallery

    root = media_root or _root()
    return build_series_gallery(folder_path, root)
