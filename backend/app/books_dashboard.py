"""Books module home dashboard."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.books_index import build_books_catalog
from app.config import settings


def build_books_dashboard(db: Session | None = None, user_id: int | None = None) -> dict:
    media_root = Path(settings.media_root) if settings.media_root else None
    catalog = (
        build_books_catalog(media_root)
        if media_root
        else {"franchises": [], "books": []}
    )
    franchises = catalog.get("franchises") or []
    books = catalog.get("books") or []

    def is_saga(card: dict | None) -> bool:
        if not card or card.get("is_standalone"):
            return False
        return int(card.get("book_count") or card.get("film_count") or 0) > 1

    sagas = [f for f in franchises if is_saga(f)]
    return {
        "top_franchises": sagas[:12] or [f for f in franchises if not f.get("is_standalone")][:12],
        "top_books": books[:12],
        "top_films": books[:12],
        "top_series": books[:12],
        "franchise_count": len(franchises),
        "book_count": len(books),
        "scanned_at": catalog.get("scanned_at"),
        "top_genres": [],
        "top_countries": [],
    }
