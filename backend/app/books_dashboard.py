"""Books module home dashboard."""
from __future__ import annotations

from collections import Counter
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adult_content import filter_adult_cards
from app.books_catalog_meta import enrich_books_catalog
from app.books_index import build_books_catalog
from app.config import settings
from app.franchise_identity import (
    enrich_catalog_with_artwork_home,
    enrich_catalog_with_music_identity,
)
from app.models import Country, Subgenre
from app.play_stats import subgenre_image_url


def build_books_dashboard(
    db: Session | None = None,
    user_id: int | None = None,
    *,
    nsfw_unlocked: bool = False,
) -> dict:
    media_root = Path(settings.media_root) if settings.media_root else None
    catalog = (
        build_books_catalog(media_root)
        if media_root
        else {"franchises": [], "books": []}
    )
    if db is not None:
        catalog = enrich_books_catalog(db, catalog)
        catalog = enrich_catalog_with_music_identity(
            db, catalog, orientation="portrait", media_root=media_root
        )
        catalog = enrich_catalog_with_artwork_home(catalog, media_root=media_root)
    franchises = filter_adult_cards(
        catalog.get("franchises") or [], nsfw_unlocked=nsfw_unlocked
    )
    books = filter_adult_cards(
        catalog.get("books") or [], nsfw_unlocked=nsfw_unlocked
    )

    def is_saga(card: dict | None) -> bool:
        if not card or card.get("is_standalone"):
            return False
        return int(card.get("book_count") or card.get("film_count") or 0) > 1

    def _book_card(card: dict) -> dict:
        """Ensure Best Books panes have a display name (books use ``title``)."""
        out = dict(card)
        title = (out.get("title") or out.get("name") or "").strip()
        if title:
            out["title"] = title
            out["name"] = title
        return out

    sagas = [f for f in franchises if is_saga(f)]
    top_books = [_book_card(b) for b in books[:12]]

    genre_counts: Counter[int] = Counter()
    country_iso_counts: Counter[str] = Counter()
    for card in books:
        if not isinstance(card, dict):
            continue
        for gid in card.get("genre_ids") or []:
            try:
                genre_counts[int(gid)] += 1
            except (TypeError, ValueError):
                continue
        iso = str(card.get("country_iso") or "").strip().lower()[:2]
        if iso:
            country_iso_counts[iso] += 1

    top_genres: list[dict] = []
    if db is not None:
        for gid, count in genre_counts.most_common(10):
            sg = db.get(Subgenre, gid)
            name = (sg.sgn_name if sg and sg.sgn_name else None) or str(gid)
            top_genres.append(
                {
                    "id": gid,
                    "name": name,
                    "play_count": count,
                    "image_url": subgenre_image_url(name),
                }
            )

    top_countries: list[dict] = []
    if db is not None:
        for iso, count in country_iso_counts.most_common(10):
            crow = db.scalars(
                select(Country).where(Country.cou_iso.ilike(iso))
            ).first()
            top_countries.append(
                {
                    "id": crow.cou_id if crow else None,
                    "name": (crow.cou_name if crow else iso.upper()),
                    "iso": (crow.cou_iso or iso).lower() if crow else iso,
                    "play_count": count,
                }
            )

    return {
        "top_franchises": sagas[:12] or [f for f in franchises if not f.get("is_standalone")][:12],
        "top_books": top_books,
        "top_films": top_books,
        "top_series": top_books,
        "franchise_count": len(franchises),
        "book_count": len(books),
        "scanned_at": catalog.get("scanned_at"),
        "top_genres": top_genres,
        "top_countries": top_countries,
    }
