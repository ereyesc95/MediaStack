"""Provider-backed Movies, Series and Books folder scaffolding."""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.catalog_import_guide import get_catalog_user_guide
from app.config import settings
from app.crud import get_tmdb_key
from app.database import get_db
from app.deps import require_admin
from app.franchise_identity import set_explicit_franchise_home
from app.franchise_index import (
    build_franchise_index,
    normalize_franchise_slug,
    save_franchise_index,
)
from app.gallery import _letter_folder
from app.models import BookLeaf, BookWork, MovieWork, Series, User
from app.services.google_books import get_google_book, search_google_books
from app.services.tmdb import (
    TMDB_BASE,
    fetch_collection,
    fetch_movie,
    fetch_tv,
    image_url,
)

router = APIRouter(prefix="/api/catalog-import", tags=["catalog-import"])

MODULE_DIRS = {"movies": "Movies", "series": "Series", "books": "Books"}
AUDIO_CATEGORIES = (
    "Albums",
    "Extended Plays",
    "Compilations",
    "Live Albums",
    "Soundtracks",
    "Singles",
)
INVALID_PATH_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
BOOK_VOLUME_RE = re.compile(
    r"\s*(?:[-:]\s*)?(?:vol(?:ume)?\.?\s*\d+|book\s+\d+|#\s*\d+)\s*$",
    re.I,
)
ARTWORK_HOSTS = {
    "image.tmdb.org",
    "books.google.com",
    "books.googleusercontent.com",
    "lh3.googleusercontent.com",
}
REGISTRATION_MODELS = {
    "movies": (MovieWork, "mwk_id", "mwk_name", "mwk_slug"),
    "series": (Series, "ser_id", "ser_name", None),
    "books": (BookWork, "bwk_id", "bwk_name", "bwk_slug"),
}


def _root() -> Path:
    root = Path(settings.media_root or "")
    if not root.is_dir():
        raise ValueError("Media root is not configured or accessible")
    return root


def _safe_name(value: str, fallback: str = "Untitled") -> str:
    text = (value or "").replace("█", "'").replace("■", ",").strip()
    text = INVALID_PATH_CHARS.sub("-", text).rstrip(" .")
    return text or fallback


def _date_prefix(value: str | None) -> str:
    raw = (value or "").strip()
    match = re.match(r"^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?", raw)
    if not match:
        return ""
    year, month, day = match.groups()
    if month and day:
        return f"{year}.{month}.{day}. "
    if month:
        return f"{year}.{month}. "
    return f"{year}. "


def _relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def _mkdir_tree(folder: Path, relatives: tuple[str, ...]) -> int:
    created = 0
    for rel in relatives:
        target = folder / rel
        if not target.is_dir():
            created += 1
        target.mkdir(parents=True, exist_ok=True)
    return created


def _gallery_tree(folder: Path) -> int:
    return _mkdir_tree(
        folder,
        (
        "Gallery/Covers",
        "Gallery/Branding",
        "Gallery/Extras/Characters",
        "Gallery/Exclusive",
        ),
    )


def _series_tree(folder: Path) -> int:
    return _gallery_tree(folder) + _mkdir_tree(
        folder,
        (
            "Episodes",
            "Specials",
            "Extras",
            *(f"Audio/{category}" for category in AUDIO_CATEGORIES),
        ),
    )


def _local_franchises(module: str, query: str) -> list[dict]:
    root = _root()
    module_root = root / MODULE_DIRS[module]
    wanted = query.casefold()
    out: list[dict] = []
    if module_root.is_dir():
        for letter in module_root.iterdir():
            if not letter.is_dir():
                continue
            for folder in letter.iterdir():
                if folder.is_dir() and wanted in folder.name.casefold():
                    out.append(
                        {
                            "source": "local",
                            "kind": "franchise",
                            "provider_id": normalize_franchise_slug(folder.name),
                            "title": folder.name,
                            "subtitle": f"Existing {module.title()} franchise",
                        }
                    )
    music_root = root / "Music"
    if music_root.is_dir():
        for letter in music_root.iterdir():
            if not letter.is_dir():
                continue
            for folder in letter.iterdir():
                if folder.is_dir() and wanted in folder.name.casefold():
                    out.append(
                        {
                            "source": "local",
                            "kind": "music_artist",
                            "provider_id": normalize_franchise_slug(folder.name),
                            "title": folder.name,
                            "subtitle": "Music artist franchise name",
                        }
                    )
    unique = {f"{item['kind']}:{item['title'].casefold()}": item for item in out}
    return sorted(unique.values(), key=lambda item: item["title"].casefold())


