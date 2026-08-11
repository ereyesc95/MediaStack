from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud
from app.config import settings
from app.books_dashboard import build_books_dashboard
from app.books_index import (
    build_book_detail,
    build_books_catalog,
    build_work_detail,
    resolve_books_path,
)
from app.books_overview import (
    build_book_overview,
    build_books_gallery,
    build_work_overview,
)
from app.books_refresh import (
    apply_book_metadata_stub,
    search_book_metadata,
    search_work_metadata,
)
from app.database import get_db
from app.deps import get_current_user, require_admin
from app.franchise_index import (
    build_franchise_index,
    load_franchise_index,
    normalize_franchise_slug,
    save_franchise_index,
)
from app.models import User
from app.schemas import BookListOut
from app.universes import universe_for_franchise

router = APIRouter(prefix="/api/books", tags=["books"])


def _franchise_media_items(work_id: str, kind: str) -> list[dict]:
    slug = normalize_franchise_slug(work_id) or work_id.casefold()
    index = load_franchise_index()
    root = Path(settings.media_root or "")
    if index is None and root.is_dir():
        index = build_franchise_index(root)
        save_franchise_index(index)
    items: list[dict] = []
    bucket = index.franchises.get(slug) if index else None
    if not bucket:
        return items
    for entry in bucket.entries:
        if entry.kind != kind:
            continue
        items.append(
            {
                "id": entry.path,
                "title": entry.title or entry.franchise_display,
                "date_iso": entry.date_iso,
                "path": entry.path,
                "cover_url": None,
                "navigate_franchise_id": slug,
                "open_mode": kind if kind != "movie" else "movies",
            }
        )
    return items


@router.get("", response_model=BookListOut)
def list_books(
    db: Session = Depends(get_db),
    search: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(48, ge=1, le=200),
):
    items, total = crud.list_books(db, search=search, page=page, page_size=page_size)
    return BookListOut(items=items, total=total, page=page, page_size=page_size)


@router.get("/catalog")
def books_catalog():
    try:
        return build_books_catalog()
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("/filters/options")
def books_filter_options(db: Session = Depends(get_db)):
    """Book taxonomy (media type 500) for catalog filters + Edit book genres."""
    from sqlalchemy import select

    from app.models import Country, Genre, Subgenre
    from app.music_filters import all_country_groups
    from app.seed_music import ensure_music_lookup_data

    ensure_music_lookup_data(db)
    BOOKS_MEDIA_TYPE = 500

    parent_genres = {
        g.gen_id: g.gen_name
        for g in db.scalars(
            select(Genre).where(Genre.gen_media_type_id == BOOKS_MEDIA_TYPE)
        ).all()
        if g.gen_name and g.gen_name.strip()
    }
    all_by_parent: dict[str, list[dict]] = {}
    for s in db.scalars(
        select(Subgenre)
        .where(Subgenre.sgn_media_type_id == BOOKS_MEDIA_TYPE)
        .order_by(Subgenre.sgn_name)
    ).all():
        if not s.sgn_name or not s.sgn_name.strip():
            continue
        parent = parent_genres.get(s.sgn_genre_id or 0)
        if not parent:
            g = db.get(Genre, s.sgn_genre_id or 0)
            parent = (g.gen_name if g and g.gen_name else None) or "Other"
        all_by_parent.setdefault(parent, []).append(
            {
                "id": s.sgn_id,
                "name": s.sgn_name,
                "genre_id": s.sgn_genre_id,
            }
        )
    for items in all_by_parent.values():
        items.sort(key=lambda x: (x.get("name") or "").casefold())
    all_subgenre_groups = [
        {"genre": name, "items": items}
        for name, items in sorted(
            all_by_parent.items(), key=lambda x: x[0].casefold()
        )
    ]
    return {
        "continents": [],
        "countries": [],
        "genres": [
            {"id": item["id"], "name": item["name"]}
            for group in all_subgenre_groups
            for item in group["items"]
        ],
        "publishers": [],
        "writers": [],
        "authors": [],
        "decades": [],
        "country_groups": all_country_groups(db),
        "all_country_groups": all_country_groups(db),
        "subgenre_groups": all_subgenre_groups,
        "all_subgenre_groups": all_subgenre_groups,
    }


@router.get("/resolve")
def books_resolve(path: str = Query(..., min_length=1)):
    hit = resolve_books_path(path)
    if not hit:
        raise HTTPException(404, "Path not found under Books/")
    return hit


@router.get("/dashboard")
def books_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return build_books_dashboard(db, user.usr_id)


@router.get("/franchises/{work_id}")
def books_franchise(work_id: str, db: Session = Depends(get_db)):
    detail = build_work_detail(work_id)
    if not detail:
        raise HTTPException(404, "Books franchise not found")
    uni = universe_for_franchise(db, "books", work_id)
    return {**detail, "universe": uni}


