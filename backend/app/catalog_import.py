"""Provider-backed Movies, Series, Books and Games folder scaffolding."""
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
from app.crud import get_google_books_key, get_tmdb_key
from app.database import get_db
from app.deps import require_admin
from app.franchise_identity import set_explicit_franchise_home
from app.franchise_index import (
    GAME_PLATFORMS,
    build_franchise_index,
    normalize_franchise_slug,
    save_franchise_index,
)
from app.gallery import _letter_folder
from app.http_ssl import aget
from app.models import BookLeaf, BookWork, Game, MovieWork, Series, User
from app.services.google_books import (
    GoogleBooksError,
    get_google_book,
    search_google_books,
)
from app.services.igdb import IgdbNotConfigured, get_game as igdb_get_game, igdb_configured, search_games as igdb_search_games
from app.services.tmdb import (
    TMDB_BASE,
    fetch_collection,
    fetch_movie,
    fetch_tv,
    image_url,
)

router = APIRouter(prefix="/api/catalog-import", tags=["catalog-import"])

MODULE_DIRS = {
    "movies": "Movies",
    "series": "Series",
    "books": "Books",
    "games": "Games",
}
AUDIO_CATEGORIES = (
    "Albums",
    "Extended Plays",
    "Compilations",
    "Demos",
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
    "images.igdb.com",
    "books.google.com",
    "books.googleusercontent.com",
    "lh3.googleusercontent.com",
}
REGISTRATION_MODELS = {
    "movies": (MovieWork, "mwk_id", "mwk_name", "mwk_slug"),
    "series": (Series, "ser_id", "ser_name", None),
    "books": (BookWork, "bwk_id", "bwk_name", "bwk_slug"),
    "games": (Game, "gam_id", "gam_name", None),
}


def _root() -> Path:
    root = Path(settings.media_root or "")
    if not root.is_dir():
        raise ValueError("Media root is not configured or accessible")
    return root


def _safe_name(value: str, fallback: str = "Untitled") -> str:
    text = (value or "").replace("█", "'").replace("■", ",").strip()
    # Colons usually split title / subtitle — keep readable " - " spacing.
    text = re.sub(r"\s*:\s*", " - ", text)
    text = INVALID_PATH_CHARS.sub("-", text)
    text = re.sub(r"\s{2,}", " ", text).strip(" .")
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


_CROSS_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "at",
        "by",
        "for",
        "from",
        "in",
        "of",
        "on",
        "or",
        "the",
        "to",
        "with",
        "n",
    }
)


def _significant_tokens(value: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", (value or "").casefold())
    return {w for w in words if len(w) > 1 and w not in _CROSS_STOPWORDS}


def _titles_related(franchise: str, title: str) -> bool:
    """Best-effort TMDb cross-match: franchise name in title or strong token overlap."""
    fran = (franchise or "").strip()
    tit = (title or "").strip()
    if not fran or not tit:
        return False
    fran_cf = fran.casefold()
    tit_cf = tit.casefold()
    if fran_cf in tit_cf:
        return True
    # Drop possessive / trailing "movie" noise for overlap
    tit_norm = re.sub(r"\b(movie|film|the movie)\b", " ", tit_cf)
    ft = _significant_tokens(fran)
    tt = _significant_tokens(tit_norm)
    if not ft:
        return False
    overlap = ft & tt
    if len(overlap) >= max(1, (len(ft) + 1) // 2):
        return True
    return False


def _franchise_module_dir(root: Path, module: str, franchise_name: str) -> Path:
    return root / MODULE_DIRS[module] / _letter_folder(franchise_name) / franchise_name


def _assign_subseries(
    movie: dict, series_items: list[dict]
) -> dict | None:
    """Pick the best series leaf for a related movie (title, then date heuristics)."""
    if not series_items:
        return None
    title = str(movie.get("title") or "")
    title_cf = title.casefold()
    best: dict | None = None
    best_len = 0
    for series in series_items:
        st = str(series.get("title") or "").strip()
        if st and st.casefold() in title_cf and len(st) > best_len:
            best = series
            best_len = len(st)
    if best:
        return best
    movie_date = str(movie.get("date") or "")[:10]
    dated: list[tuple[str, dict]] = []
    for series in series_items:
        sd = str(series.get("date") or "")[:10]
        if sd and movie_date and sd <= movie_date:
            dated.append((sd, series))
    if dated:
        dated.sort(key=lambda pair: pair[0], reverse=True)
        return dated[0][1]
    return sorted(
        series_items,
        key=lambda s: (str(s.get("date") or "9999"), str(s.get("title") or "")),
    )[0]


async def _tmdb_search_cross(
    *,
    endpoint: str,
    query: str,
    api_key: str,
    limit: int = 40,
) -> list[dict]:
    response = await aget(
        f"{TMDB_BASE}/search/{endpoint}",
        params={"api_key": api_key, "query": query},
        timeout=30.0,
    )
    response.raise_for_status()
    rows = response.json().get("results") or []
    out: list[dict] = []
    for item in rows[:limit]:
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
                "provider_id": str(item["id"]),
                "title": title,
                "date": date,
                "poster_url": image_url(item.get("poster_path"), "original"),
                "backdrop_url": image_url(item.get("backdrop_path"), "original"),
            }
        )
    return out