@router.get("/{module}/registrations")
def search_catalog_registrations(
    module: str,
    q: str = Query("", max_length=200),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if module not in REGISTRATION_MODELS:
        raise HTTPException(404, "Unsupported catalog module")
    model, id_attr, name_attr, _slug_attr = REGISTRATION_MODELS[module]
    wanted = q.strip().casefold()
    rows = db.scalars(select(model)).all()
    by_slug: dict[str, dict] = {}
    for row in rows:
        name = str(getattr(row, name_attr, "") or "").strip()
        if not name or (wanted and wanted not in name.casefold()):
            continue
        slug = normalize_franchise_slug(name)
        by_slug[slug] = {
            "id": str(getattr(row, id_attr)),
            "name": name,
            "has_local_folder": False,
        }
    for item in _local_franchises(module, q or ""):
        if item.get("kind") != "franchise":
            continue
        name = str(item.get("title") or "")
        slug = normalize_franchise_slug(name)
        current = by_slug.get(slug)
        if current:
            current["has_local_folder"] = True
        else:
            by_slug[slug] = {
                "id": f"local:{slug}",
                "name": name,
                "has_local_folder": True,
            }
    return {
        "items": sorted(by_slug.values(), key=lambda item: item["name"].casefold())
    }


@router.delete("/{module}/registrations/{registration_id}")
def remove_catalog_registration(
    module: str,
    registration_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if module not in REGISTRATION_MODELS:
        raise HTTPException(404, "Unsupported catalog module")
    if registration_id.startswith("local:"):
        raise HTTPException(
            409, "This item has a local folder and cannot be removed."
        )
    try:
        numeric_id = int(registration_id)
    except ValueError as exc:
        raise HTTPException(400, "Invalid registration") from exc
    model, _id_attr, name_attr, slug_attr = REGISTRATION_MODELS[module]
    row = db.get(model, numeric_id)
    if not row:
        raise HTTPException(404, "Registration not found")
    name = str(getattr(row, name_attr, "") or "").strip()
    local = (
        _root()
        / MODULE_DIRS[module]
        / _letter_folder(name)
        / _safe_name(name)
    )
    if local.is_dir():
        raise HTTPException(
            409, "This item has a local folder and cannot be removed."
        )
    if module == "books" and slug_attr:
        slug = str(getattr(row, slug_attr, "") or "")
        for leaf in db.scalars(
            select(BookLeaf).where(BookLeaf.blk_work_slug == slug)
        ).all():
            db.delete(leaf)
    db.delete(row)
    db.commit()
    return {"ok": True}


async def _tmdb_search(kind: str, query: str, api_key: str) -> list[dict]:
    endpoints = ("movie", "collection") if kind == "movies" else ("tv",)
    out: list[dict] = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for endpoint in endpoints:
            response = await client.get(
                f"{TMDB_BASE}/search/{endpoint}",
                params={"api_key": api_key, "query": query},
            )
            response.raise_for_status()
            for item in (response.json().get("results") or [])[:10]:
                title = (
                    item.get("title")
                    or item.get("name")
                    or item.get("original_title")
                    or item.get("original_name")
                )
                if not title or not item.get("id"):
                    continue
                date = item.get("release_date") or item.get("first_air_date")
                out.append(
                    {
                        "source": "tmdb",
                        "kind": endpoint,
                        "provider_id": str(item["id"]),
                        "title": title,
                        "date": date,
                        "subtitle": " · ".join(
                            part
                            for part in (
                                endpoint.title(),
                                (date or "")[:4],
                                item.get("original_language"),
                            )
                            if part
                        ),
                        "cover_url": image_url(
                            item.get("poster_path"), "w342"
                        ),
                    }
                )
    return out


def _tmdb_id_query(value: str) -> tuple[str | None, str | None]:
    """Return an optional TMDb object kind and ID from a bare ID or URL."""
    clean = value.strip()
    url_match = re.search(
        r"(?:themoviedb\.org)/(movie|tv|collection)/(\d+)", clean, re.I
    )
    if url_match:
        return url_match.group(1).casefold(), url_match.group(2)
    if clean.isdigit():
        return None, clean
    return None, None


def _tmdb_search_item(raw: dict, kind: str) -> dict:
    title = (
        raw.get("title")
        or raw.get("name")
        or raw.get("original_title")
        or raw.get("original_name")
        or "Untitled"
    )
    date = raw.get("release_date") or raw.get("first_air_date")
    return {
        "source": "tmdb",
        "kind": kind,
        "provider_id": str(raw.get("id") or ""),
        "title": title,
        "date": date,
        "subtitle": " · ".join(
            part
            for part in (
                kind.title(),
                (date or "")[:4],
                raw.get("original_language"),
            )
            if part
        ),
        "cover_url": image_url(raw.get("poster_path"), "w342"),
    }


async def _tmdb_direct_lookup(
    module: str, value: str, api_key: str
) -> dict | None:
    requested_kind, provider_id = _tmdb_id_query(value)
    if not provider_id:
        return None
    if module == "series":
        if requested_kind and requested_kind != "tv":
            return None
        try:
            return _tmdb_search_item(
                await fetch_tv(provider_id, api_key), "tv"
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return None
            raise

    kinds = [requested_kind] if requested_kind in {"movie", "collection"} else [
        "movie",
        "collection",
    ]
    for kind in kinds:
        try:
            raw = (
                await fetch_collection(provider_id, api_key)
                if kind == "collection"
                else await fetch_movie(provider_id, api_key)
            )
            return _tmdb_search_item(raw, kind)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != 404:
                raise
    return None


def _google_books_id_query(value: str) -> str | None:
    clean = value.strip()
    if "books.google." in clean.casefold():
        parsed = urlparse(clean)
        query_id = (parse_qs(parsed.query).get("id") or [None])[0]
        if query_id:
            return query_id
        tail = parsed.path.rstrip("/").rsplit("/", 1)[-1]
        if tail and tail.casefold() not in {"books", "edition"}:
            return tail
    if (
        len(clean) >= 8
        and " " not in clean
        and re.fullmatch(r"[A-Za-z0-9_-]+", clean)
    ):
        return clean
    return None


def _google_books_search_item(item: dict) -> dict:
    return {
        "source": "google_books",
        "kind": "book",
        "provider_id": str(item.get("id") or ""),
        "title": item.get("title") or "Untitled",
        "date": item.get("published_date"),
        "subtitle": " · ".join(
            part
            for part in (
                ", ".join(item.get("authors") or []),
                (item.get("published_date") or "")[:4],
            )
            if part
        ),
        "cover_url": item.get("thumbnail"),
    }


@router.get("/{module}/search")
async def search_catalog_import(
    module: str,
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if module not in MODULE_DIRS:
        raise HTTPException(404, "Unsupported catalog module")
    local = _local_franchises(module, q)
    if module == "books":
        direct_id = _google_books_id_query(q)
        direct = (
            await asyncio.to_thread(get_google_book, direct_id)
            if direct_id
            else None
        )
        if direct and direct.get("id"):
            remote = [_google_books_search_item(direct)]
        else:
            book_results = await asyncio.to_thread(
                search_google_books, q, max_results=20
            )
            remote = [
                _google_books_search_item(item)
                for item in book_results
                if item.get("id")
            ]
    else:
        api_key = get_tmdb_key(db)
        if not api_key:
            raise HTTPException(400, "TMDb API key is not configured")
        direct = await _tmdb_direct_lookup(module, q, api_key)
        remote = [direct] if direct else await _tmdb_search(module, q, api_key)
    return {"local_franchises": local, "items": remote}


def _movie_preview_item(raw: dict) -> dict:
    return {
        "provider_id": str(raw.get("id") or ""),
        "title": raw.get("title") or raw.get("original_title") or "Untitled",
        "date": raw.get("release_date"),
        "poster_url": image_url(raw.get("poster_path"), "original"),
        "backdrop_url": image_url(raw.get("backdrop_path"), "original"),
    }


def _book_series_title(title: str) -> str:
    return BOOK_VOLUME_RE.sub("", title or "").strip(" :-") or title


@router.post("/{module}/preview")
async def preview_catalog_import(
    module: str,
    body: dict,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    provider_id = str(body.get("provider_id") or "").strip()
    kind = str(body.get("kind") or "").strip()
    if module not in MODULE_DIRS or not provider_id:
        raise HTTPException(400, "Invalid preview request")
    if module == "movies":
        api_key = get_tmdb_key(db)
        if not api_key:
            raise HTTPException(400, "TMDb API key is not configured")
        if kind == "collection":
            collection = await fetch_collection(provider_id, api_key)
            items = [_movie_preview_item(part) for part in collection.get("parts") or []]
            franchise = collection.get("name") or body.get("title") or "Untitled"
        else:
            movie = await fetch_movie(provider_id, api_key)
            collection_ref = movie.get("belongs_to_collection") or {}
            if collection_ref.get("id"):
                collection = await fetch_collection(collection_ref["id"], api_key)
                items = [
                    _movie_preview_item(part) for part in collection.get("parts") or []
                ]
                franchise = collection.get("name") or movie.get("title")
            else:
                items = [_movie_preview_item(movie)]
                franchise = movie.get("title")
        items.sort(key=lambda item: (item.get("date") or "9999", item["title"]))
        return {"franchise_name": franchise, "items": items, "scope": "collection" if len(items) > 1 else "single"}
    if module == "series":
        api_key = get_tmdb_key(db)
        if not api_key:
            raise HTTPException(400, "TMDb API key is not configured")
        tv = await fetch_tv(provider_id, api_key)
        item = {
            "provider_id": provider_id,
            "title": tv.get("name") or tv.get("original_name") or "Untitled",
            "date": tv.get("first_air_date"),
            "poster_url": image_url(tv.get("poster_path"), "original"),
            "backdrop_url": image_url(tv.get("backdrop_path"), "original"),
            "seasons": [
                {
                    "number": season.get("season_number"),
                    "name": season.get("name"),
                    "date": season.get("air_date"),
                }
                for season in tv.get("seasons") or []
                if season.get("season_number") is not None
            ],
        }
        return {"franchise_name": item["title"], "items": [item], "scope": "series"}
    selected = await asyncio.to_thread(get_google_book, provider_id)
    if not selected:
        raise HTTPException(404, "Google Books title not found")
    base = _book_series_title(selected.get("title") or "")
    candidates = await asyncio.to_thread(
        search_google_books, f'intitle:"{base}"', max_results=40
    )
    selected_authors = {
        str(author).casefold() for author in selected.get("authors") or []
    }
    related = []
    for item in candidates:
        authors = {str(author).casefold() for author in item.get("authors") or []}
        if base.casefold() not in (item.get("title") or "").casefold():
            continue
        if selected_authors and authors and not selected_authors.intersection(authors):
            continue
        related.append(
            {
                "provider_id": str(item.get("id") or ""),
                "title": item.get("title") or "Untitled",
                "date": item.get("published_date"),
                "poster_url": item.get("thumbnail"),
                "backdrop_url": None,
            }
        )
    if not any(item["provider_id"] == provider_id for item in related):
        related.append(
            {
                "provider_id": provider_id,
                "title": selected.get("title") or "Untitled",
                "date": selected.get("published_date"),
                "poster_url": selected.get("thumbnail"),
                "backdrop_url": None,
            }
        )
    unique = {item["provider_id"]: item for item in related if item["provider_id"]}
    items = sorted(
        unique.values(), key=lambda item: (item.get("date") or "9999", item["title"])
    )
    return {"franchise_name": base, "items": items, "scope": "series" if len(items) > 1 else "single"}


async def _download_primary(url: str | None, destination: Path) -> bool:
    if not url or destination.exists():
        return False
    try:
        if (urlparse(url).hostname or "").casefold() not in ARTWORK_HOSTS:
            return False
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.get(url.replace("http://", "https://", 1))
            response.raise_for_status()
        suffix = Path(urlparse(url).path).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            suffix = ".jpg"
        destination = destination.with_suffix(suffix)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(response.content)
        return True
    except Exception:
        return False


def _rebuild_franchise_index(root: Path) -> None:
    save_franchise_index(build_franchise_index(root))
    try:
        from app.universes import invalidate_universe_caches

        invalidate_universe_caches()
    except (ImportError, AttributeError):
        pass


@router.post("/{module}/update-folders")
def update_catalog_folders(
    module: str,
    body: dict,
    _admin: User = Depends(require_admin),
):
    if module not in MODULE_DIRS:
        raise HTTPException(404, "Unsupported catalog module")
    root = _root()
    franchise_name = _safe_name(
        str(body.get("franchise_name") or ""), fallback=""
    )
    if not franchise_name:
        raise HTTPException(400, "Franchise name is required")
    franchise_dir = (
        root / MODULE_DIRS[module] / _letter_folder(franchise_name) / franchise_name
    )
    if not franchise_dir.is_dir():
        raise HTTPException(404, "Local franchise folder not found")

    created = 0
    artwork = franchise_dir / "[Artwork]"
    if artwork.is_dir():
        created += _mkdir_tree(
            artwork, ("Branding", "Covers", "Photos", "Exclusive")
        )

    leaf_dirs = [
        child
        for child in franchise_dir.iterdir()
        if child.is_dir()
        and child.name.casefold() != "[artwork]"
        and (
            (child / "Gallery").is_dir()
            or re.match(r"^\d{4}(?:\.\d{2})?(?:\.\d{2})?\.\s", child.name)
        )
    ]
    if module == "series":
        targets = leaf_dirs or [franchise_dir]
        for target in targets:
            created += _series_tree(target)
    else:
        targets = leaf_dirs or (
            [franchise_dir] if (franchise_dir / "Gallery").is_dir() else []
        )
        for target in targets:
            created += _gallery_tree(target)

    _rebuild_franchise_index(root)
    return {
        "ok": True,
        "franchise_name": franchise_name,
        "folders_created": created,
    }


@router.post("/{module}/create")
async def create_catalog_import(
    module: str,
    body: dict,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    if module not in MODULE_DIRS:
        raise HTTPException(404, "Unsupported catalog module")
    root = _root()
    franchise_name = _safe_name(
        str(body.get("franchise_name") or ""), fallback=""
    )
    items = body.get("items") or []
    if (
        not franchise_name
        or not isinstance(items, list)
        or not items
        or len(items) > 200
    ):
        raise HTTPException(400, "Select at least one title")

    franchise_dir = (
        root / MODULE_DIRS[module] / _letter_folder(franchise_name) / franchise_name
    )
    franchise_existed = franchise_dir.exists()
    franchise_dir.mkdir(parents=True, exist_ok=True)
    make_home = bool(body.get("franchise_home"))
    if make_home:
        set_explicit_franchise_home(db, franchise_name, module)
        if not franchise_existed:
            for child in ("Branding", "Covers", "Photos", "Exclusive"):
                (franchise_dir / "[Artwork]" / child).mkdir(
                    parents=True, exist_ok=True
                )
    if bool(body.get("include_guide", True)) and not franchise_existed:
        (franchise_dir / "User guide.txt").write_text(
            get_catalog_user_guide(db, module), encoding="utf-8"
        )
    db.commit()

    created: list[str] = []
    skipped: list[str] = []
    metadata_errors: list[str] = []
    first_item = items[0] if items else {}
    if make_home and not franchise_existed:
        artwork = franchise_dir / "[Artwork]"
        await _download_primary(first_item.get("poster_url"), artwork / "Cover - Front")
        await _download_primary(first_item.get("backdrop_url"), artwork / "Cover - Banner")

    for raw in items:
        provider_id = str(raw.get("provider_id") or "").strip()
        title = _safe_name(str(raw.get("title") or "Untitled"))
        date = str(raw.get("date") or "").strip() or None
        nested_series = bool(body.get("nested_series", False))
        if module == "series" and not nested_series:
            leaf_dir = franchise_dir
        else:
            leaf_dir = franchise_dir / f"{_date_prefix(date)}{title}"
        if leaf_dir.exists() and leaf_dir != franchise_dir:
            skipped.append(_relative(leaf_dir, root))
            continue
        if module == "series" and not nested_series and franchise_existed:
            skipped.append(_relative(leaf_dir, root))
            continue

        if module == "series":
            _series_tree(leaf_dir)
            for season in raw.get("seasons") or []:
                number = season.get("number")
                if number == 0:
                    (leaf_dir / "Specials").mkdir(parents=True, exist_ok=True)
                    continue
                if not isinstance(number, int) or number < 1:
                    continue
                season_name = f"{_date_prefix(season.get('date'))}Season {number}"
                (leaf_dir / "Episodes" / season_name).mkdir(parents=True, exist_ok=True)
        else:
            _gallery_tree(leaf_dir)

        covers = leaf_dir / "Gallery" / "Covers"
        await _download_primary(raw.get("poster_url"), covers / "Cover - Front")
        await _download_primary(raw.get("backdrop_url"), covers / "Cover - Banner")
        created.append(_relative(leaf_dir, root))

        try:
            if module == "movies" and provider_id:
                from app.movies_index import _film_id
                from app.movies_refresh import refresh_film_metadata

                film_id = _film_id(_relative(leaf_dir, root))
                await refresh_film_metadata(
                    db,
                    film_id,
                    tmdb_id=provider_id,
                    cache_artwork=False,
                )
            elif module == "series" and provider_id:
                from app.series_refresh import refresh_series_metadata

                await refresh_series_metadata(
                    db,
                    franchise_name,
                    tmdb_id=provider_id,
                    subseries_titles=[title] if nested_series else None,
                    cache_artwork=False,
                )
            elif module == "books" and provider_id:
                from app.books_store import (
                    book_id_for_dir,
                    ensure_book_leaf,
                    ensure_book_work,
                )

                data = (
                    await asyncio.to_thread(get_google_book, provider_id) or {}
                )
                work_slug = normalize_franchise_slug(franchise_name)
                rel = _relative(leaf_dir, root)
                ensure_book_work(
                    db,
                    work_slug=work_slug,
                    name=franchise_name,
                    folder_path=_relative(franchise_dir, root),
                )
                book_id = book_id_for_dir(leaf_dir)
                if book_id:
                    leaf = ensure_book_leaf(
                        db,
                        book_id=book_id,
                        work_slug=work_slug,
                        folder_path=rel,
                        title=title,
                    )
                    leaf.blk_metadata_json = json.dumps(
                        {
                            "google_books_id": provider_id,
                            "bio": data.get("description"),
                            "writers": data.get("authors") or [],
                            "authors": data.get("authors") or [],
                            "publishers": [data["publisher"]]
                            if data.get("publisher")
                            else [],
                            "genres": data.get("categories") or [],
                            "language": data.get("language"),
                            "page_count": data.get("page_count"),
                            "links": [
                                {"type": "Google Books", "url": data["info_link"]}
                            ]
                            if data.get("info_link")
                            else [],
                        },
                        ensure_ascii=False,
                    )
                    leaf.blk_refreshed_at = datetime.now(timezone.utc).isoformat()
                    db.commit()
        except Exception as exc:
            db.rollback()
            metadata_errors.append(f"{title}: {exc}")

    db.commit()
    _rebuild_franchise_index(root)
    return {
        "ok": True,
        "franchise_name": franchise_name,
        "franchise_path": _relative(franchise_dir, root),
        "created": created,
        "skipped": skipped,
        "metadata_errors": metadata_errors,
    }
