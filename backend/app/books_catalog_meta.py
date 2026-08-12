"""Enrich Books catalog cards with DB metadata for filters + adult gating."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.books_store import (
    iter_book_leaf_meta,
    iter_book_work_meta,
    load_book_about,
    load_work_about,
)
from app.config import settings
from app.models import Country, Genre, Subgenre

BOOKS_MEDIA_TYPE = 500


def _genre_fields_from_about(about: dict, sub_by_id: dict[int, Subgenre], parent_by_id: dict[int, str]) -> tuple[list, list[str], list[str]]:
    genre_ids: list = []
    genre_names: list[str] = []
    parent_names: set[str] = set()
    raw = about.get("genres")
    if not isinstance(raw, list):
        return genre_ids, genre_names, sorted(parent_names)
    for g in raw:
        if not isinstance(g, dict):
            continue
        name_g = (g.get("name") or "").strip()
        if name_g:
            genre_names.append(name_g)
        gid = g.get("id")
        if gid is None:
            continue
        try:
            gid_i = int(gid)
        except (TypeError, ValueError):
            continue
        genre_ids.append(gid_i)
        sub = sub_by_id.get(gid_i)
        if sub and sub.sgn_genre_id:
            pname = parent_by_id.get(int(sub.sgn_genre_id))
            if pname:
                parent_names.add(pname)
    return genre_ids, genre_names, sorted(parent_names)


def enrich_books_catalog(db: Session, catalog: dict) -> dict:
    """Attach genre/country fields from BookLeaf / BookWork onto catalog cards."""
    parents = {
        g.gen_id: (g.gen_name or "").strip()
        for g in db.scalars(
            select(Genre).where(Genre.gen_media_type_id == BOOKS_MEDIA_TYPE)
        ).all()
        if g.gen_name
    }
    sub_by_id = {
        s.sgn_id: s
        for s in db.scalars(
            select(Subgenre).where(Subgenre.sgn_media_type_id == BOOKS_MEDIA_TYPE)
        ).all()
    }

    leaf_by_id: dict[str, dict] = {}
    for row, about in iter_book_leaf_meta(db):
        leaf_by_id[row.blk_book_id] = about

    work_by_slug: dict[str, dict] = {}
    for row, about in iter_book_work_meta(db):
        if row.bwk_slug:
            work_by_slug[row.bwk_slug.casefold()] = about

    countries = {
        c.cou_id: c for c in db.scalars(select(Country)).all() if c.cou_id is not None
    }

    def apply_about(card: dict, about: dict) -> None:
        gids, gnames, pnames = _genre_fields_from_about(about, sub_by_id, parents)
        card["genre_ids"] = gids
        card["genre_names"] = gnames
        card["parent_genre_names"] = pnames
        country = about.get("country") if isinstance(about.get("country"), dict) else None
        if country:
            cid = country.get("id")
            try:
                cid_i = int(cid) if cid is not None else None
            except (TypeError, ValueError):
                cid_i = None
            crow = countries.get(cid_i) if cid_i is not None else None
            card["country_id"] = cid_i
            card["country_iso"] = (country.get("iso") or (crow.cou_iso if crow else None))
            card["continent_id"] = getattr(crow, "cou_continent_id", None) if crow else None
        else:
            card.setdefault("country_id", None)
            card.setdefault("country_iso", None)
            card.setdefault("continent_id", None)
        pubs = about.get("publishers")
        writers = about.get("writers") or about.get("authors")
        if isinstance(pubs, list):
            card["publishers"] = [str(p).strip() for p in pubs if p and str(p).strip()]
        if isinstance(writers, list):
            card["writers"] = [str(w).strip() for w in writers if w and str(w).strip()]

    root = Path(settings.media_root or "")
    root_ok = root.is_dir()

    books = catalog.get("books") or catalog.get("films") or []
    for card in books:
        if not isinstance(card, dict):
            continue
        bid = str(card.get("id") or "")
        about = leaf_by_id.get(bid) or {}
        if not about and root_ok:
            folder = (card.get("folder_path") or "").replace("\\", "/")
            book_dir = root / folder if folder else None
            if book_dir and book_dir.is_dir():
                about = load_book_about(book_dir, book_id=bid or None, db=db)
                if about:
                    leaf_by_id[bid] = about
        if not about:
            # Fall back to work-level genres when leaf has none yet.
            wid = (card.get("work_id") or "").casefold()
            about = work_by_slug.get(wid) or {}
        apply_about(card, about)

    for card in catalog.get("franchises") or []:
        if not isinstance(card, dict):
            continue
        slug = (card.get("id") or card.get("slug") or "").casefold()
        about = work_by_slug.get(slug) or {}
        if not about and root_ok:
            folder = (card.get("folder_path") or "").replace("\\", "/")
            work_dir = root / folder if folder else None
            if work_dir and work_dir.is_dir():
                about = load_work_about(work_dir, db=db)
                if about:
                    work_by_slug[slug] = about
        # Aggregate leaf genres under the work when work about has none.
        if not about.get("genres"):
            agg_ids: list = []
            agg_names: list[str] = []
            agg_parents: set[str] = set()
            for book in card.get("books") or card.get("films") or []:
                if not isinstance(book, dict):
                    continue
                for gid in book.get("genre_ids") or []:
                    if gid not in agg_ids:
                        agg_ids.append(gid)
                for n in book.get("genre_names") or []:
                    if n not in agg_names:
                        agg_names.append(n)
                for n in book.get("parent_genre_names") or []:
                    agg_parents.add(n)
            if agg_names or agg_parents:
                card["genre_ids"] = agg_ids
                card["genre_names"] = agg_names
                card["parent_genre_names"] = sorted(agg_parents)
                continue
        apply_about(card, about)

    if "films" in catalog and "books" in catalog:
        catalog["films"] = catalog["books"]
    return catalog
