from __future__ import annotations

import httpx

MB_BASE = "https://musicbrainz.org/ws/2"
DEFAULT_UA = "MediaStack/1.0 (https://github.com/local/mediastack)"


async def search_artist_mbid(name: str, *, user_agent: str = DEFAULT_UA) -> str | None:
    items = await search_artists(name, limit=1, user_agent=user_agent)
    return items[0]["mbid"] if items else None


async def search_artists(
    name: str,
    *,
    limit: int = 3,
    user_agent: str = DEFAULT_UA,
) -> list[dict]:
    folder_name = name.replace("■", ",").replace("█", "'").strip()
    if not folder_name:
        return []
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{MB_BASE}/artist/",
            params={"query": f'artist:"{folder_name}"', "fmt": "json", "limit": limit},
            headers={"User-Agent": user_agent},
        )
        r.raise_for_status()
        data = r.json()
    out: list[dict] = []
    for a in (data.get("artists") or [])[:limit]:
        out.append(
            {
                "mbid": a.get("id"),
                "name": a.get("name"),
                "sort_name": a.get("sort-name"),
                "type": a.get("type"),
                "country": a.get("country"),
                "disambiguation": a.get("disambiguation"),
            }
        )
    return out


async def fetch_artist(mbid: str, *, user_agent: str = DEFAULT_UA) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{MB_BASE}/artist/{mbid}",
            params={"fmt": "json", "inc": "aliases+tags"},
            headers={"User-Agent": user_agent},
        )
        r.raise_for_status()
        return r.json()
