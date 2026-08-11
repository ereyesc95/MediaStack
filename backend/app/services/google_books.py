"""Google Books API helpers for Books metadata refresh."""
from __future__ import annotations

import httpx

GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes"


def search_google_books(query: str, *, max_results: int = 8) -> list[dict]:
    q = (query or "").strip()
    if not q:
        return []
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.get(
                GOOGLE_BOOKS_URL,
                params={"q": q, "maxResults": max_results, "printType": "books"},
            )
            r.raise_for_status()
            data = r.json()
    except Exception:
        return []

    out: list[dict] = []
    for item in data.get("items") or []:
        info = item.get("volumeInfo") or {}
        image = (info.get("imageLinks") or {})
        out.append(
            {
                "id": item.get("id"),
                "title": info.get("title"),
                "authors": info.get("authors") or [],
                "publisher": info.get("publisher"),
                "published_date": info.get("publishedDate"),
                "description": info.get("description"),
                "categories": info.get("categories") or [],
                "language": info.get("language"),
                "page_count": info.get("pageCount"),
                "thumbnail": image.get("thumbnail") or image.get("smallThumbnail"),
                "info_link": info.get("infoLink"),
                "preview_link": info.get("previewLink"),
            }
        )
    return out


def get_google_book(volume_id: str) -> dict | None:
    vid = (volume_id or "").strip()
    if not vid:
        return None
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.get(f"{GOOGLE_BOOKS_URL}/{vid}")
            r.raise_for_status()
            item = r.json()
    except Exception:
        return None
    info = item.get("volumeInfo") or {}
    image = info.get("imageLinks") or {}
    return {
        "id": item.get("id"),
        "title": info.get("title"),
        "authors": info.get("authors") or [],
        "publisher": info.get("publisher"),
        "published_date": info.get("publishedDate"),
        "description": info.get("description"),
        "categories": info.get("categories") or [],
        "language": info.get("language"),
        "page_count": info.get("pageCount"),
        "thumbnail": image.get("thumbnail") or image.get("smallThumbnail"),
        "info_link": info.get("infoLink"),
        "preview_link": info.get("previewLink"),
    }
