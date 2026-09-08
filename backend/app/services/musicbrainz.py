from __future__ import annotations

import asyncio

import httpx

MB_BASE = "https://musicbrainz.org/ws/2"
DEFAULT_UA = "MyStack/1.0 (https://github.com/local/mystack)"
MB_PAGE_SIZE = 100
MB_REQUEST_DELAY = 1.1


async def _get_json_with_retries(
    endpoint: str,
    *,
    params: dict,
    user_agent: str,
    attempts: int = 5,
) -> dict:
    """GET MusicBrainz JSON, respecting its rate limit and busy responses."""
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(
                    f"{MB_BASE}/{endpoint.lstrip('/')}",
                    params={**params, "fmt": "json"},
                    headers={"User-Agent": user_agent},
                )
            if response.status_code in (429, 502, 503, 504):
                retry_after = response.headers.get("Retry-After")
                wait = float(retry_after) if retry_after else 2.0 * (attempt + 1)
                await asyncio.sleep(wait)
                continue
            response.raise_for_status()
            data = response.json()
            await asyncio.sleep(MB_REQUEST_DELAY)
            return data
        except (httpx.HTTPError, ValueError) as exc:
            if (
                isinstance(exc, httpx.HTTPStatusError)
                and 400 <= exc.response.status_code < 500
                and exc.response.status_code != 429
            ):
                raise
            last_error = exc
            if attempt + 1 < attempts:
                await asyncio.sleep(2.0 * (attempt + 1))
    if last_error:
        raise last_error
    raise RuntimeError("MusicBrainz remained unavailable after several retries")


async def count_official_release_groups(
    artist_mbid: str,
    *,
    user_agent: str = DEFAULT_UA,
) -> int:
    data = await _get_json_with_retries(
        "release-group",
        params={
            "query": f"arid:{artist_mbid} AND status:official",
            "limit": 1,
        },
        user_agent=user_agent,
    )
    return int(data.get("count") or 0)


async def browse_official_release_groups(
    artist_mbid: str,
    *,
    user_agent: str = DEFAULT_UA,
) -> list[dict]:
    """Return every release group with at least one Official release."""
    official: list[dict] = []
    offset = 0
    total: int | None = None
    while total is None or offset < total:
        data = await _get_json_with_retries(
            "release-group",
            params={
                "query": f"arid:{artist_mbid} AND status:official",
                "limit": MB_PAGE_SIZE,
                "offset": offset,
            },
            user_agent=user_agent,
        )
        page = data.get("release-groups") or []
        official.extend(page)
        total = int(data.get("count") or len(official))
        if not page:
            break
        offset += len(page)

    # Search results enforce Official status but omit release-group relations.
    # Browse the much smaller website-default set and merge those relations so
    # linked singles can still be nested under their parent albums.
    relations_by_id: dict[str, list[dict]] = {}
    offset = 0
    browse_total: int | None = None
    while browse_total is None or offset < browse_total:
        data = await _get_json_with_retries(
            "release-group",
            params={
                "artist": artist_mbid,
                "release-group-status": "website-default",
                "inc": "release-group-rels",
                "limit": MB_PAGE_SIZE,
                "offset": offset,
            },
            user_agent=user_agent,
        )
        page = data.get("release-groups") or []
        for group in page:
            if group.get("id") and group.get("relations"):
                relations_by_id[group["id"]] = group["relations"]
        browse_total = int(data.get("release-group-count") or offset + len(page))
        if not page:
            break
        offset += len(page)

    for group in official:
        group["relations"] = relations_by_id.get(group.get("id") or "", [])
    return official


async def max_official_medium_count(
    release_group_mbid: str,
    *,
    user_agent: str = DEFAULT_UA,
) -> int:
    """Largest known medium count among official releases in one release group."""
    maximum = 0
    offset = 0
    total: int | None = None
    while total is None or offset < total:
        data = await _get_json_with_retries(
            "release",
            params={
                "release-group": release_group_mbid,
                "status": "official",
                "inc": "media",
                "limit": MB_PAGE_SIZE,
                "offset": offset,
            },
            user_agent=user_agent,
        )
        page = data.get("releases") or []
        for release in page:
            media = release.get("media") or []
            maximum = max(maximum, len(media))
        total = int(data.get("release-count") or len(page))
        if not page:
            break
        offset += len(page)
    return maximum


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
    data = await _get_json_with_retries(
        "artist",
        params={"query": f'artist:"{folder_name}"', "limit": limit},
        user_agent=user_agent,
    )
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
    out.sort(
        key=lambda item: (
            str(item.get("sort_name") or item.get("name") or "").casefold()
        )
    )
    return out


async def lookup_artist(
    mbid: str, *, user_agent: str = DEFAULT_UA
) -> dict:
    """Return one artist in the same compact shape used by name search."""
    artist = await fetch_artist(mbid, user_agent=user_agent)
    return {
        "mbid": artist.get("id"),
        "name": artist.get("name"),
        "sort_name": artist.get("sort-name"),
        "type": artist.get("type"),
        "country": artist.get("country"),
        "disambiguation": artist.get("disambiguation"),
    }


async def fetch_artist(
    mbid: str,
    *,
    user_agent: str = DEFAULT_UA,
    inc: str = "aliases+tags+url-rels",
) -> dict:
    return await _get_json_with_retries(
        f"artist/{mbid}",
        params={"inc": inc},
        user_agent=user_agent,
    )


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


async def search_recordings(
    *,
    artist_mbid: str,
    title: str,
    limit: int = 5,
    user_agent: str = DEFAULT_UA,
) -> list[dict]:
    clean = title.replace('"', "").strip()
    if not clean or not artist_mbid:
        return []
    query = f'recording:"{clean}" AND arid:{artist_mbid}'
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{MB_BASE}/recording/",
            params={"query": query, "fmt": "json", "limit": limit},
            headers={"User-Agent": user_agent},
        )
        r.raise_for_status()
        data = r.json()
    out: list[dict] = []
    for rec in (data.get("recordings") or [])[:limit]:
        out.append(
            {
                "mbid": rec.get("id"),
                "title": rec.get("title"),
                "length": rec.get("length"),
            }
        )
    return out


async def fetch_recording(
    mbid: str,
    *,
    user_agent: str = DEFAULT_UA,
    inc: str = "url-rels",
) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{MB_BASE}/recording/{mbid}",
            params={"fmt": "json", "inc": inc},
            headers={"User-Agent": user_agent},
        )
        r.raise_for_status()
        return r.json()