def _relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def _mkdir_tree(folder: Path, relatives: tuple[str, ...]) -> int:
    from app.folder_icons import ensure_relative_tree, write_desktop_ini

    created = 0
    write_desktop_ini(folder)
    for rel in relatives:
        target = folder / rel
        if not target.is_dir():
            created += 1
        ensure_relative_tree(folder, rel)
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


def _movie_tree(folder: Path) -> int:
    """Film leaf: Gallery plus Extras + Audio shortcut buckets (same as legacy fixtures)."""
    return _gallery_tree(folder) + _mkdir_tree(
        folder,
        (
            "Extras",
            *(f"Audio/{category}" for category in AUDIO_CATEGORIES),
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
        if module == "games":
            for platform in module_root.iterdir():
                if not platform.is_dir():
                    continue
                for letter in platform.iterdir():
                    if not letter.is_dir():
                        continue
                    for folder in letter.iterdir():
                        if folder.is_dir() and wanted in folder.name.casefold():
                            out.append(
                                {
                                    "source": "local",
                                    "kind": "franchise",
                                    "provider_id": normalize_franchise_slug(
                                        folder.name
                                    ),
                                    "title": folder.name,
                                    "subtitle": f"Existing Games · {platform.name}",
                                    "platform": platform.name,
                                }
                            )
        else:
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
    safe = _safe_name(name)
    letter = _letter_folder(name)
    root = _root()
    if module == "games":
        games_root = root / MODULE_DIRS[module]
        local_exists = False
        if games_root.is_dir():
            for platform_dir in games_root.iterdir():
                if not platform_dir.is_dir():
                    continue
                candidate = platform_dir / letter / safe
                if candidate.is_dir():
                    local_exists = True
                    break
        if local_exists:
            raise HTTPException(
                409, "This item has a local folder and cannot be removed."
            )
    else:
        local = root / MODULE_DIRS[module] / letter / safe
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


def _catalog_search_sort_key(item: dict) -> tuple:
    """Oldest year first; titles with no year sort after by name."""
    title = str(item.get("title") or "").casefold()
    date = str(item.get("date") or "").strip()
    year = date[:4] if len(date) >= 4 and date[:4].isdigit() else None
    if year is not None:
        return (0, year, title)
    return (1, title, "")


def _sort_catalog_search_items(items: list[dict], *, limit: int = 10) -> list[dict]:
    seen: set[tuple[str, str]] = set()
    unique: list[dict] = []
    for item in items:
        key = (str(item.get("kind") or ""), str(item.get("provider_id") or ""))
        if not key[1] or key in seen:
            continue
        seen.add(key)
        unique.append(item)
    unique.sort(key=_catalog_search_sort_key)
    return unique[:limit]


async def _tmdb_search(kind: str, query: str, api_key: str) -> list[dict]:
    endpoints = ("movie", "collection") if kind == "movies" else ("tv",)
    out: list[dict] = []
    for endpoint in endpoints:
        response = await aget(
            f"{TMDB_BASE}/search/{endpoint}",
            params={"api_key": api_key, "query": query},
            timeout=30.0,
        )
        response.raise_for_status()
        for item in (response.json().get("results") or [])[:20]:
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
                    "cover_url": image_url(item.get("poster_path"), "w342"),
                }
            )
    return _sort_catalog_search_items(out)


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
    """Extract a volume id from a bare id or Google Books / google.com edition URL."""
    clean = value.strip()
    low = clean.casefold()
    looks_like_url = (
        "books.google." in low
        or "googleapis.com/books" in low
        or "/books/" in low
        or low.startswith("http://")
        or low.startswith("https://")
    )
    if looks_like_url:
        parsed = urlparse(clean)
        query_id = (parse_qs(parsed.query).get("id") or [None])[0]
        if query_id and re.fullmatch(r"[A-Za-z0-9_-]{8,}", query_id):
            return query_id
        parts = [p for p in parsed.path.split("/") if p]
        lower_parts = [p.casefold() for p in parts]
        if "edition" in lower_parts:
            idx = lower_parts.index("edition")
            # /books/edition/{title_or_underscore}/{volumeId}
            if idx + 2 < len(parts) and re.fullmatch(
                r"[A-Za-z0-9_-]{8,}", parts[idx + 2]
            ):
                return parts[idx + 2]
            if idx + 1 < len(parts) and re.fullmatch(
                r"[A-Za-z0-9_-]{8,}", parts[idx + 1]
            ):
                return parts[idx + 1]
        tail = parsed.path.rstrip("/").rsplit("/", 1)[-1]
        if (
            tail
            and tail.casefold() not in {"books", "edition"}
            and re.fullmatch(r"[A-Za-z0-9_-]{8,}", tail)
        ):
            return tail
        return None
    if (
        len(clean) >= 8
        and " " not in clean
        and re.fullmatch(r"[A-Za-z0-9_-]+", clean)
    ):
        return clean
    return None


