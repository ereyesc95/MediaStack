"""Games franchise / game overview payloads (SeriesOverview-shaped)."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.franchise_identity import find_artwork_home
from app.franchise_index import (
    build_franchise_index,
    load_franchise_index,
    normalize_franchise_slug,
    related_for_path,
    save_franchise_index,
)
from app.games_index import (
    build_game_detail,
    build_work_detail,
    find_franchise_dirs,
    find_game_dir,
)
from app.related_cards import visible_related
from app.series_artwork import build_local_eras
from app.series_overview import _enrich_related_cards
from app.universes import franchise_universe_bundle


def _root() -> Path:
    return Path(settings.media_root or "")


def _ensure_index(root: Path):
    from app.franchise_index import ensure_franchise_index

    return ensure_franchise_index(root)


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


def _sibling_about_overview(
    db: Session | None,
    *,
    work_name: str,
    work_slug: str,
    artwork_home_module: str | None,
    orientation: str,
) -> dict | None:
    """Pull About art/bio from Series/Movies/Books so Games matches entry module."""
    if db is None:
        return None
    order: list[str] = []
    home = (artwork_home_module or "").casefold()
    if home in {"series", "movies", "books"}:
        order.append(home)
    for mod in ("series", "movies", "books"):
        if mod not in order:
            order.append(mod)
    for mod in order:
        try:
            if mod == "series":
                from app.series_overview import build_series_overview

                ov = build_series_overview(
                    db, work_slug, orientation=orientation
                ) or build_series_overview(
                    db, work_name, orientation=orientation
                )
            elif mod == "movies":
                from app.movies_overview import build_work_overview as build_movies_ov

                ov = build_movies_ov(
                    db, work_slug, orientation=orientation
                ) or build_movies_ov(db, work_name, orientation=orientation)
            else:
                from app.books_overview import build_work_overview as build_books_ov

                ov = build_books_ov(
                    db, work_slug, orientation=orientation
                ) or build_books_ov(db, work_name, orientation=orientation)
        except Exception:
            ov = None
        if not ov or not isinstance(ov, dict):
            continue
        if (
            ov.get("bio")
            or ov.get("eras")
            or ov.get("cover_url")
            or ov.get("portrait_url")
            or (ov.get("cast") or {}).get("characters")
            or (ov.get("cast") or {}).get("staff")
        ):
            return ov
    return None


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
    if db is not None:
        try:
            from app.games_store import load_work_about

            about_disk = load_work_about(
                primary_dir,
                work_slug=work_id,
                work_name=detail.get("name") or work_id,
                db=db,
            )
        except Exception:
            about_disk = {}
    elif primary_dir:
        # No DB session — one-time disk read only (migration path).
        try:
            from app.games_store import load_work_about

            about_disk = load_work_about(
                primary_dir,
                work_slug=work_id,
                work_name=detail.get("name") or work_id,
            )
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
    artwork_home_module = None
    try:
        artwork_home = find_artwork_home(detail.get("name") or work_id)
        if artwork_home:
            artwork_home_module = artwork_home[0]
    except Exception:
        pass

    developers = list(about_disk.get("developers") or [])
    publishers = list(
        about_disk.get("publishers")
        or ([about_disk["publisher"]] if about_disk.get("publisher") else [])
    )
    bio = (
        about_disk.get("overview")
        or about_disk.get("bio")
        or about_disk.get("summary")
        or None
    )
    has_movies = bool(related_disk.get("movies") or related_disk.get("movie"))
    has_series = bool(related_disk.get("series"))
    has_books = bool(related_disk.get("books"))
    creator = visible_related(about_disk, "creator")
    similar = visible_related(about_disk, "similar")
    music_band = None
    related_music: list = []
    if db is not None:
        try:
            from app.franchise_identity import (
                find_music_band_for_franchise,
                merge_music_band_into_related,
            )

            music_band = find_music_band_for_franchise(
                db, detail.get("name") or work_id, media_root=root
            )
            related_music = merge_music_band_into_related(
                related_disk.get("music") or [], music_band, root
            )
        except Exception:
            related_music = list(related_disk.get("music") or [])
    else:
        related_music = list(related_disk.get("music") or [])
    # SeriesAbout / franchise shell expect a SeriesOverview-shaped payload.
    slug = (
        detail.get("slug")
        or detail.get("id")
        or normalize_franchise_slug(detail.get("name") or "")
        or ""
    )
    work_name = detail.get("name") or work_id
    donor = _sibling_about_overview(
        db,
        work_name=work_name,
        work_slug=slug,
        artwork_home_module=artwork_home_module,
        orientation=orientation,
    )
    # Prefer sibling About art/bio when Games folder has none — same franchise
    # page regardless of entry module (tab order / bottom cards still Games).
    if donor:
        if not bio:
            bio = donor.get("bio")
        if not eras:
            eras = list(donor.get("eras") or [])
        if not developers:
            developers = list(
                donor.get("writers")
                or donor.get("authors")
                or donor.get("developers")
                or []
            )
        if not publishers:
            publishers = list(donor.get("publishers") or [])
        if not has_gallery and (
            donor.get("eras") or (donor.get("media") or {}).get("has_gallery")
        ):
            has_gallery = True

    cover_url = detail.get("cover_url") or (donor or {}).get("cover_url")
    portrait_url = detail.get("portrait_url") or (donor or {}).get("portrait_url")
    landscape_url = detail.get("landscape_url") or (donor or {}).get(
        "landscape_url"
    )
    banner_url = detail.get("banner_url") or (donor or {}).get("banner_url")
    logo_url = detail.get("logo_url") or (donor or {}).get("logo_url")
    icon_url = detail.get("icon_url") or (donor or {}).get("icon_url")
    badge_url = detail.get("badge_url") or (donor or {}).get("badge_url")
    cast = (donor or {}).get("cast") or {
        "characters": [],
        "staff": [],
        "people": [],
    }
    links = (donor or {}).get("links") or {"categories": []}
    genres = list((donor or {}).get("genres") or [])
    aliases = list((donor or {}).get("aliases") or [])
    activity_periods = list((donor or {}).get("activity_periods") or [])
    country = (donor or {}).get("country")
    languages = list((donor or {}).get("languages") or [])
    language_options = list((donor or {}).get("language_options") or [])
    origin_language = (donor or {}).get("origin_language")
    if donor and not creator:
        creator = list((donor.get("related") or {}).get("creator") or [])
    if donor and not similar:
        similar = list((donor.get("related") or {}).get("similar") or [])

    return {
        "id": detail.get("id"),
        "name": detail.get("name"),
        "letter": detail.get("letter"),
        "slug": slug,
        "folder_path": folder_path,
        "platforms": detail.get("platforms") or [],
        "cover_url": cover_url,
        "portrait_url": portrait_url,
        "landscape_url": landscape_url,
        "banner_url": banner_url,
        "logo_url": logo_url,
        "icon_url": icon_url,
        "badge_url": badge_url,
        "bio": bio,
        "writers": developers,
        "aliases": aliases,
        "country": country,
        "languages": languages,
        "language_options": language_options,
        "origin_language": origin_language,
        "activity_periods": activity_periods,
        "genres": genres,
        "publishers": publishers,
        "cast": cast,
        "links": links,
        "media": {
            "has_audio": has_audio,
            "has_music": bool(related_music),
            "has_series": has_series,
            "has_movies": has_movies,
            "has_books": has_books,
            # BOOKS tab flag (series shell uses has_library for cross-module books).
            "has_library": has_books,
            "has_games": len(games) > 0,
            "has_gallery": has_gallery,
        },
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
        "has_music": bool(related_music),
        "has_gallery": has_gallery,
        "has_movies": has_movies,
        "has_series": has_series,
        "has_books": has_books,
        "has_games": len(games) > 0,
        "has_library": has_books,
        "eras": eras,
        "about": {
            "overview": bio or about_disk.get("overview"),
            "studio": about_disk.get("studio") or (donor or {}).get("studio"),
            "publisher": about_disk.get("publisher"),
            "developers": developers,
            "publishers": publishers,
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
            "music": related_music,
            "creator": creator,
            "similar": similar,
            "creator_count": len(creator),
            "similar_count": len(similar),
        },
        "music_band_id": music_band.bnd_id if music_band else None,
        "universes": universes,
        "universe": universe,
        "universe_cards": universe_cards,
        "merged_universe_cards": merged_universe_cards,
        "universe_groups": universe_groups,
        "artwork_home_module": artwork_home_module,
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
    try:
        from app.games_store import load_game_about

        about_disk = load_game_about(
            game_dir,
            game_id=game_id or detail.get("id"),
            folder_path=folder_path or None,
            work_slug=(detail.get("work_id") or None),
            db=db,
        )
    except Exception:
        about_disk = {}

    work_id = detail.get("work_id") or (detail.get("franchise") or {}).get("id")
    siblings = detail.get("sibling_games") or []
    raw_genres = about_disk.get("genres") or detail.get("genre_names") or []
    genres = [
        item
        if isinstance(item, dict)
        else {"id": str(item).casefold(), "name": str(item)}
        for item in raw_genres
        if (isinstance(item, dict) and item.get("name")) or isinstance(item, str)
    ]
    developers = about_disk.get("developers") or detail.get("developers") or []
    publishers = about_disk.get("publishers") or detail.get("publishers") or []
    directors = about_disk.get("directors") or detail.get("directors") or []

    bio = about_disk.get("overview") or about_disk.get("bio") or ""
    has_movies = bool(related_disk.get("movies") or related_disk.get("movie"))
    has_series = bool(related_disk.get("series"))
    has_books = bool(related_disk.get("books"))
    leaf_creator = visible_related(about_disk, "creator")
    leaf_similar = visible_related(about_disk, "similar")
    music_band = None
    related_music: list = []
    if db is not None:
        try:
            from app.franchise_identity import (
                find_music_band_for_franchise,
                merge_music_band_into_related,
            )

            franchise_name = (
                (detail.get("franchise") or {}).get("name")
                or detail.get("work_name")
                or work_id
            )
            music_band = find_music_band_for_franchise(
                db, franchise_name, media_root=root
            )
            related_music = merge_music_band_into_related(
                related_disk.get("music") or [], music_band, root
            )
        except Exception:
            related_music = list(related_disk.get("music") or [])
    else:
        related_music = list(related_disk.get("music") or [])

    web_url = str(about_disk.get("web_url") or detail.get("web_url") or "").strip()
    if web_url and "://" not in web_url:
        web_url = f"https://{web_url.lstrip('/')}"
    platform = (
        about_disk.get("platform")
        or detail.get("platform")
        or (about_disk.get("platforms") or [None])[0]
    )
    platform_cf = str(platform or "").casefold()
    prefer_web = bool(web_url) and (
        platform_cf in {"browser", "web", "flash"} or not detail.get("has_rom")
    )
    open_url = web_url if prefer_web else detail.get("open_url")
    open_mode = "web" if prefer_web else detail.get("open_mode")
    has_rom = bool(detail.get("has_rom") or prefer_web)
    open_label = (
        "Play game"
        if has_rom
        else detail.get("open_label")
    )
    release = (
        about_disk.get("release_date")
        or about_disk.get("date_iso")
        or detail.get("date_iso")
        or detail.get("display_date")
        or ""
    )
    release_s = str(release).strip()
    languages = [
        str(x).strip()
        for x in (about_disk.get("languages") or [])
        if str(x).strip()
    ]

    work_slug = (
        work_id
        or (detail.get("franchise") or {}).get("slug")
        or (detail.get("franchise") or {}).get("id")
        or normalize_franchise_slug(detail.get("work_name") or "")
        or ""
    )

    return {
        "id": detail.get("id"),
        "title": detail.get("title"),
        "name": detail.get("title"),
        "date_iso": detail.get("date_iso") or release_s or None,
        "display_date": detail.get("display_date") or release_s or None,
        "slug": work_slug,
        "folder_path": folder_path,
        "platform": platform,
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
        "rom_bytes": detail.get("rom_bytes"),
        "rom_filename": detail.get("rom_filename"),
        "web_url": web_url or None,
        "open_url": open_url,
        "open_mode": open_mode,
        "open_label": open_label,
        "has_rom": has_rom,
        "has_audio": has_audio,
        "has_gallery": has_gallery,
        "has_movies": has_movies,
        "has_series": has_series,
        "has_books": has_books,
        "has_games": len(siblings) > 0,
        "bio": bio,
        "genres": genres,
        "languages": languages,
        "activity_periods": (
            [{"label": release_s, "start": release_s, "end": release_s}]
            if release_s
            else []
        ),
        "writers": directors,
        "developers": developers,
        "publishers": publishers,
        "directors": directors,
        "cast": about_disk.get("cast") or {},
        "links": about_disk.get("links") or {},
        "photocards": detail.get("photocards")
        or about_disk.get("photocards")
        or None,
        "work": {"id": work_id, "name": detail.get("work_name")},
        "games": siblings,
        "films": siblings,
        "sibling_games": siblings,
        "eras": eras,
        "media": {
            "has_audio": has_audio,
            "has_music": bool(related_music),
            "has_series": has_series,
            "has_movies": has_movies,
            "has_library": has_books,
            "has_books": has_books,
            "has_games": len(siblings) > 0,
            "has_gallery": has_gallery,
        },
        "about": {
            "overview": bio,
            "studio": about_disk.get("studio"),
            "publisher": about_disk.get("publisher"),
            "developers": developers,
            "publishers": publishers,
            "directors": directors,
            "genres": genres,
            "platform": platform,
            "platforms": about_disk.get("platforms") or ([platform] if platform else []),
            "release_date": release_s or detail.get("display_date") or detail.get("date_iso"),
            "web_url": web_url or None,
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
            "music": related_music,
            "creator": leaf_creator,
            "similar": leaf_similar,
            "creator_count": len(leaf_creator),
            "similar_count": len(leaf_similar),
        },
        "music_band_id": music_band.bnd_id if music_band else None,
        "franchise": detail.get("franchise"),
        "module": "games",
    }


def build_games_gallery(
    folder_path: str,
    media_root: Path | None = None,
    *,
    nsfw_unlocked: bool = False,
) -> dict:
    from app.series_index import build_series_gallery

    root = media_root or _root()
    return build_series_gallery(folder_path, root, nsfw_unlocked=nsfw_unlocked)
