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
    append: str = "credits,external_ids,content_ratings,images,keywords,alternative_titles,recommendations,similar",
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


async def fetch_person_tv_credits(
    person_id: int, api_key: str
) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(
            f"{TMDB_BASE}/person/{person_id}/tv_credits",
            params={"api_key": api_key},
        )
        r.raise_for_status()
        data = r.json()
    return list(data.get("cast") or []) + list(data.get("crew") or [])


def _tv_card(item: dict[str, Any]) -> dict[str, Any] | None:
    tid = item.get("id")
    name = item.get("name") or item.get("original_name")
    if not tid or not name:
        return None
    return {
        "id": tid,
        "tmdb_id": tid,
        "title": name,
        "name": name,
        "date_iso": item.get("first_air_date"),
        "poster_url": image_url(item.get("poster_path"), "w342"),
        "cover_url": image_url(item.get("poster_path"), "w342"),
        "overview": (item.get("overview") or "")[:280] or None,
    }


def build_related_from_tv(
    data: dict[str, Any],
    *,
    creator_credits: list[dict[str, Any]] | None = None,
    self_id: int | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Build same-creator + similar series lists from TMDb payloads."""
    self_id = self_id or data.get("id")
    similar: list[dict[str, Any]] = []
    seen: set[int] = set()
    if self_id:
        seen.add(int(self_id))

    def add(bucket: list[dict[str, Any]], raw: dict[str, Any]) -> None:
        card = _tv_card(raw)
        if not card:
            return
        tid = int(card["tmdb_id"])
        if tid in seen:
            return
        seen.add(tid)
        bucket.append(card)

    for raw in (data.get("recommendations") or {}).get("results") or []:
        add(similar, raw)
    for raw in (data.get("similar") or {}).get("results") or []:
        add(similar, raw)

    creator: list[dict[str, Any]] = []
    creator_seen: set[int] = set(seen)
    for raw in creator_credits or []:
        card = _tv_card(raw)
        if not card:
            continue
        tid = int(card["tmdb_id"])
        if tid in creator_seen:
            continue
        # Skip pure acting credits; keep creator/writer/crew work
        if raw.get("character") and not raw.get("job") and not raw.get("department"):
            continue
        creator_seen.add(tid)
        creator.append(card)

    return {
        "creator": creator[:24],
        "similar": similar[:24],
    }


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

    MAIN_CAST_MAX_ORDER = 7
    MAIN_CAST_LIMIT = 8

    # Character-centered cast: one card per character, possibly multiple actors
    by_character: dict[str, dict[str, Any]] = {}
    for c in cast_raw[:40]:
        order = c.get("order")
        if isinstance(order, int) and order > MAIN_CAST_MAX_ORDER:
            continue
        char_name = (c.get("character") or "").strip() or None
        actor_name = (c.get("name") or "").strip() or None
        if not char_name and not actor_name:
            continue
        # Prefer character name as the card identity; fall back to actor
        key_name = char_name or actor_name or ""
        key = key_name.casefold()
        actor_photo = image_url(c.get("profile_path"), "w185")
        actor = {
            "id": c.get("id"),
            "name": actor_name,
            "photo_url": actor_photo,
        }
        if key not in by_character:
            by_character[key] = {
                "id": f"char-{c.get('id') or key_name}",
                "name": key_name,  # character name (display)
                "character": char_name or key_name,
                # Front: character art (filled later from local/Jikan)
                "photo_url": None,
                # Back / hover: primary actor portrait
                "actor_photo_url": actor_photo,
                "character_photo_url": actor_photo,  # legacy flip field = actor
                "actors": [actor] if actor_name else [],
                "roles": [actor_name] if actor_name else [],
                "is_deceased": False,
            }
        else:
            entry = by_character[key]
            if actor_name and not any(
                (a.get("name") or "").casefold() == actor_name.casefold()
                for a in entry["actors"]
            ):
                entry["actors"].append(actor)
                entry["roles"].append(actor_name)
            if not entry.get("actor_photo_url") and actor_photo:
                entry["actor_photo_url"] = actor_photo
                entry["character_photo_url"] = actor_photo

    characters_cast = list(by_character.values())[:MAIN_CAST_LIMIT]

    # Staff: creators + writers (people, not characters)
    people_cast: list[dict[str, Any]] = []
    for c in created_by:
        name = c.get("name")
        if not name:
            continue
        if any(p["name"] == name for p in people_cast):
            continue
        people_cast.append(
            {
                "id": c.get("id"),
                "name": name,
                "character": None,
                "photo_url": image_url(c.get("profile_path"), "w185"),
                "actor_photo_url": None,
                "character_photo_url": None,
                "actors": [],
                "roles": ["Creator"],
                "is_deceased": False,
            }
        )
    for name in writers:
        if not name or any(p["name"] == name for p in people_cast):
            continue
        people_cast.append(
            {
                "id": None,
                "name": name,
                "character": None,
                "photo_url": None,
                "actor_photo_url": None,
                "character_photo_url": None,
                "actors": [],
                "roles": ["Writer"],
                "is_deceased": False,
            }
        )
    people_cast = people_cast[:MAIN_CAST_LIMIT]

    creator_ids = [
        c.get("id") for c in created_by if isinstance(c.get("id"), int)
    ]

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
        "cast": {"animated": characters_cast, "people": people_cast, "characters": characters_cast, "staff": people_cast},
        "creator_ids": creator_ids,
        "links": links,
        "posters": [p for p in posters if p],
        "backdrops": [b for b in backdrops if b],
        "poster_url": image_url(data.get("poster_path"), "w780"),
        "backdrop_url": image_url(data.get("backdrop_path"), "w1280"),
    }