def _google_books_http_error(exc: GoogleBooksError) -> HTTPException:
    status = 429 if exc.status_code == 429 else 400
    if exc.status_code in (401, 403):
        status = 400
    return HTTPException(status, str(exc))


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
        gb_key = get_google_books_key(db)
        try:
            direct_id = _google_books_id_query(q)
            direct = (
                await asyncio.to_thread(
                    get_google_book, direct_id, api_key=gb_key
                )
                if direct_id
                else None
            )
            if direct and direct.get("id"):
                remote = [_google_books_search_item(direct)]
            else:
                book_results = await asyncio.to_thread(
                    search_google_books, q, max_results=20, api_key=gb_key
                )
                remote = _sort_catalog_search_items(
                    [
                        _google_books_search_item(item)
                        for item in book_results
                        if item.get("id")
                    ]
                )
        except GoogleBooksError as exc:
            raise _google_books_http_error(exc) from exc
    elif module == "games":
        if not igdb_configured():
            raise HTTPException(
                400,
                "IGDB client id/secret not configured "
                "(MYSTACK_IGDB_CLIENT_ID / MYSTACK_IGDB_CLIENT_SECRET)",
            )
        try:
            hits = await igdb_search_games(q, limit=20)
        except IgdbNotConfigured as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(400, f"IGDB search failed: {exc}") from exc
        remote = [
            {
                "source": "igdb",
                "provider_id": h.get("provider_id") or "",
                "title": h.get("name") or "Untitled",
                "name": h.get("name") or "Untitled",
                "date": h.get("date_iso"),
                "poster_url": h.get("cover_url"),
                "backdrop_url": None,
                "overview": h.get("overview"),
                "platforms": h.get("platforms") or [],
                "kind": "game",
            }
            for h in hits
            if h.get("provider_id")
        ]
    else:
        api_key = get_tmdb_key(db)
        if not api_key:
            raise HTTPException(400, "TMDb API key is not configured")
        try:
            direct = await _tmdb_direct_lookup(module, q, api_key)
            remote = [direct] if direct else await _tmdb_search(module, q, api_key)
        except httpx.HTTPError as exc:
            raise HTTPException(
                502, f"TMDb search failed: {exc}"
            ) from exc
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
    if module == "games":
        if not igdb_configured():
            raise HTTPException(400, "IGDB client id/secret not configured")
        game = await igdb_get_game(provider_id)
        if not game:
            raise HTTPException(404, "IGDB game not found")
        game_platforms = list(game.get("platforms") or [])
        return {
            "franchise_name": game.get("name") or body.get("title") or "Untitled",
            "items": [
                {
                    "provider_id": game.get("provider_id") or provider_id,
                    "title": game.get("name") or "Untitled",
                    "date": game.get("date_iso"),
                    "poster_url": game.get("cover_url"),
                    "backdrop_url": None,
                    "platforms": game_platforms,
                }
            ],
            # Full catalog for the checkbox list; selection uses item.platforms only.
            "platform_options": list(GAME_PLATFORMS),
            "platforms": game_platforms,
            "scope": "single",
        }
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
    gb_key = get_google_books_key(db)
    try:
        selected = await asyncio.to_thread(
            get_google_book, provider_id, api_key=gb_key
        )
    except GoogleBooksError as exc:
        raise _google_books_http_error(exc) from exc
    if not selected:
        raise HTTPException(404, "Google Books title not found")
    base = _book_series_title(selected.get("title") or "")
    try:
        candidates = await asyncio.to_thread(
            search_google_books,
            f'intitle:"{base}"',
            max_results=40,
            api_key=gb_key,
        )
    except GoogleBooksError as exc:
        raise _google_books_http_error(exc) from exc
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


