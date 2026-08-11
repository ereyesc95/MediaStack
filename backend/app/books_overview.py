"""Books franchise / book overview payloads (SeriesOverview-shaped)."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.books_index import (
    build_book_detail,
    build_work_detail,
    find_book_dir,
    find_work_dir,
)
from app.config import settings
from app.franchise_index import (
    build_franchise_index,
    load_franchise_index,
    related_for_path,
    save_franchise_index,
)
from app.series_artwork import build_local_eras
from app.series_overview import _enrich_related_cards
from app.universes import (
    filter_similar_against_universe,
    franchise_universe_bundle,
)


def _root() -> Path:
    return Path(settings.media_root or "")


def _ensure_index(root: Path):
    """Load franchise index; rebuild when missing or Books work has no related hits."""
    index = load_franchise_index()
    if index is None and root.is_dir():
        index = build_franchise_index(root)
        save_franchise_index(index)
    return index


def _related_for_work(root: Path, folder_path: str, work_name: str = ""):
    """Resolve related media; rebuild index once if the first pass is empty."""
    index = _ensure_index(root)
    related = related_for_path(index, folder_path) if index else {}
    has_any = any(related.get(k) for k in ("series", "movies", "movie", "games", "music"))
    if has_any or not root.is_dir():
        return related
    # Stale index (e.g. missing ancestor match / new folders) — rebuild once.
    index = build_franchise_index(root)
    save_franchise_index(index)
    related = related_for_path(index, folder_path) if index else {}
    if any(related.get(k) for k in ("series", "movies", "movie", "games", "music")):
        return related
    # Last resort: resolve by shared franchise slug from work folder name.
    if work_name and index:
        from app.franchise_index import franchise_slug_for_path, normalize_franchise_slug

        slug = normalize_franchise_slug(work_name)
        # Try a synthetic Series path under the same letter bucket.
        for probe in (
            folder_path,
            f"Series/{(folder_path.split('/')[1] if '/' in folder_path else 'D')}/{work_name}",
            f"Movies/{(folder_path.split('/')[1] if '/' in folder_path else 'D')}/{work_name}",
        ):
            hit = related_for_path(index, probe)
            if any(hit.get(k) for k in ("series", "movies", "movie", "games")):
                # Drop self-kind books when probing other modules' paths
                return hit
        # Direct group lookup
        group = index.franchises.get(slug)
        if group:
            from dataclasses import asdict
            from app.franchise_index import _KIND_BUCKETS

            out: dict[str, list] = {b: [] for b in _KIND_BUCKETS.values()}
            norm = folder_path.replace("\\", "/").casefold().rstrip("/")
            for entry in group.entries:
                if entry.path.casefold().rstrip("/") == norm:
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


def build_books_gallery(folder_path: str, media_root: Path | None = None) -> dict:
    from app.series_index import build_series_gallery

    root = media_root or _root()
    return build_series_gallery(folder_path, root)


def build_work_overview(
    db: Session, work_id: str, *, orientation: str = "portrait"
) -> dict | None:
    root = _root()
    detail = build_work_detail(work_id, root)
    if not detail:
        return None
    found = find_work_dir(work_id, root)
    if not found:
        return None
    work_dir, _letter = found
    folder_path = detail.get("folder_path") or ""
    books = detail.get("books") or detail.get("films") or []

    local_eras = build_local_eras(work_dir, root)
    has_gallery = bool(local_eras)
    try:
        from app.series_index import _has_gallery

        has_gallery = has_gallery or _has_gallery(work_dir)
        if not has_gallery:
            for b in books:
                bp = (b.get("folder_path") or "").replace("\\", "/")
                if bp and _has_gallery(root / bp):
                    has_gallery = True
                    break
    except Exception:
        pass

    related_disk = _related_for_work(
        root, folder_path, work_name=work_dir.name if work_dir else ""
    )
    slug = detail.get("slug") or detail.get("id") or work_id

    universes, universe, universe_cards, merged_universe_cards, universe_groups = (
        franchise_universe_bundle(db, "books", slug)
    )
    from app.books_refresh import load_work_about

    about = load_work_about(work_dir)
    authors = about.get("authors") or about.get("writers") or []
    if isinstance(authors, str):
        authors = [
            a.strip()
            for a in authors.replace(",", ";").split(";")
            if a.strip()
        ]
    bio = None
    if about.get("bio_manual") and about.get("bio") is not None:
        bio = about.get("bio")
    if bio is None:
        bio = (universe or {}).get("overview") if universe else None
    if bio is None:
        bio = about.get("bio")

    books_as_subseries = [
        {
            "id": b["id"],
            "title": b.get("title"),
            "date_iso": b.get("date_iso"),
            "display_date": b.get("display_date"),
            "cover_url": b.get("cover_url"),
            "logo_url": b.get("logo_url"),
            "icon_url": b.get("icon_url"),
            "badge_url": b.get("badge_url"),
            "folder_path": b.get("folder_path"),
            "season_count": b.get("volume_count") or 0,
            "hub_title": b.get("hub_title"),
        }
        for b in books
    ]

    media = {
        "has_audio": _has_audio(work_dir),
        "has_series": bool(related_disk.get("series")),
        "has_movies": bool(related_disk.get("movies") or related_disk.get("movie")),
        "has_library": len(books) > 1,
        "has_books": len(books) > 0,
        "has_games": bool(related_disk.get("games")),
        "has_gallery": has_gallery,
    }

    related = {
        "movies": _enrich_related_cards(
            related_disk.get("movies") or related_disk.get("movie") or [], root
        ),
        "series": _enrich_related_cards(related_disk.get("series") or [], root),
        "books": [],
        "games": _enrich_related_cards(related_disk.get("games") or [], root),
        "creator": [],
        "similar": filter_similar_against_universe(db, "books", slug, []),
    }

    return {
        "id": detail["id"],
        "name": detail.get("name"),
        "letter": detail.get("letter"),
        "folder_path": folder_path,
        "cover_url": detail.get("cover_url"),
        "portrait_url": detail.get("portrait_url"),
        "landscape_url": detail.get("landscape_url"),
        "banner_url": detail.get("banner_url"),
        "logo_url": detail.get("logo_url"),
        "icon_url": detail.get("icon_url"),
        "bio": bio,
        "writers": authors,
        "authors": authors,
        "aliases": [],
        "languages": [],
        "language_options": [],
        "origin_language": None,
        "activity_periods": [],
        "genres": [],
        "publishers": [],
        "eras": local_eras,
        "cast": {"characters": [], "staff": [], "animated": [], "people": []},
        "subseries": books_as_subseries,
        "films": books,
        "books": books,
        "seasons": [],
        "media": media,
        "related": related,
        "links": {"entity_id": 0, "groups": []},
        "universes": universes,
        "universe": universe,
        "universe_cards": merged_universe_cards or universe_cards,
        "universe_groups": universe_groups,
        "is_standalone": detail.get("is_standalone"),
        "primary_book_id": detail.get("primary_book_id"),
        "primary_film_id": detail.get("primary_book_id"),
        "orientation": orientation,
    }


def build_book_overview(
    db: Session, book_id: str, *, orientation: str = "portrait"
) -> dict | None:
    root = _root()
    detail = build_book_detail(book_id, root)
    if not detail:
        return None
    found = find_book_dir(book_id, root)
    if not found:
        return None
    book_dir, work_dir, _letter = found
    folder_path = detail.get("folder_path") or ""
    work = detail.get("work") or {}
    work_id = work.get("id") or ""

    local_eras = build_local_eras(book_dir, root)
    if not local_eras:
        local_eras = build_local_eras(work_dir, root)

    related_disk = _related_for_work(
        root,
        work.get("folder_path") or folder_path,
        work_name=(work.get("name") or (work_dir.name if work_dir else "")),
    )

    universes, universe, universe_cards, merged_universe_cards, universe_groups = (
        franchise_universe_bundle(db, "books", work_id)
    )
    from app.books_admin import load_book_about

    about = load_book_about(book_dir)
    authors = about.get("authors") or about.get("writers") or []
    if isinstance(authors, str):
        authors = [
            a.strip()
            for a in authors.replace(",", ";").split(";")
            if a.strip()
        ]
    bio = None
    if about.get("bio_manual") and about.get("bio") is not None:
        bio = about.get("bio")
    if bio is None:
        bio = (universe or {}).get("overview") if universe else None
    if bio is None:
        bio = about.get("bio")
    cast = about.get("cast") if isinstance(about.get("cast"), dict) else {}
    if not isinstance(cast, dict):
        cast = {}
    cast = {
        "characters": list(cast.get("characters") or cast.get("animated") or []),
        "staff": list(cast.get("staff") or cast.get("people") or []),
        "animated": list(cast.get("characters") or cast.get("animated") or []),
        "people": list(cast.get("staff") or cast.get("people") or []),
    }

    volumes = detail.get("volumes") or []
    media = {
        "has_audio": _has_audio(book_dir) or _has_audio(work_dir),
        "has_series": bool(related_disk.get("series")),
        "has_movies": bool(related_disk.get("movies") or related_disk.get("movie")),
        "has_library": False,
        "has_books": True,
        "has_games": bool(related_disk.get("games")),
        "has_gallery": bool(local_eras) or bool(detail.get("has_gallery")),
    }

    siblings = []
    work_detail = build_work_detail(work_id, root) if work_id else None
    if work_detail:
        siblings = [
            b
            for b in (work_detail.get("books") or [])
            if b.get("id") != book_id
        ]

    return {
        "id": detail["id"],
        "name": detail.get("title"),
        "letter": (detail.get("title") or "?")[:1].upper(),
        "folder_path": folder_path,
        "cover_url": detail.get("cover_url"),
        "portrait_url": detail.get("portrait_url"),
        "landscape_url": detail.get("landscape_url"),
        "banner_url": detail.get("banner_url"),
        "logo_url": detail.get("logo_url"),
        "icon_url": detail.get("icon_url"),
        "bio": bio,
        "writers": authors,
        "authors": authors,
        "aliases": [],
        "languages": about.get("languages") or [],
        "language_options": [],
        "origin_language": about.get("origin_language"),
        "country": about.get("country"),
        "activity_periods": about.get("activity_periods")
        or (
            [{"label": detail["display_date"], "start": detail.get("date_iso")}]
            if detail.get("display_date")
            else []
        ),
        "genres": about.get("genres") or [],
        "publishers": about.get("publishers") or [],
        "eras": local_eras,
        "cast": cast,
        "subseries": [],
        "films": siblings,
        "books": siblings,
        "seasons": [],
        "media": media,
        "related": {
            "movies": _enrich_related_cards(
                related_disk.get("movies") or related_disk.get("movie") or [], root
            ),
            "series": _enrich_related_cards(related_disk.get("series") or [], root),
            "books": [],
            "games": _enrich_related_cards(related_disk.get("games") or [], root),
            "creator": [],
            "similar": [],
        },
        "links": {"entity_id": 0, "groups": []},
        "universes": universes,
        "universe": universe,
        "universe_cards": merged_universe_cards or universe_cards,
        "universe_groups": universe_groups,
        "versions": volumes,
        "volumes": volumes,
        "open_url": detail.get("open_url"),
        "open_mode": detail.get("open_mode"),
        "open_label": detail.get("open_label") or "Read",
        "work": work,
        "orientation": orientation,
    }
