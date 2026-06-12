"""Setlist.fm API helpers (sync)."""
from __future__ import annotations

import httpx

SETLISTFM_BASE = "https://api.setlist.fm/rest/1.0"


def _headers(api_key: str) -> dict[str, str]:
    return {
        "x-api-key": api_key,
        "Accept": "application/json",
    }


def fetch_artist_setlist_summaries(
    mbid: str,
    *,
    api_key: str,
    max_pages: int = 2,
) -> list[dict]:
    """Return setlist summary dicts for an artist MusicBrainz ID."""
    if not mbid or not api_key:
        return []
    out: list[dict] = []
    with httpx.Client(timeout=8.0) as client:
        for page in range(1, max_pages + 1):
            r = client.get(
                f"{SETLISTFM_BASE}/artist/{mbid}/setlists",
                params={"p": page},
                headers=_headers(api_key),
            )
            if r.status_code == 404:
                break
            r.raise_for_status()
            data = r.json()
            batch = data.get("setlist") or []
            if isinstance(batch, dict):
                batch = [batch]
            if not batch:
                break
            out.extend(batch)
            total_pages = int(data.get("totalPages") or 1)
            if page >= total_pages:
                break
    return out


def fetch_setlist_detail(setlist_id: str, *, api_key: str) -> dict | None:
    if not setlist_id or not api_key:
        return None
    with httpx.Client(timeout=8.0) as client:
        r = client.get(
            f"{SETLISTFM_BASE}/setlist/{setlist_id}",
            headers=_headers(api_key),
        )
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()
