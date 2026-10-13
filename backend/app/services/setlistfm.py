"""Setlist.fm API helpers (sync)."""
from __future__ import annotations

import logging
import time
import unicodedata

import httpx

SETLISTFM_BASE = "https://api.setlist.fm/rest/1.0"
PAGE_DELAY_SEC = 0.5
RATE_LIMIT_RETRY_SEC = 2.5
RATE_LIMIT_MAX_RETRIES = 4

_log = logging.getLogger(__name__)

# After a corporate-MITM SSL failure, reuse verify=False for this process.
_ssl_verify: bool = True


def _headers(api_key: str) -> dict[str, str]:
    return {
        "x-api-key": api_key,
        "Accept": "application/json",
    }


def fold_artist_name(name: str | None) -> str:
    """ASCII-fold for setlist.fm search (Kælan → Kaelan, etc.)."""
    text = (name or "").strip()
    if not text:
        return ""
    # Ligatures / Nordic letters setlist.fm URL-slugs usually flatten
    replacements = (
        ("æ", "ae"),
        ("Æ", "Ae"),
        ("œ", "oe"),
        ("Œ", "Oe"),
        ("ß", "ss"),
        ("ø", "o"),
        ("Ø", "O"),
        ("å", "a"),
        ("Å", "A"),
        ("ð", "d"),
        ("Ð", "D"),
        ("þ", "th"),
        ("Þ", "Th"),
    )
    for src, dst in replacements:
        text = text.replace(src, dst)
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def _client(*, verify: bool | str = True) -> httpx.Client:
    return httpx.Client(timeout=20.0, verify=verify)


def _is_ssl_error(exc: BaseException) -> bool:
    msg = str(exc).casefold()
    return "certificate" in msg or "ssl" in msg


def _get_json(
    path: str,
    *,
    api_key: str,
    params: dict[str, str | int] | None = None,
) -> dict | None:
    """GET JSON; on corporate MITM SSL failure, retry with verify=False."""
    global _ssl_verify
    url = f"{SETLISTFM_BASE}{path}"
    headers = _headers(api_key)
    last_exc: Exception | None = None
    verify_order = (True, False) if _ssl_verify else (False,)
    for verify in verify_order:
        try:
            with _client(verify=verify) as client:
                for attempt in range(RATE_LIMIT_MAX_RETRIES + 1):
                    try:
                        r = client.get(url, params=params, headers=headers)
                    except httpx.HTTPError as exc:
                        last_exc = exc
                        if verify and _is_ssl_error(exc):
                            _ssl_verify = False
                            _log.warning(
                                "setlist.fm SSL verify failed; retrying without verify"
                            )
                            break
                        return None
                    if r.status_code == 404:
                        return None
                    if r.status_code == 429:
                        if attempt >= RATE_LIMIT_MAX_RETRIES:
                            return None
                        time.sleep(RATE_LIMIT_RETRY_SEC * (attempt + 1))
                        continue
                    r.raise_for_status()
                    if not verify and _ssl_verify is False:
                        pass  # already using insecure mode
                    return r.json()
        except httpx.HTTPError as exc:
            last_exc = exc
            if verify and _is_ssl_error(exc):
                _ssl_verify = False
                _log.warning(
                    "setlist.fm SSL verify failed; retrying without verify"
                )
                continue
            return None
    if last_exc:
        _log.warning("setlist.fm request failed: %s", last_exc)
    return None


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
    for page in range(1, max_pages + 1):
        if page > 1:
            time.sleep(PAGE_DELAY_SEC)
        params: dict[str, str | int] = {"p": page}
        if year:
            params["year"] = year
        data = _get_json(f"/artist/{mbid}/setlists", api_key=api_key, params=params)
        if data is None:
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
    return _get_json(f"/setlist/{setlist_id}", api_key=api_key)


def search_setlists(
    *,
    api_key: str,
    artist_mbid: str | None = None,
    artist_name: str | None = None,
    date_dd_mm_yyyy: str | None = None,
    city_name: str | None = None,
    venue_name: str | None = None,
) -> list[dict]:
    """Search setlists (prefer artistMbid + date for precise show lookup)."""
    if not api_key:
        return []
    params: dict[str, str | int] = {"p": 1}
    if artist_mbid:
        params["artistMbid"] = artist_mbid
    if artist_name:
        params["artistName"] = artist_name
    if date_dd_mm_yyyy:
        params["date"] = date_dd_mm_yyyy
    if city_name:
        params["cityName"] = city_name
    if venue_name:
        params["venueName"] = venue_name
    if len(params) <= 1:
        return []
    data = _get_json("/search/setlists", api_key=api_key, params=params)
    if not data:
        return []
    batch = data.get("setlist") or []
    if isinstance(batch, dict):
        batch = [batch]
    return list(batch)


def search_artists(*, api_key: str, artist_name: str) -> list[dict]:
    if not api_key or not (artist_name or "").strip():
        return []
    data = _get_json(
        "/search/artists",
        api_key=api_key,
        params={"artistName": artist_name.strip(), "p": 1},
    )
    if not data:
        return []
    batch = data.get("artist") or []
    if isinstance(batch, dict):
        batch = [batch]
    return list(batch)
