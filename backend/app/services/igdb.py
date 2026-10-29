"""IGDB (Twitch) client for Games catalog import + metadata refresh.

Credentials: env MYSTACK_IGDB_* or ApiAuth row named IGDB (same pattern as Spotify).
"""
from __future__ import annotations

import time
from typing import Any

from app.http_ssl import apost
from app.igdb_auth import get_igdb_credentials, igdb_credentials_configured

_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
_API_URL = "https://api.igdb.com/v4"
_token_cache: dict[str, Any] = {
    "access_token": None,
    "expires_at": 0.0,
    "client_id": None,
}

# Nested media + metadata used by search and id lookup.
_GAME_FIELDS = (
    "name,slug,first_release_date,cover.image_id,"
    "artworks.image_id,artworks.width,artworks.height,artworks.artwork_type,"
    "screenshots.image_id,screenshots.width,screenshots.height,"
    "platforms.name,genres.name,involved_companies.company.name,"
    "involved_companies.developer,involved_companies.publisher,"
    "summary"
)

# IGDB artwork_type: 5/6/7 are logos — skip for cover/gallery fills.
_LOGO_ARTWORK_TYPES = frozenset({5, 6, 7})


class IgdbNotConfigured(RuntimeError):
    pass


def igdb_configured() -> bool:
    return igdb_credentials_configured()


def _require_credentials() -> tuple[str, str]:
    cid, sec = get_igdb_credentials()
    if not cid or not sec:
        raise IgdbNotConfigured(
            "IGDB client id/secret not configured "
            "(env or ApiAuth IGDB row)"
        )
    return cid, sec


def _igdb_image_url(image_id: str, size: str) -> str:
    return f"https://images.igdb.com/igdb/image/upload/{size}/{image_id}.jpg"