@router.get("/franchises/{work_id}/overview")
def books_franchise_overview(
    work_id: str,
    db: Session = Depends(get_db),
    orientation: str = Query("portrait"),
):
    ov = build_work_overview(db, work_id, orientation=orientation)
    if not ov:
        raise HTTPException(404, "Books franchise not found")
    return ov


@router.get("/franchises/{work_id}/media/{kind}")
def books_franchise_media(work_id: str, kind: str, db: Session = Depends(get_db)):
    mapping = {
        "series": "series",
        "movies": "movie",
        "movie": "movie",
        "audio": "music",
        "library": "book",
        "books": "book",
        "games": "game",
    }
    if kind in ("library", "games"):
        ov = build_work_overview(db, work_id)
        if not ov:
            raise HTTPException(404, "Books franchise not found")
        related = ov.get("related") or {}
        key = "books" if kind == "library" else "games"
        return {"items": related.get(key) or []}
    entry_kind = mapping.get(kind)
    if not entry_kind:
        raise HTTPException(404, "Unknown media kind")
    items = _franchise_media_items(work_id, entry_kind)
    if kind == "audio":
        return {"releases": items}
    return {"items": items}


@router.get("/gallery")
def books_gallery(path: str = Query(..., min_length=1)):
    try:
        return build_books_gallery(path)
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/books/{book_id}")
def book_detail(book_id: str):
    detail = build_book_detail(book_id)
    if not detail:
        raise HTTPException(404, "Book not found")
    return detail


@router.get("/books/{book_id}/overview")
def book_overview(
    book_id: str,
    db: Session = Depends(get_db),
    orientation: str = Query("portrait"),
):
    ov = build_book_overview(db, book_id, orientation=orientation)
    if not ov:
        raise HTTPException(404, "Book not found")
    return ov


@router.get("/search-metadata")
def books_search_metadata(
    q: str = Query(..., min_length=1),
    _admin: User = Depends(require_admin),
):
    return search_book_metadata(q)


@router.get("/franchises/{work_id}/search-metadata")
def books_work_search_metadata(
    work_id: str,
    q: str | None = None,
    _admin: User = Depends(require_admin),
):
    return search_work_metadata(work_id, q)


@router.patch("/franchises/{work_id}/about")
def books_work_patch_about(
    work_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.books_refresh import patch_work_about

    try:
        return patch_work_about(
            db,
            work_id,
            bio=body.get("bio"),
            writers=body.get("writers"),
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.patch("/books/{book_id}/about")
def books_book_patch_about(
    book_id: str,
    body: dict,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.books_admin import patch_book_about

    try:
        return patch_book_about(
            db,
            book_id,
            bio=body.get("bio"),
            writers=body.get("writers"),
            publishers=body.get("publishers"),
            country_id=body.get("country_id"),
            languages=body.get("languages"),
            genres=body.get("genres"),
            activity_start=body.get("activity_start"),
            activity_end=body.get("activity_end"),
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/books/{book_id}/cast")
def books_book_add_cast(
    book_id: str,
    body: dict,
    _admin: User = Depends(require_admin),
):
    from app.books_admin import add_book_cast_member

    try:
        return add_book_cast_member(
            book_id,
            kind=body.get("kind") or body.get("bucket") or "characters",
            name=body.get("name") or body.get("character") or "",
            character=body.get("character"),
            photo_url=body.get("photo_url"),
            character_photo_url=body.get("character_photo_url"),
            roles=body.get("roles"),
            language=body.get("language"),
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.patch("/books/{book_id}/cast/{member_id}")
def books_book_patch_cast(
    book_id: str,
    member_id: str,
    body: dict,
    _admin: User = Depends(require_admin),
):
    from app.books_admin import patch_book_cast_member

    try:
        return patch_book_cast_member(
            book_id,
            member_id,
            kind=body.get("kind") or body.get("bucket") or "characters",
            name=body.get("name"),
            character=body.get("character"),
            photo_url=body.get("photo_url"),
            roles=body.get("roles"),
            language=body.get("language"),
            delete=bool(body.get("delete")),
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/franchises/{work_id}/refresh-metadata")
def books_work_refresh_metadata(
    work_id: str,
    _admin: User = Depends(require_admin),
):
    """Stub refresh — re-scans local work and returns overview-ready ok."""
    from app.books_index import build_work_detail

    detail = build_work_detail(work_id)
    if not detail:
        raise HTTPException(404, "Books franchise not found")
    return {"ok": True, "work_id": detail.get("id") or work_id}


@router.post("/books/{book_id}/refresh-metadata")
def books_refresh_metadata(
    book_id: str,
    volume_id: str = Query(..., min_length=1),
    _admin: User = Depends(require_admin),
):
    return apply_book_metadata_stub(book_id, volume_id)
