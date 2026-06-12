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


async def fetch_artist(
    mbid: str,
    *,
    user_agent: str = DEFAULT_UA,
    inc: str = "aliases+tags+url-rels",
) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{MB_BASE}/artist/{mbid}",
            params={"fmt": "json", "inc": inc},
            headers={"User-Agent": user_agent},
        )
        r.raise_for_status()
        return r.json()


async def fetch_artist_with_members(
    mbid: str, *, user_agent: str = DEFAULT_UA
) -> dict:
    return await fetch_artist(
        mbid,
        user_agent=user_agent,
        inc="aliases+tags+url-rels+artist-rels",
    )


async def search_release_groups(
    *,
    artist_mbid: str,
    title: str,
    limit: int = 3,
    user_agent: str = DEFAULT_UA,
) -> list[dict]:
    clean = title.replace('"', "").strip()
    if not clean or not artist_mbid:
        return []
    query = f'release:"{clean}" AND arid:{artist_mbid}'
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{MB_BASE}/release-group/",
            params={"query": query, "fmt": "json", "limit": limit},
            headers={"User-Agent": user_agent},
        )
        r.raise_for_status()
        data = r.json()
    out: list[dict] = []
    for rg in (data.get("release-groups") or [])[:limit]:
        out.append(
            {
                "mbid": rg.get("id"),
                "title": rg.get("title"),
                "primary_type": (rg.get("primary-type") or "").lower(),
                "first_release_date": rg.get("first-release-date"),
            }
        )
    return out


async def fetch_release_group(
    mbid: str,
    *,
    user_agent: str = DEFAULT_UA,
    inc: str = "url-rels+releases+artist-credits+tags+annotation",
) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{MB_BASE}/release-group/{mbid}",
            params={"fmt": "json", "inc": inc},
            headers={"User-Agent": user_agent},
        )
        r.raise_for_status()
        return r.json()
