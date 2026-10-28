"""Google Books API helpers for Books metadata refresh / catalog import.

Credentials: env MYSTACK_GOOGLE_BOOKS_API_KEY or ApiAuth row named Google Books.
"""
from __future__ import annotations

import time
from typing import Any

import httpx

from app.crud import get_google_books_key

GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes"
_TRANSIENT_STATUS = frozenset({502, 503, 504})
_MAX_ATTEMPTS = 4
_RETRY_BACKOFF_S = (0.35, 0.8, 1.6)


class GoogleBooksError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code

    @property
    def transient(self) -> bool:
        return self.status_code in _TRANSIENT_STATUS


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
    if status in _TRANSIENT_STATUS:
        raise GoogleBooksError(
            "Google Books is temporarily unavailable — try again",
            status_code=status,
        )
    raise GoogleBooksError(
        f"Google Books request failed (HTTP {status})",
        status_code=status,
    )


def _get_json(
    url: str,
    *,
    params: dict[str, Any],
    had_key: bool,
) -> dict:
    """GET JSON with retries on Google's intermittent 502/503/504."""
    last_exc: GoogleBooksError | None = None
    with httpx.Client(timeout=30.0) as client:
        for attempt in range(_MAX_ATTEMPTS):
            try:
                r = client.get(url, params=params)
                _raise_for_status(r, had_key=had_key)
                data = r.json()
                return data if isinstance(data, dict) else {}
            except GoogleBooksError as exc:
                last_exc = exc
                if not exc.transient or attempt >= _MAX_ATTEMPTS - 1:
                    raise
                time.sleep(_RETRY_BACKOFF_S[min(attempt, len(_RETRY_BACKOFF_S) - 1)])
    if last_exc:
        raise last_exc
    raise GoogleBooksError("Google Books request failed")


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
        data = _get_json(
            GOOGLE_BOOKS_URL,
            params=_params(
                {"q": q, "maxResults": max_results, "printType": "books"},
                api_key=key,
            ),
            had_key=bool(key),
        )
    except GoogleBooksError:
        raise
    except Exception as exc:
        raise GoogleBooksError(f"Google Books search failed: {exc}") from exc

    out: list[dict] = []
    for item in data.get("items") or []:
        if isinstance(item, dict):
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
    last_exc: GoogleBooksError | None = None
    try:
        with httpx.Client(timeout=30.0) as client:
            for attempt in range(_MAX_ATTEMPTS):
                r = client.get(
                    f"{GOOGLE_BOOKS_URL}/{vid}",
                    params=_params({}, api_key=key),
                )
                if r.status_code == 404:
                    return None
                try:
                    _raise_for_status(r, had_key=bool(key))
                    item = r.json()
                    return _volume_payload(item if isinstance(item, dict) else {})
                except GoogleBooksError as exc:
                    last_exc = exc
                    if not exc.transient or attempt >= _MAX_ATTEMPTS - 1:
                        raise
                    time.sleep(
                        _RETRY_BACKOFF_S[min(attempt, len(_RETRY_BACKOFF_S) - 1)]
                    )
    except GoogleBooksError:
        raise
    except Exception as exc:
        raise GoogleBooksError(f"Google Books lookup failed: {exc}") from exc
    if last_exc:
        raise last_exc
    return None