def _primary_cover_exists(destination: Path) -> bool:
    """True if destination or destination.{jpg,jpeg,png,webp} already exists."""
    if destination.exists():
        return True
    parent = destination.parent
    stem = destination.name
    if not parent.is_dir():
        return False
    try:
        for child in parent.iterdir():
            if not child.is_file():
                continue
            if child.stem.casefold() == stem.casefold():
                return True
    except OSError:
        return False
    return False


async def _download_primary(url: str | None, destination: Path) -> bool:
    """Download cover art once — never replace an existing Cover - Portrait.* file."""
    if not url or _primary_cover_exists(destination):
        return False
    try:
        if (urlparse(url).hostname or "").casefold() not in ARTWORK_HOSTS:
            return False
        response = await aget(
            url.replace("http://", "https://", 1),
            timeout=60.0,
            follow_redirects=True,
        )
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
    # Franchise [Artwork] is covers-only (Cover - Portrait / Landscape); do not
    # scaffold Branding/Covers/Exclusive/Gallery children there.

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
    from app.folder_icons import decorate_folder

    if module == "series":
        targets = leaf_dirs or [franchise_dir]
        for target in targets:
            created += _series_tree(target)
            decorate_folder(target)
    elif module == "movies":
        targets = leaf_dirs or (
            [franchise_dir] if (franchise_dir / "Gallery").is_dir() else []
        )
        for target in targets:
            created += _movie_tree(target)
            decorate_folder(target)
    else:
        targets = leaf_dirs or (
            [franchise_dir] if (franchise_dir / "Gallery").is_dir() else []
        )
        for target in targets:
            created += _gallery_tree(target)
            decorate_folder(target)

    artwork = franchise_dir / "[Artwork]"
    if artwork.is_dir():
        decorate_folder(artwork)
    decorate_folder(franchise_dir)

    _rebuild_franchise_index(root)
    return {
        "ok": True,
        "franchise_name": franchise_name,
        "folders_created": created,
    }


def _canonicalize_platform_name(raw: str) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    platform_cf = {p.casefold(): p for p in GAME_PLATFORMS}
    return platform_cf.get(text.casefold()) or _safe_name(text, fallback="")


def _resolve_game_platforms(body: dict) -> list[str]:
    """Normalize Games create platforms from `platforms[]` or legacy `platform`."""
    raw_list = body.get("platforms")
    candidates: list[str] = []
    if isinstance(raw_list, list):
        candidates = [str(x).strip() for x in raw_list if str(x).strip()]
    if not candidates:
        single = str(body.get("platform") or "").strip()
        if single:
            candidates = [single]
    # Also collect platforms declared on individual items.
    for raw in body.get("items") or []:
        if not isinstance(raw, dict):
            continue
        for p in raw.get("platforms") or []:
            text = str(p or "").strip()
            if text:
                candidates.append(text)
    out: list[str] = []
    seen: set[str] = set()
    for platform_raw in candidates:
        name = _canonicalize_platform_name(platform_raw)
        key = name.casefold()
        if name and key not in seen:
            seen.add(key)
            out.append(name)
    return out


def _item_platform_names(raw: dict, fallback: list[str]) -> list[str]:
    """Platforms this title should be created under.

    Empty item platforms → ``fallback`` (all selected platforms) for
    backwards compatibility with older clients.
    """
    candidates: list[str] = []
    for p in raw.get("platforms") or []:
        text = str(p or "").strip()
        if text:
            candidates.append(text)
    out: list[str] = []
    seen: set[str] = set()
    for platform_raw in candidates:
        name = _canonicalize_platform_name(platform_raw)
        key = name.casefold()
        if name and key not in seen:
            seen.add(key)
            out.append(name)
    return out or list(fallback)


