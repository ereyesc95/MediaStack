"""Google Books API helpers for Books metadata refresh / catalog import.

Credentials: env MYSTACK_GOOGLE_BOOKS_API_KEY or ApiAuth row named Google Books.
"""
from __future__ import annotations

from typing import Any

import httpx

from app.crud import get_google_books_key

GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes"


class GoogleBooksError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _api_key(explicit: str | None = None) -> str | None:
    key = (explicit or "").strip() or None
    if key:
        return key
    return get_google_books_key()


def _params(base: dict[str, Any], *, api_key: str | None) -> dict[str, Any]:
    out = dict(base)
    if api_key:
        out["key"] = api_key
    return out


def _raise_for_status(response: httpx.Response, *, had_key: bool) -> None:
    status = response.status_code
    if status < 400:
        return
    if status == 429:
        if had_key:
            raise GoogleBooksError(
                "Google Books rate limit exceeded — try again shortly",
                status_code=429,
            )
        raise GoogleBooksError(
            "Google Books rate limit — configure an API key "
            "(ApiAuth “Google Books” or MYSTACK_GOOGLE_BOOKS_API_KEY)",
            status_code=429,
        )
    if status in (401, 403):
        raise GoogleBooksError(
            "Google Books API key rejected — check ApiAuth “Google Books” "
            "or MYSTACK_GOOGLE_BOOKS_API_KEY",
            status_code=status,
        )
    raise GoogleBooksError(
        f"Google Books request failed (HTTP {status})",
        status_code=status,
    )


def _volume_payload(item: dict) -> dict:
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


def search_google_books(
    query: str,
    *,
    max_results: int = 8,
    api_key: str | None = None,
) -> list[dict]:
    q = (query or "").strip()
    if not q:
        return []
    key = _api_key(api_key)
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.get(
                GOOGLE_BOOKS_URL,
                params=_params(
                    {"q": q, "maxResults": max_results, "printType": "books"},
                    api_key=key,
                ),
            )
            _raise_for_status(r, had_key=bool(key))
            data = r.json()
    except GoogleBooksError:
        raise
    except Exception as exc:
        raise GoogleBooksError(f"Google Books search failed: {exc}") from exc

    out: list[dict] = []
    for item in data.get("items") or []:
        out.append(_volume_payload(item))
    return out


def get_google_book(
    volume_id: str,
    *,
    api_key: str | None = None,
) -> dict | None:
    vid = (volume_id or "").strip()
    if not vid:
        return None
    key = _api_key(api_key)
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.get(
                f"{GOOGLE_BOOKS_URL}/{vid}",
                params=_params({}, api_key=key),
            )
            if r.status_code == 404:
                return None
            _raise_for_status(r, had_key=bool(key))
            item = r.json()
    except GoogleBooksError:
        raise
    except Exception as exc:
        raise GoogleBooksError(f"Google Books lookup failed: {exc}") from exc
    return _volume_payload(item)
