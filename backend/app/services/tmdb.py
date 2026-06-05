from __future__ import annotations

import httpx

TMDB_BASE = "https://api.themoviedb.org/3"


async def search_tv_id(name: str, api_key: str) -> tuple[int | None, str | None]:
    folder_name = name.replace("■", ",").replace("█", "'")
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{TMDB_BASE}/search/tv",
            params={"api_key": api_key, "query": folder_name},
        )
        r.raise_for_status()
        data = r.json()
    results = data.get("results") or []
    if not results:
        return None, None
    top = results[0]
    return top.get("id"), top.get("name")
