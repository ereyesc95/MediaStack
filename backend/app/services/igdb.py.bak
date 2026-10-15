"""IGDB (Twitch) client for Games catalog import + metadata refresh.

Requires MYSTACK_IGDB_CLIENT_ID and MYSTACK_IGDB_CLIENT_SECRET (Twitch app).
"""
from __future__ import annotations

import time
from typing import Any

import httpx

from app.config import settings

_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
_API_URL = "https://api.igdb.com/v4"
_token_cache: dict[str, Any] = {"access_token": None, "expires_at": 0.0}


class IgdbNotConfigured(RuntimeError):
    pass


def igdb_configured() -> bool:
    return bool(
        (settings.igdb_client_id or "").strip()
        and (settings.igdb_client_secret or "").strip()
    )


async def _access_token() -> str:
    if not igdb_configured():
        raise IgdbNotConfigured("IGDB client id/secret not configured")
    now = time.time()
    if _token_cache["access_token"] and float(_token_cache["expires_at"]) > now + 60:
        return str(_token_cache["access_token"])
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            _TOKEN_URL,
            params={
                "client_id": settings.igdb_client_id,
                "client_secret": settings.igdb_client_secret,
                "grant_type": "client_credentials",
            },
        )
        resp.raise_for_status()
        data = resp.json()
    _token_cache["access_token"] = data["access_token"]
    _token_cache["expires_at"] = now + float(data.get("expires_in") or 3600)
    return str(_token_cache["access_token"])


async def igdb_query(endpoint: str, body: str) -> list[dict]:
    token = await _access_token()
    async with httpx.AsyncClient(timeout=45) as client:
        resp = await client.post(
            f"{_API_URL}/{endpoint.lstrip('/')}",
            content=body,
            headers={
                "Client-ID": settings.igdb_client_id,
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
                "Content-Type": "text/plain",
            },
        )
        resp.raise_for_status()
        data = resp.json()
    return data if isinstance(data, list) else []


async def search_games(query: str, *, limit: int = 20) -> list[dict]:
    """Search IGDB games; returns normalized search cards."""
    q = (query or "").replace('"', "").strip()
    if not q:
        return []
    lim = max(1, min(int(limit), 50))
    rows = await igdb_query(
        "games",
        (
            f'search "{q}"; '
            "fields name,slug,first_release_date,cover.image_id,"
            "platforms.name,genres.name,involved_companies.company.name,"
            "involved_companies.developer,involved_companies.publisher,"
            "summary; "
            f"limit {lim};"
        ),
    )
    out: list[dict] = []
    for row in rows:
        cover_id = None
        cover = row.get("cover")
        if isinstance(cover, dict):
            cover_id = cover.get("image_id")
        elif isinstance(cover, int):
            cover_id = None
        platforms = []
        for p in row.get("platforms") or []:
            if isinstance(p, dict) and p.get("name"):
                platforms.append(p["name"])
        genres = []
        for g in row.get("genres") or []:
            if isinstance(g, dict) and g.get("name"):
                genres.append(g["name"])
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

            date_iso = datetime.fromtimestamp(ts, tz=timezone.utc).strftime(
                "%Y-%m-%d"
            )
        out.append(
            {
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
                    f"https://images.igdb.com/igdb/image/upload/t_cover_big/{cover_id}.jpg"
                    if cover_id
                    else None
                ),
            }
        )
    return out


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
            "fields name,slug,first_release_date,cover.image_id,"
            "platforms.name,genres.name,involved_companies.company.name,"
            "involved_companies.developer,involved_companies.publisher,"
            "summary; "
            f"limit {len(ids)};"
        ),
    )
    # Reuse search_games shaping via a tiny local remap
    shaped: list[dict] = []
    for row in rows:
        # search_games expects search results; duplicate logic lightly
        fake_q = row.get("name") or ""
        _ = fake_q
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

            date_iso = datetime.fromtimestamp(ts, tz=timezone.utc).strftime(
                "%Y-%m-%d"
            )
        shaped.append(
            {
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
                    f"https://images.igdb.com/igdb/image/upload/t_cover_big/{cover_id}.jpg"
                    if cover_id
                    else None
                ),
            }
        )
    return shaped
