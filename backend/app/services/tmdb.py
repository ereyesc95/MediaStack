"""TMDb API helpers for TV / series metadata."""
from __future__ import annotations

from typing import Any

import httpx

TMDB_BASE = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p"


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


async def fetch_tv(
    tv_id: int | str,
    api_key: str,
    *,
    append: str = "credits,external_ids,content_ratings,images,keywords,alternative_titles",
) -> dict[str, Any]:
    """Fetch TV series details with optional appended resources."""
    async with httpx.AsyncClient(timeout=45.0) as client:
        r = await client.get(
            f"{TMDB_BASE}/tv/{tv_id}",
            params={
                "api_key": api_key,
                "append_to_response": append,
                "include_image_language": "en,null",
            },
        )
        r.raise_for_status()
        return r.json()


def image_url(path: str | None, size: str = "w780") -> str | None:
    if not path:
        return None
    if path.startswith("http://") or path.startswith("https://"):
        return path
    return f"{TMDB_IMAGE_BASE}/{size}{path}"


def normalize_tv_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Flatten TMDb TV payload into MediaStack series overview fields."""
    genres = [
        {"id": g.get("id"), "name": g.get("name")}
        for g in (data.get("genres") or [])
        if g.get("name")
    ]
    networks = [
        n.get("name")
        for n in (data.get("networks") or [])
        if n.get("name")
    ]
    companies = [
        c.get("name")
        for c in (data.get("production_companies") or [])
        if c.get("name")
    ]
    publishers = list(dict.fromkeys([*networks, *companies]))

    created_by = data.get("created_by") or []
    writers = [c.get("name") for c in created_by if c.get("name")]

    credits = data.get("credits") or {}
    cast_raw = credits.get("cast") or []
    crew_raw = credits.get("crew") or []

    # Also pull writers from crew
    for c in crew_raw:
        job = (c.get("job") or "").casefold()
        dept = (c.get("department") or "").casefold()
        name = c.get("name")
        if not name:
            continue
        if job in {"writer", "story", "screenplay", "creator"} or (
            dept == "writing" and name not in writers
        ):
            if name not in writers:
                writers.append(name)

    genre_names = {g["name"].casefold() for g in genres}
    is_animated = "animation" in genre_names or any(
        "anim" in (data.get("type") or "").casefold() for _ in (0,)
    )

    def cast_member(c: dict[str, Any], *, limit_order: int | None = None) -> dict[str, Any] | None:
        name = c.get("name")
        if not name:
            return None
        order = c.get("order")
        if limit_order is not None and isinstance(order, int) and order > limit_order:
            return None
        return {
            "id": c.get("id"),
            "name": name,
            "character": c.get("character") or None,
            "photo_url": image_url(c.get("profile_path"), "w185"),
            "roles": [c["character"]] if c.get("character") else [],
            "is_deceased": False,
        }

    # Main cast only (TMDb order 0–7) to avoid overlapping lineup photos
    MAIN_CAST_MAX_ORDER = 7
    MAIN_CAST_LIMIT = 8
    animated_cast: list[dict[str, Any]] = []
    people_cast: list[dict[str, Any]] = []
    for c in cast_raw[:40]:
        member = cast_member(c, limit_order=MAIN_CAST_MAX_ORDER)
        if not member:
            continue
        if is_animated:
            animated_cast.append(member)
        else:
            people_cast.append(member)
    animated_cast = animated_cast[:MAIN_CAST_LIMIT]
    people_cast = people_cast[:MAIN_CAST_LIMIT]

    # Creators always appear under People
    for c in created_by:
        name = c.get("name")
        if not name:
            continue
        if any(p["name"] == name for p in people_cast):
            continue
        people_cast.insert(
            0,
            {
                "id": c.get("id"),
                "name": name,
                "character": None,
                "photo_url": image_url(c.get("profile_path"), "w185"),
                "roles": ["Creator"],
                "is_deceased": False,
            },
        )

    if is_animated and not people_cast:
        # Still expose creators/writers as people for animated shows
        for name in writers[:8]:
            if any(p["name"] == name for p in people_cast):
                continue
            people_cast.append(
                {
                    "id": None,
                    "name": name,
                    "character": None,
                    "photo_url": None,
                    "roles": ["Writer"],
                    "is_deceased": False,
                }
            )

    people_cast = people_cast[:MAIN_CAST_LIMIT]

    if not is_animated and not animated_cast:
        # Live-action: keep animated tab empty; people has cast
        pass

    external = data.get("external_ids") or {}
    links: list[dict[str, str]] = []
    homepage = (data.get("homepage") or "").strip()
    if homepage:
        links.append({"label": "Official", "url": homepage, "category": "social"})
    if external.get("imdb_id"):
        links.append(
            {
                "label": "IMDb",
                "url": f"https://www.imdb.com/title/{external['imdb_id']}/",
                "category": "databases",
            }
        )
    if external.get("tvdb_id"):
        links.append(
            {
                "label": "TVDB",
                "url": f"https://thetvdb.com/?tab=series&id={external['tvdb_id']}",
                "category": "databases",
            }
        )
    # TMDb itself
    if data.get("id"):
        links.append(
            {
                "label": "TMDb",
                "url": f"https://www.themoviedb.org/tv/{data['id']}",
                "category": "databases",
            }
        )

    images = data.get("images") or {}
    posters = [
        image_url(p.get("file_path"), "w780")
        for p in (images.get("posters") or [])[:12]
        if p.get("file_path")
    ]
    backdrops = [
        image_url(b.get("file_path"), "w1280")
        for b in (images.get("backdrops") or [])[:12]
        if b.get("file_path")
    ]
    if data.get("poster_path"):
        primary = image_url(data["poster_path"], "w780")
        if primary and primary not in posters:
            posters.insert(0, primary)
    if data.get("backdrop_path"):
        primary_bd = image_url(data["backdrop_path"], "w1280")
        if primary_bd and primary_bd not in backdrops:
            backdrops.insert(0, primary_bd)

    origin_countries = data.get("origin_country") or []
    origin_place = None
    if data.get("production_countries"):
        origin_place = ", ".join(
            c.get("name") for c in data["production_countries"] if c.get("name")
        )
    elif origin_countries:
        origin_place = ", ".join(origin_countries)

    aliases = [
        (a.get("title") or a.get("name") or "")
        for a in (data.get("alternative_titles", {}).get("results") or [])
        if isinstance(a, dict)
    ]
    aliases = [a for a in aliases if a]
    # Also original_name if different
    if data.get("original_name") and data.get("original_name") != data.get("name"):
        aliases.insert(0, data["original_name"])

    return {
        "tmdb_id": data.get("id"),
        "name": data.get("name") or data.get("original_name"),
        "overview": (data.get("overview") or "").strip() or None,
        "status": data.get("status"),
        "type": data.get("type"),
        "is_animated": is_animated,
        "first_air_date": data.get("first_air_date"),
        "last_air_date": data.get("last_air_date"),
        "genres": genres,
        "writers": writers,
        "publishers": publishers,
        "origin_place": origin_place,
        "origin_countries": origin_countries,
        "aliases": [a for a in aliases if a],
        "cast": {"animated": animated_cast, "people": people_cast},
        "links": links,
        "posters": [p for p in posters if p],
        "backdrops": [b for b in backdrops if b],
        "poster_url": image_url(data.get("poster_path"), "w780"),
        "backdrop_url": image_url(data.get("backdrop_path"), "w1280"),
    }
