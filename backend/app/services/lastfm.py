"""Last.fm API helpers."""
from __future__ import annotations

import httpx

LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/"


async def fetch_similar_artists(
    name: str,
    *,
    api_key: str,
    limit: int = 20,
) -> list[dict]:
    """Return [{name, mbid?}, ...] from Last.fm artist.getSimilar."""
    artist = name.replace("■", ",").replace("█", "'").strip()
    if not artist or not api_key:
        return []
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(
            LASTFM_BASE,
            params={
                "method": "artist.getsimilar",
                "artist": artist,
                "api_key": api_key,
                "format": "json",
                "limit": limit,
            },
        )
        r.raise_for_status()
        data = r.json()
    sim = (data.get("similarartists") or {}).get("artist") or []
    if isinstance(sim, dict):
        sim = [sim]
    out: list[dict] = []
    for item in sim:
        n = (item.get("name") or "").strip()
        if not n:
            continue
        mbid = (item.get("mbid") or "").strip() or None
        out.append({"name": n, "mbid": mbid})
    return out