async def _access_token() -> tuple[str, str]:
    client_id, client_secret = _require_credentials()
    now = time.time()
    if (
        _token_cache["access_token"]
        and _token_cache.get("client_id") == client_id
        and float(_token_cache["expires_at"]) > now + 60
    ):
        return str(_token_cache["access_token"]), client_id
    resp = await apost(
        _TOKEN_URL,
        params={
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "client_credentials",
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    data = resp.json()
    _token_cache["access_token"] = data["access_token"]
    _token_cache["expires_at"] = now + float(data.get("expires_in") or 3600)
    _token_cache["client_id"] = client_id
    return str(_token_cache["access_token"]), client_id


async def igdb_query(endpoint: str, body: str) -> list[dict]:
    token, client_id = await _access_token()
    resp = await apost(
        f"{_API_URL}/{endpoint.lstrip('/')}",
        content=body,
        headers={
            "Client-ID": client_id,
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "text/plain",
        },
        timeout=45.0,
    )
    resp.raise_for_status()
    data = resp.json()
    return data if isinstance(data, list) else []


def _media_entries(
    rows: object,
    *,
    size: str,
    skip_logo: bool = False,
) -> list[dict]:
    out: list[dict] = []
    if not isinstance(rows, list):
        return out
    for row in rows:
        if not isinstance(row, dict):
            continue
        image_id = row.get("image_id")
        if not image_id:
            continue
        artwork_type = row.get("artwork_type")
        if skip_logo and artwork_type in _LOGO_ARTWORK_TYPES:
            continue
        try:
            width = int(row.get("width") or 0)
        except (TypeError, ValueError):
            width = 0
        try:
            height = int(row.get("height") or 0)
        except (TypeError, ValueError):
            height = 0
        out.append(
            {
                "url": _igdb_image_url(str(image_id), size),
                "width": width,
                "height": height,
                "artwork_type": artwork_type,
            }
        )
    return out


def _is_landscape(entry: dict) -> bool:
    w = int(entry.get("width") or 0)
    h = int(entry.get("height") or 0)
    if w > 0 and h > 0:
        return w > h
    # Missing dims: treat as landscape candidate (screenshots/key art usually are).
    return True


def _is_portrait(entry: dict) -> bool:
    w = int(entry.get("width") or 0)
    h = int(entry.get("height") or 0)
    if w > 0 and h > 0:
        return h >= w
    return False


def _landscape_sort_key(entry: dict) -> tuple:
    atype = entry.get("artwork_type")
    # Prefer key art (2/3), then general/concept (1/4), then unknown.
    if atype in (2, 3):
        tier = 0
    elif atype in (1, 4):
        tier = 1
    elif atype is None:
        tier = 2
    else:
        tier = 3
    area = int(entry.get("width") or 0) * int(entry.get("height") or 0)
    return (tier, -area)


def _shape_game(row: dict) -> dict:
    cover = row.get("cover")
    cover_id = cover.get("image_id") if isinstance(cover, dict) else None
    platforms = [
        p["name"]
        for p in (row.get("platforms") or [])
        if isinstance(p, dict) and p.get("name")
    ]
    genres = [
        g["name"]
        for g in (row.get("genres") or [])
        if isinstance(g, dict) and g.get("name")
    ]
    developers: list[str] = []
    publishers: list[str] = []
    for ic in row.get("involved_companies") or []:
        if not isinstance(ic, dict):
            continue
        company = ic.get("company")
        name = company.get("name") if isinstance(company, dict) else None
        if not name:
            continue
        if ic.get("developer"):
            developers.append(name)
        if ic.get("publisher"):
            publishers.append(name)
    date_iso = None
    ts = row.get("first_release_date")
    if isinstance(ts, int) and ts > 0:
        from datetime import datetime, timezone

        date_iso = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")

    artworks = _media_entries(
        row.get("artworks"), size="t_1080p", skip_logo=True
    )
    screenshots = _media_entries(row.get("screenshots"), size="t_1080p")

    landscape_pool = sorted(
        [e for e in artworks if _is_landscape(e)]
        + [e for e in screenshots if _is_landscape(e)],
        key=_landscape_sort_key,
    )
    # Prefer artworks over screenshots for the primary Landscape cover.
    artwork_landscapes = sorted(
        [e for e in artworks if _is_landscape(e)],
        key=_landscape_sort_key,
    )
    backdrop = (
        (artwork_landscapes[0]["url"] if artwork_landscapes else None)
        or (landscape_pool[0]["url"] if landscape_pool else None)
        or (artworks[0]["url"] if artworks else None)
    )

    portrait_extras = [
        e["url"]
        for e in (artworks + screenshots)
        if _is_portrait(e) and e.get("url")
    ]
    landscape_extras = [e["url"] for e in landscape_pool if e.get("url")]

    # Dedupe while preserving order.
    def _uniq(urls: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for u in urls:
            if not u or u in seen:
                continue
            seen.add(u)
            out.append(u)
        return out

    portrait_extras = _uniq(portrait_extras)[:8]
    landscape_extras = _uniq(landscape_extras)[:8]

    return {
        "source": "igdb",
        "provider_id": str(row.get("id") or ""),
        "name": row.get("name") or "",
        "slug": row.get("slug") or "",
        "date_iso": date_iso,
        "overview": row.get("summary"),
        "platforms": platforms,
        "genres": genres,
        "developers": developers,
        "publishers": publishers,
        "cover_url": (
            _igdb_image_url(str(cover_id), "t_cover_big_2x") if cover_id else None
        ),
        "backdrop_url": backdrop,
        "artwork_urls": _uniq([e["url"] for e in artworks])[:12],
        "screenshot_urls": _uniq([e["url"] for e in screenshots])[:12],
        "portrait_urls": portrait_extras,
        "landscape_urls": landscape_extras,
    }


async def search_games(query: str, *, limit: int = 20) -> list[dict]:
    """Search IGDB games; returns normalized search cards + gallery URLs."""
    q = (query or "").replace('"', "").strip()
    if not q:
        return []
    lim = max(1, min(int(limit), 50))
    rows = await igdb_query(
        "games",
        f'search "{q}"; fields {_GAME_FIELDS}; limit {lim};',
    )
    return [_shape_game(row) for row in rows if row.get("id") is not None]


async def get_game(game_id: str | int) -> dict | None:
    gid = str(game_id).strip()
    if not gid.isdigit():
        return None
    rows = await search_games_by_ids([int(gid)])
    return rows[0] if rows else None


async def search_games_by_ids(ids: list[int]) -> list[dict]:
    if not ids:
        return []
    id_list = ",".join(str(i) for i in ids[:50])
    rows = await igdb_query(
        "games",
        (
            f"where id = ({id_list}); "
            f"fields {_GAME_FIELDS}; "
            f"limit {len(ids)};"
        ),
    )
    return [_shape_game(row) for row in rows if row.get("id") is not None]
