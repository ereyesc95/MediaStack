"""Resolve member photos: local override, cached URL, MusicBrainz/Wikimedia."""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.gallery import _media_url
from app.models import Artist
from app.paths import DATA_DIR, people_dir
from app.user_settings import get_member_photo_refresh_days

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
HTTP_TIMEOUT = 15.0
FETCH_CONCURRENCY = 2
FETCH_DELAY = 0.35

_WIKIDATA_ID_RE = re.compile(r"(Q\d+)", re.I)
_COMMONS_FILE_RE = re.compile(r"/wiki/File:(.+)$", re.I)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _headers() -> dict[str, str]:
    return {"User-Agent": settings.musicbrainz_user_agent}


def _parse_urls_json(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _display_name(name: str | None) -> str:
    if not name:
        return "Unknown"
    return name.replace("■", ",").replace("█", "'").strip()


def _name_slug(name: str) -> str:
    s = name.lower()
    s = re.sub(r"[^\w\s-]", "", s.replace("'", "").replace(".", ""))
    s = re.sub(r"[\s_]+", "-", s.strip())
    return (s[:60] or "unknown").strip("-")


def photo_file_stem(artist: Artist) -> str:
    """Local filename stem: `{Display Name} ({mbid-or-id})`."""
    name = _display_name(artist.art_stage_name or artist.art_name)
    code = (artist.art_code or str(artist.art_id) or "unknown").strip()
    return f"{name} ({code})"


_PAREN_ID_RE = re.compile(r"^(?P<name>.+?)\s*\((?P<code>[^)]+)\)\s*$")


def _stem_matches_person(
    stem: str,
    *,
    display_name: str,
    name_slug: str,
    name_key: str,
    id_stems: list[str],
) -> str | None:
    """Return match quality: 'id' | 'exact' | 'name' | None."""
    stem_cf = stem.casefold().strip()
    name_cf = display_name.casefold().strip()
    stem_key = re.sub(r"[^a-z0-9]+", "", stem_cf)

    # Preferred: Name (mbid-or-id)
    m = _PAREN_ID_RE.match(stem.strip())
    if m:
        base = m.group("name").strip().casefold()
        code = m.group("code").strip().casefold()
        if id_stems and code in {s.casefold() for s in id_stems}:
            return "id"
        if base == name_cf or re.sub(r"[^a-z0-9]+", "", base) == name_key:
            if id_stems and any(s.casefold() == code for s in id_stems):
                return "id"
            return "exact"

    # Legacy: name-slug--id
    if name_slug and (
        stem_cf == name_slug
        or stem_cf.startswith(f"{name_slug}--")
        or any(stem_cf.endswith(f"--{s.casefold()}") for s in id_stems)
    ):
        if id_stems and any(s.casefold() in stem_cf for s in id_stems):
            return "id"
        if stem_cf == name_slug or stem_cf.startswith(f"{name_slug}--"):
            return "exact"

    if stem_cf == name_cf or stem_key == name_key:
        return "exact"
    if id_stems and any(s.casefold() in stem_cf for s in id_stems):
        return "id"
    if name_key and name_key in stem_key:
        return "name"
    return None


def _data_file_url(path: Path) -> str:
    from app.paths import ASSETS_DIR, DATA_DIR

    for root in (ASSETS_DIR, DATA_DIR):
        try:
            rel = path.relative_to(root).as_posix()
            # Always expose as people/… or links/… under /api/data/file
            return f"/api/data/file?path={quote(rel, safe='/')}"
        except ValueError:
            continue
    return f"/api/data/file?path={quote(path.name, safe='/')}"


def _path_from_media_url(url: str, media_root: Path) -> Path | None:
    if not url.startswith("/api/media/file?"):
        return None
    from urllib.parse import parse_qs, urlparse

    rel = parse_qs(urlparse(url).query).get("path", [None])[0]
    if not rel:
        return None
    path = media_root / rel
    return path if path.is_file() else None


def _path_from_data_url(url: str) -> Path | None:
    if not url.startswith("/api/data/file?"):
        return None
    from urllib.parse import parse_qs, urlparse

    from app.paths import ASSETS_DIR, DATA_DIR

    rel = parse_qs(urlparse(url).query).get("path", [None])[0]
    if not rel:
        return None
    for root in (ASSETS_DIR, DATA_DIR):
        path = root / rel
        if path.is_file():
            return path
    return None


def member_photo_url(artist: Artist, media_root: Path | None) -> str | None:
    """Resolved photo URL; omits stale local paths when the file was removed."""
    local = _local_people_photo(artist, media_root)
    if local:
        return local

    stored = (artist.art_photo_url or "").strip()
    if not stored:
        return None

    if stored.startswith("/api/data/file?"):
        return stored if _path_from_data_url(stored) else None

    if stored.startswith("/api/media/file?"):
        if media_root and media_root.is_dir() and _path_from_media_url(stored, media_root):
            return stored
        return None

    if stored.startswith("http://") or stored.startswith("https://"):
        return stored

    return None if artist.art_photo_manual else stored


def _local_people_photo(artist: Artist, media_root: Path | None) -> str | None:
    if not artist.art_code and not artist.art_id and not (
        artist.art_stage_name or artist.art_name
    ):
        return None
    name = _display_name(artist.art_stage_name or artist.art_name)
    letter = name[0].upper() if name and name[0].isalpha() else "#"
    bases: list[tuple[Path, str]] = [(people_dir() / letter, "data")]
    if media_root and media_root.is_dir():
        # Legacy locations under Media (pre-migration)
        bases.extend(
            [
                (media_root / "People" / letter, "media"),
                (media_root / "Music" / "People" / letter, "media"),
            ]
        )
    stems = []
    if artist.art_code:
        stems.append(artist.art_code.lower())
    if artist.art_id:
        stems.append(str(artist.art_id))
    name_slug = _name_slug(name)
    name_key = re.sub(r"[^a-z0-9]+", "", name.casefold())
    for base, kind in bases:
        if not base.is_dir():
            continue
        by_id: Path | None = None
        by_exact: Path | None = None
        by_name: Path | None = None
        for p in base.iterdir():
            if p.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
                continue
            quality = _stem_matches_person(
                p.stem,
                display_name=name,
                name_slug=name_slug,
                name_key=name_key,
                id_stems=stems,
            )
            if quality == "id":
                by_id = p
                break
            if quality == "exact":
                by_exact = by_exact or p
            elif quality == "name":
                by_name = by_name or p
        hit = by_id or by_exact or by_name
        if hit:
            if kind == "data":
                return _data_file_url(hit)
            if media_root:
                return _media_url(hit, media_root)
    return None


def _photo_stale(artist: Artist) -> bool:
    if not artist.art_photo_fetched_at:
        return True
    try:
        fetched = datetime.fromisoformat(artist.art_photo_fetched_at.replace("Z", "+00:00"))
    except ValueError:
        return True
    age_days = (datetime.now(timezone.utc) - fetched).days
    return age_days >= get_member_photo_refresh_days()


def _commons_file_title_from_url(url: str) -> str | None:
    parsed = urlparse(url)
    host = (parsed.netloc or "").lower()
    if "commons.wikimedia.org" not in host and "upload.wikimedia.org" not in host:
        return None
    path = unquote(parsed.path or "")
    match = _COMMONS_FILE_RE.search(path)
    if match:
        return f"File:{match.group(1)}"
    if "/wikipedia/commons/" in path:
        filename = path.rsplit("/", 1)[-1]
        if filename:
            return f"File:{filename}"
    return None


def _commons_direct_thumb(wiki_url: str, *, width: int = 320) -> str | None:
    """Build a Commons thumbnail URL without calling the Wikimedia API."""
    title = _commons_file_title_from_url(wiki_url)
    if not title:
        return None
    filename = title[5:]  # strip "File:"
    encoded = quote(filename.replace(" ", "_"), safe="._()-")
    return (
        f"https://commons.wikimedia.org/wiki/Special:FilePath/{encoded}"
        f"?width={width}"
    )


async def _wikidata_entity_image(
    client: httpx.AsyncClient, wikidata_url: str
) -> str | None:
    match = _WIKIDATA_ID_RE.search(wikidata_url)
    if not match:
        return None
    entity_id = match.group(1).upper()
    r = await client.get(
        WIKIDATA_API,
        params={
            "action": "wbgetentities",
            "ids": entity_id,
            "props": "claims",
            "format": "json",
        },
        headers=_headers(),
    )
    if r.status_code != 200:
        return None
    try:
        entity = (r.json().get("entities") or {}).get(entity_id) or {}
        claims = entity.get("claims") or {}
        p18 = claims.get("P18") or []
        filename = p18[0]["mainsnak"]["datavalue"]["value"]
    except (json.JSONDecodeError, KeyError, TypeError, IndexError):
        return None
    return _commons_direct_thumb(f"https://commons.wikimedia.org/wiki/File:{filename}")


async def _musicbrainz_image_urls(mbid: str) -> list[str]:
    from app.services.musicbrainz import fetch_artist

    data = await fetch_artist(mbid, inc="url-rels", user_agent=settings.musicbrainz_user_agent)
    urls: list[str] = []
    for rel in data.get("relations") or []:
        if (rel.get("type") or "").lower() != "image":
            continue
        url = (rel.get("url") or {}).get("resource")
        if url:
            urls.append(url)
    return urls


async def _resolve_remote_photo(artist: Artist) -> tuple[str | None, str | None]:
    """Return (photo_url, source_label)."""
    stored = _parse_urls_json(artist.art_external_urls)

    if stored.get("image"):
        url = _commons_direct_thumb(stored["image"])
        if url:
            return url, "musicbrainz"

    if artist.art_code:
        for wiki_url in await _musicbrainz_image_urls(artist.art_code):
            url = _commons_direct_thumb(wiki_url)
            if url:
                return url, "musicbrainz"
            await asyncio.sleep(FETCH_DELAY)

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        if stored.get("wikidata"):
            url = await _wikidata_entity_image(client, stored["wikidata"])
            if url:
                return url, "wikidata"

    return None, None


async def resolve_artist_photo_url(
    db: Session,
    artist: Artist,
    *,
    media_root: Path | None,
    force: bool = False,
) -> str | None:
    if media_root and media_root.is_dir():
        local = _local_people_photo(artist, media_root)
        if local and (artist.art_photo_manual or not artist.art_photo_url):
            return local

    if (
        artist.art_photo_url
        and not force
        and not _photo_stale(artist)
        and not artist.art_photo_manual
    ):
        return member_photo_url(artist, media_root)

    if artist.art_photo_manual:
        return member_photo_url(artist, media_root)

    try:
        url, source = await _resolve_remote_photo(artist)
    except Exception:
        url, source = None, None

    if url:
        artist.art_photo_url = url
        artist.art_photo_source = source
        artist.art_photo_fetched_at = _now()
        db.commit()

    return artist.art_photo_url


async def refresh_band_member_photos(
    db: Session,
    artist_ids: set[int],
    *,
    media_root: Path | None,
    force: bool = False,
) -> int:
    """Refresh photos for many members."""
    artists = [a for aid in artist_ids if (a := db.get(Artist, aid))]
    to_fetch: list[Artist] = []
    resolved = 0
    changed = False

    for artist in artists:
        if media_root and media_root.is_dir():
            local = _local_people_photo(artist, media_root)
            if local and (artist.art_photo_manual or not artist.art_photo_url):
                artist.art_photo_url = local
                artist.art_photo_source = "local"
                changed = True
                resolved += 1
                continue

        if (
            artist.art_photo_url
            and not force
            and not _photo_stale(artist)
            and not artist.art_photo_manual
        ):
            resolved += 1
            continue

        if not artist.art_photo_manual:
            to_fetch.append(artist)
        elif member_photo_url(artist, media_root):
            resolved += 1
        elif artist.art_photo_url:
            artist.art_photo_url = None
            artist.art_photo_source = None
            changed = True

    sem = asyncio.Semaphore(FETCH_CONCURRENCY)

    async def _fetch(artist: Artist) -> tuple[Artist, str | None, str | None]:
        async with sem:
            try:
                url, source = await _resolve_remote_photo(artist)
                return artist, url, source
            except Exception:
                return artist, None, None

    if to_fetch:
        for artist, url, source in await asyncio.gather(*[_fetch(a) for a in to_fetch]):
            if url:
                artist.art_photo_url = url
                artist.art_photo_source = source
                artist.art_photo_fetched_at = _now()
                changed = True
                resolved += 1
            elif artist.art_photo_url:
                resolved += 1

    if changed:
        db.commit()

    return resolved
