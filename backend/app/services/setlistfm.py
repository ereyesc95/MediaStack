"""Setlist.fm API helpers (sync)."""
from __future__ import annotations

import time

import httpx

SETLISTFM_BASE = "https://api.setlist.fm/rest/1.0"
PAGE_DELAY_SEC = 0.5
RATE_LIMIT_RETRY_SEC = 2.5
RATE_LIMIT_MAX_RETRIES = 4


def _headers(api_key: str) -> dict[str, str]:
    return {
        "x-api-key": api_key,
        "Accept": "application/json",
    }


def fetch_artist_setlist_summaries(
    mbid: str,
    *,
    api_key: str,
    max_pages: int = 80,
    year: str | None = None,
) -> tuple[list[dict], int]:
    """Return setlist summary dicts for an artist MusicBrainz ID.

    Note: setlist.fm may ignore the year query param for some artists; callers
    that need a specific year should filter summaries by eventDate locally.
    """
    if not mbid or not api_key:
        return [], 0
    out: list[dict] = []
    total_count = 0
    with httpx.Client(timeout=20.0) as client:
        for page in range(1, max_pages + 1):
            if page > 1:
                time.sleep(PAGE_DELAY_SEC)
            params: dict[str, str | int] = {"p": page}
            if year:
                params["year"] = year
            data: dict | None = None
            for attempt in range(RATE_LIMIT_MAX_RETRIES + 1):
                try:
                    r = client.get(
                        f"{SETLISTFM_BASE}/artist/{mbid}/setlists",
                        params=params,
                        headers=_headers(api_key),
                    )
                except httpx.HTTPError:
                    return out, total_count
                if r.status_code == 404:
                    return out, total_count
                if r.status_code == 429:
                    if attempt >= RATE_LIMIT_MAX_RETRIES:
                        return out, total_count
                    time.sleep(RATE_LIMIT_RETRY_SEC * (attempt + 1))
                    continue
                r.raise_for_status()
                data = r.json()
                break
            if not data:
                return out, total_count
            batch = data.get("setlist") or []
            if isinstance(batch, dict):
                batch = [batch]
            if not batch:
                break
            out.extend(batch)
            total_count = int(data.get("total") or total_count or len(out))
            total_pages = int(data.get("totalPages") or 0)
            if total_pages <= 0 and total_count > 0:
                total_pages = max(1, (total_count + len(batch) - 1) // len(batch))
            if total_pages <= 0:
                total_pages = page
            if page >= total_pages:
                break
    return out, total_count


def fetch_setlist_detail(setlist_id: str, *, api_key: str) -> dict | None:
    if not setlist_id or not api_key:
        return None
    with httpx.Client(timeout=20.0) as client:
        r = client.get(
            f"{SETLISTFM_BASE}/setlist/{setlist_id}",
            headers=_headers(api_key),
        )
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()
