from __future__ import annotations

import httpx


async def fetch_lyrics(artist: str, title: str) -> str | None:
    artist = artist.strip()
    title = title.strip()
    if not artist or not title:
        return None
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(
            f"https://api.lyrics.ovh/v1/{artist}/{title}",
        )
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
    return data.get("lyrics")