@router.post("/{module}/cross-related")
async def catalog_cross_related(
    module: str,
    body: dict,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Best-effort TMDb movies↔series matches for the create modal Include line."""
    if module not in {"series", "movies"}:
        return {
            "other_module": None,
            "local_exists": False,
            "items": [],
        }
    other = "movies" if module == "series" else "series"
    franchise_name = _safe_name(
        str(body.get("franchise_name") or ""), fallback=""
    )
    if not franchise_name:
        raise HTTPException(400, "Franchise name is required")
    primary_items = body.get("items") if isinstance(body.get("items"), list) else []
    nested = bool(body.get("nested_series"))
    root = _root()
    other_dir = _franchise_module_dir(root, other, franchise_name)
    if other_dir.is_dir():
        return {
            "other_module": other,
            "local_exists": True,
            "items": [],
        }
    api_key = get_tmdb_key(db)
    if not api_key:
        raise HTTPException(400, "TMDb API key is not configured")
    endpoint = "movie" if other == "movies" else "tv"
    raw_hits = await _tmdb_search_cross(
        endpoint=endpoint, query=franchise_name, api_key=api_key
    )
    # Also try a shorter base name (drop trailing volume-like noise).
    base = BOOK_VOLUME_RE.sub("", franchise_name).strip(" :-") or franchise_name
    if base.casefold() != franchise_name.casefold():
        raw_hits.extend(
            await _tmdb_search_cross(
                endpoint=endpoint, query=base, api_key=api_key
            )
        )
    exclude_ids = {
        str(row.get("provider_id") or "").strip()
        for row in primary_items
        if isinstance(row, dict)
    }
    matched: list[dict] = []
    seen: set[str] = set()
    for hit in raw_hits:
        pid = str(hit.get("provider_id") or "").strip()
        title = str(hit.get("title") or "").strip()
        if not pid or pid in seen or pid in exclude_ids:
            continue
        if not _titles_related(franchise_name, title) and not _titles_related(
            base, title
        ):
            continue
        seen.add(pid)
        matched.append(hit)
    matched.sort(key=lambda item: (item.get("date") or "9999", item["title"]))
    series_for_assign = [
        row
        for row in primary_items
        if isinstance(row, dict) and str(row.get("title") or "").strip()
    ]
    if nested and module == "series" and other == "movies" and series_for_assign:
        for hit in matched:
            series = _assign_subseries(hit, series_for_assign)
            if series:
                hit["subseries_title"] = series.get("title")
                hit["subseries_date"] = series.get("date")
            else:
                hit["subseries_title"] = None
                hit["subseries_date"] = None
    else:
        for hit in matched:
            hit["subseries_title"] = None
            hit["subseries_date"] = None
    return {
        "other_module": other,
        "local_exists": False,
        "items": matched[:40],
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
    items = body.get("items") or []
    if not isinstance(items, list) or not items or len(items) > 200:
        raise HTTPException(400, "Select at least one title")

    belongs_to_franchise = bool(body.get("belongs_to_franchise", True))
    first_item = items[0] if isinstance(items[0], dict) else {}
    franchise_name = _safe_name(
        str(body.get("franchise_name") or ""), fallback=""
    )
    if not belongs_to_franchise:
        # Standalone title: folder name is the work title; never a franchise home.
        title0 = _safe_name(str(first_item.get("title") or "Untitled"))
        franchise_name = title0
    elif not franchise_name:
        raise HTTPException(400, "Franchise name is required")

    platform_names: list[str] = []
    if module == "games":
        platform_names = _resolve_game_platforms(body)
        if not platform_names:
            raise HTTPException(
                400,
                "At least one platform is required for Games (e.g. Nintendo Switch)",
            )
        franchise_dirs = [
            root
            / "Games"
            / platform_name
            / _letter_folder(franchise_name)
            / franchise_name
            for platform_name in platform_names
        ]
    else:
        franchise_dirs = [
            root / MODULE_DIRS[module] / _letter_folder(franchise_name) / franchise_name
        ]

    make_home = bool(body.get("franchise_home")) and belongs_to_franchise
    include_guide = bool(body.get("include_guide", False))
    nested_series = bool(body.get("nested_series", False)) and belongs_to_franchise
    home_module = str(body.get("franchise_home_module") or "").strip().casefold()
    if home_module not in {"series", "movies", "books", "games", "music"}:
        home_module = module if make_home else ""
    if make_home and home_module:
        set_explicit_franchise_home(db, franchise_name, home_module)
    db.commit()

    include_related = body.get("include_related") if belongs_to_franchise else None
    related_module = ""
    related_items: list = []
    if isinstance(include_related, dict):
        related_module = str(include_related.get("module") or "").strip().casefold()
        raw_related = include_related.get("items") or []
        if (
            related_module in {"series", "movies"}
            and related_module != module
            and isinstance(raw_related, list)
        ):
            related_items = [row for row in raw_related if isinstance(row, dict)][:80]

    created: list[str] = []
    skipped: list[str] = []
    metadata_errors: list[str] = []
    # Precompute per-item platforms so each game lands only on its platforms.
    item_platforms: list[list[str]] = []
    if module == "games":
        for raw in items:
            if isinstance(raw, dict):
                item_platforms.append(
                    _item_platform_names(raw, platform_names)
                )
            else:
                item_platforms.append(list(platform_names))

    from app.folder_icons import decorate_folder, ensure_relative_tree

    for platform_idx, franchise_dir in enumerate(franchise_dirs):
        franchise_existed = franchise_dir.exists()
        franchise_dir.mkdir(parents=True, exist_ok=True)
        platform_name = (
            platform_names[platform_idx] if module == "games" else ""
        )
        if module == "games":
            # Games/{Platform}/{Letter}/{Franchise} — decorate platform + franchise, skip letter
            letter_dir = franchise_dir.parent
            platform_dir = letter_dir.parent
            decorate_folder(platform_dir)
            decorate_folder(franchise_dir)
        else:
            decorate_folder(franchise_dir)
        # Franchise home [Artwork]: covers only (no Branding/Covers/Exclusive/Gallery).
        home_here = make_home and (not home_module or home_module == module)
        if home_here and not franchise_existed:
            from app.folder_icons import cleanup_franchise_artwork_dir

            artwork = franchise_dir / "[Artwork]"
            artwork.mkdir(parents=True, exist_ok=True)
            cleanup_franchise_artwork_dir(artwork)
            await _download_primary(
                first_item.get("poster_url"), artwork / "Cover - Portrait"
            )
            await _download_primary(
                first_item.get("backdrop_url"), artwork / "Cover - Landscape"
            )
            # Structural Artwork ico + ini; then refresh franchise root ico from covers.
            decorate_folder(artwork)
            cleanup_franchise_artwork_dir(artwork)
            decorate_folder(franchise_dir)
        elif home_here:
            # Existing franchise home — strip any empty mistrees under [Artwork].
            from app.folder_icons import cleanup_franchise_artwork_dir

            cleanup_franchise_artwork_dir(franchise_dir / "[Artwork]")
        if include_guide and not franchise_existed:
            (franchise_dir / "User guide.txt").write_text(
                get_catalog_user_guide(db, module), encoding="utf-8"
            )

        for idx, raw in enumerate(items):
            if module == "games":
                allowed = item_platforms[idx] if idx < len(item_platforms) else []
                if platform_name and platform_name.casefold() not in {
                    p.casefold() for p in allowed
                }:
                    # Empty franchise folder under this platform — intentional.
                    continue
            provider_id = str(raw.get("provider_id") or "").strip()
            title = _safe_name(str(raw.get("title") or "Untitled"))
            date = str(raw.get("date") or "").strip() or None
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
                        ensure_relative_tree(leaf_dir, "Specials")
                        continue
                    if not isinstance(number, int) or number < 1:
                        continue
                    season_name = f"{_date_prefix(season.get('date'))}Season {number}"
                    ensure_relative_tree(leaf_dir, f"Episodes/{season_name}")
            elif module == "movies":
                _movie_tree(leaf_dir)
            else:
                _gallery_tree(leaf_dir)
                if module == "games":
                    _mkdir_tree(
                        leaf_dir,
                        (*(f"Audio/{category}" for category in AUDIO_CATEGORIES),),
                    )

            covers = leaf_dir / "Gallery" / "Covers"
            poster_url = raw.get("poster_url")
            backdrop_url = raw.get("backdrop_url")
            # Games: prefer a cover from an IGDB entry that lists this platform;
            # fall back to the selected/default cover when none matches.
            if module == "games":
                try:
                    from app.games_igdb import resolve_cover_for_platform

                    poster_url = await resolve_cover_for_platform(
                        title=title,
                        platform=platform_name,
                        provider_id=provider_id or None,
                        fallback_url=poster_url,
                    )
                except Exception:
                    if provider_id and not poster_url:
                        try:
                            game = await igdb_get_game(provider_id)
                            if game:
                                poster_url = game.get("cover_url")
                        except Exception:
                            pass
            await _download_primary(poster_url, covers / "Cover - Portrait")
            await _download_primary(backdrop_url, covers / "Cover - Landscape")
            # Browser games: persist launch URL in DB metadata (optional).
            pending_web_url = ""
            if (
                module == "games"
                and platform_name
                and platform_name.casefold() in {"browser", "web", "flash"}
            ):
                pending_web_url = str(raw.get("web_url") or "").strip()
                if pending_web_url and "://" not in pending_web_url:
                    pending_web_url = f"https://{pending_web_url.lstrip('/')}"
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
                        cache_artwork=True,
                    )
                elif module == "series" and provider_id:
                    from app.series_refresh import refresh_series_metadata

                    await refresh_series_metadata(
                        db,
                        franchise_name,
                        tmdb_id=provider_id,
                        subseries_titles=[title] if nested_series else None,
                        cache_artwork=True,
                    )
                elif module == "games":
                    from app.games_index import _game_id
                    from app.games_store import (
                        ensure_game_leaf,
                        ensure_game_work,
                        load_game_about,
                        save_game_about,
                        work_slug_for_name,
                    )

                    game_id = _game_id(_relative(leaf_dir, root))
                    work_slug = work_slug_for_name(franchise_name)
                    ensure_game_work(
                        db,
                        work_slug=work_slug,
                        name=franchise_name,
                        folder_path=_relative(franchise_dir, root),
                    )
                    ensure_game_leaf(
                        db,
                        game_id=game_id,
                        work_slug=work_slug,
                        folder_path=_relative(leaf_dir, root),
                        title=title,
                        platform=platform_name or None,
                    )
                    db.flush()
                    if pending_web_url:
                        existing_about = load_game_about(
                            leaf_dir,
                            game_id=game_id,
                            folder_path=_relative(leaf_dir, root),
                            work_slug=work_slug,
                            db=db,
                        )
                        existing_about["web_url"] = pending_web_url
                        save_game_about(
                            existing_about,
                            game_id=game_id,
                            title=title,
                            folder_path=_relative(leaf_dir, root),
                            work_slug=work_slug,
                            platform=platform_name or None,
                            db=db,
                        )
                    if provider_id:
                        from app.games_refresh import refresh_game_metadata

                        refreshed = await refresh_game_metadata(
                            db,
                            game_id,
                            {
                                "title": title,
                                "folder_path": _relative(leaf_dir, root),
                                "name": title,
                                "work_name": franchise_name,
                                "platform": platform_name or None,
                            },
                        )
                        about = (
                            refreshed.get("about")
                            if isinstance(refreshed, dict)
                            else None
                        )
                        # Preserve create-time web_url across metadata refresh merge.
                        if pending_web_url:
                            merged = load_game_about(
                                leaf_dir,
                                game_id=game_id,
                                folder_path=_relative(leaf_dir, root),
                                work_slug=work_slug,
                                db=db,
                            )
                            if not (merged.get("web_url") or "").strip():
                                merged["web_url"] = pending_web_url
                                save_game_about(
                                    merged,
                                    game_id=game_id,
                                    title=title,
                                    folder_path=_relative(leaf_dir, root),
                                    work_slug=work_slug,
                                    platform=platform_name or None,
                                    db=db,
                                )
                        cover_from_meta = (
                            about.get("cover_url") if isinstance(about, dict) else None
                        )
                        if cover_from_meta:
                            await _download_primary(
                                cover_from_meta, covers / "Cover - Portrait"
                            )
                elif module == "books" and provider_id:
                    from app.books_store import (
                        book_id_for_dir,
                        ensure_book_leaf,
                        ensure_book_work,
                    )

                    try:
                        data = (
                            await asyncio.to_thread(
                                get_google_book,
                                provider_id,
                                api_key=get_google_books_key(db),
                            )
                            or {}
                        )
                    except GoogleBooksError as exc:
                        raise _google_books_http_error(exc) from exc
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
                        leaf.blk_refreshed_at = datetime.now(
                            timezone.utc
                        ).isoformat()
                        db.commit()
            except Exception as exc:
                db.rollback()
                metadata_errors.append(f"{title}: {exc}")

            # Leaf ico after final cover (refresh may replace Cover - Portrait).
            decorate_folder(leaf_dir, overwrite_ico=True)

        # Refresh franchise-root ico after leaves / [Artwork] covers exist.
        decorate_folder(franchise_dir)

    # Cross-module Include: scaffold related Movies under Series (or reverse).
    if related_module and related_items:
        related_dir = _franchise_module_dir(root, related_module, franchise_name)
        related_existed = related_dir.is_dir()
        related_dir.mkdir(parents=True, exist_ok=True)
        decorate_folder(related_dir)
        home_on_related = make_home and home_module == related_module
        if home_on_related and not related_existed:
            from app.folder_icons import cleanup_franchise_artwork_dir

            artwork = related_dir / "[Artwork]"
            artwork.mkdir(parents=True, exist_ok=True)
            cleanup_franchise_artwork_dir(artwork)
            rel_first = related_items[0] if related_items else {}
            await _download_primary(
                rel_first.get("poster_url") or first_item.get("poster_url"),
                artwork / "Cover - Portrait",
            )
            await _download_primary(
                rel_first.get("backdrop_url") or first_item.get("backdrop_url"),
                artwork / "Cover - Landscape",
            )
            decorate_folder(artwork)
            cleanup_franchise_artwork_dir(artwork)
            decorate_folder(related_dir)
        if include_guide and not related_existed:
            (related_dir / "User guide.txt").write_text(
                get_catalog_user_guide(db, related_module), encoding="utf-8"
            )
        # Movies nested under subseries only when creating Series with nested shows.
        nest_movies_under_subseries = (
            module == "series"
            and related_module == "movies"
            and nested_series
        )
        nest_related_series = (
            related_module == "series" and nested_series
        )
        for raw in related_items:
            provider_id = str(raw.get("provider_id") or "").strip()
            title = _safe_name(str(raw.get("title") or "Untitled"))
            date = str(raw.get("date") or "").strip() or None
            parent = related_dir
            if nest_movies_under_subseries:
                sub_title = _safe_name(
                    str(raw.get("subseries_title") or "").strip(), fallback=""
                )
                if sub_title:
                    sub_date = str(raw.get("subseries_date") or "").strip() or None
                    parent = related_dir / f"{_date_prefix(sub_date)}{sub_title}"
                    parent.mkdir(parents=True, exist_ok=True)
                    decorate_folder(parent)
            if related_module == "series" and not nest_related_series:
                leaf_dir = related_dir
            else:
                leaf_dir = parent / f"{_date_prefix(date)}{title}"
            if leaf_dir.exists() and leaf_dir != related_dir:
                skipped.append(_relative(leaf_dir, root))
                continue
            if related_module == "series" and not nest_related_series and related_existed:
                skipped.append(_relative(leaf_dir, root))
                continue
            if related_module == "series":
                _series_tree(leaf_dir)
                # Seasons: fetch from TMDb when creating related TV.
                if provider_id:
                    try:
                        api_key = get_tmdb_key(db)
                        if api_key:
                            tv = await fetch_tv(provider_id, api_key)
                            for season in tv.get("seasons") or []:
                                number = season.get("season_number")
                                if number == 0:
                                    ensure_relative_tree(leaf_dir, "Specials")
                                    continue
                                if not isinstance(number, int) or number < 1:
                                    continue
                                season_name = (
                                    f"{_date_prefix(season.get('air_date'))}"
                                    f"Season {number}"
                                )
                                ensure_relative_tree(
                                    leaf_dir, f"Episodes/{season_name}"
                                )
                    except Exception:
                        pass
            elif related_module == "movies":
                _movie_tree(leaf_dir)
            else:
                _gallery_tree(leaf_dir)
            covers = leaf_dir / "Gallery" / "Covers"
            await _download_primary(
                raw.get("poster_url"), covers / "Cover - Portrait"
            )
            await _download_primary(
                raw.get("backdrop_url"), covers / "Cover - Landscape"
            )
            decorate_folder(leaf_dir)
            created.append(_relative(leaf_dir, root))
            try:
                if related_module == "movies" and provider_id:
                    from app.movies_index import _film_id
                    from app.movies_refresh import refresh_film_metadata

                    film_id = _film_id(_relative(leaf_dir, root))
                    await refresh_film_metadata(
                        db,
                        film_id,
                        tmdb_id=provider_id,
                        cache_artwork=False,
                    )
                elif related_module == "series" and provider_id:
                    from app.series_refresh import refresh_series_metadata

                    await refresh_series_metadata(
                        db,
                        franchise_name,
                        tmdb_id=provider_id,
                        subseries_titles=[title] if nest_related_series else None,
                        cache_artwork=False,
                    )
            except Exception as exc:
                db.rollback()
                metadata_errors.append(f"{title}: {exc}")

        decorate_folder(related_dir)

    db.commit()
    _rebuild_franchise_index(root)
    primary_dir = franchise_dirs[0]
    return {
        "ok": True,
        "franchise_name": franchise_name,
        "franchise_path": _relative(primary_dir, root),
        "franchise_paths": [_relative(d, root) for d in franchise_dirs],
        "platforms": platform_names,
        "created": created,
        "skipped": skipped,
        "metadata_errors": metadata_errors,
    }
