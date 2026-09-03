"""MusicBrainz-backed artist catalog import and local folder scaffolding."""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.artist_import_guide import get_artist_user_guide_template
from app.config import settings
from app.gallery import (
    _artist_dir,
    _display_name,
    _letter_folder,
    _resolve_child_dir,
    _safe_folder_component,
)
from app.models import ArtistType, Band, Country, Subgenre
from app.services import musicbrainz

ARTIST_FOLDERS = (
    "[Artwork]/Exclusive",
    "[Artwork]/Logos",
    "[Artwork]/Photos",
    "[Artwork]/Covers",
    "Albums",
    "Extended Plays",
    "Compilations",
    "Live Albums",
    "Soundtracks",
    "Singles",
)

CATEGORY_ORDER = (
    "Albums",
    "Extended Plays",
    "Compilations",
    "Live Albums",
    "Soundtracks",
    "Singles",
)

DISC_LOOKUP_CATEGORIES = frozenset({"Albums", "Compilations", "Live Albums"})
SKIPPED_SECONDARY_TYPES = frozenset(
    {"demo", "broadcast", "interview", "audiobook", "spokenword", "dj-mix", "mixtape/street"}
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _media_root() -> Path:
    root = Path(settings.media_root) if settings.media_root else None
    if not root or not root.is_dir():
        raise ValueError("Media root is not configured or accessible")
    return root


def _find_band_by_name(db: Session, name: str) -> Band | None:
    wanted = _display_name(name).casefold()
    if not wanted:
        return None
    return next(
        (
            band
            for band in db.scalars(select(Band)).all()
            if _display_name(band.bnd_name).casefold() == wanted
        ),
        None,
    )


def _find_band(db: Session, mbid: str, name: str) -> Band | None:
    if mbid:
        row = db.scalars(select(Band).where(Band.bnd_code == mbid)).first()
        if row:
            return row
    return _find_band_by_name(db, name)


def _allocate_local_code(db: Session) -> str:
    for _ in range(12):
        code = f"local-{uuid.uuid4()}"
        if db.scalars(select(Band).where(Band.bnd_code == code)).first() is None:
            return code
    raise ValueError("Could not allocate a unique artist id")


def _new_band(db: Session) -> Band:
    next_id = (db.scalar(select(func.max(Band.bnd_id))) or 0) + 1
    band = Band(bnd_id=next_id)
    db.add(band)
    return band


def _invalidate_band_caches(band_id: int) -> None:
    from app.band_overview_cache import invalidate_overview_cache
    from app.media_index import invalidate_media_cache
    from app.playlist_index import invalidate_playlist_cache

    invalidate_overview_cache(band_id)
    invalidate_media_cache(band_id)
    invalidate_playlist_cache(band_id)


def _member_relations(data: dict) -> list[dict]:
    return [
        relation
        for relation in data.get("relations") or []
        if "member" in (relation.get("type") or "").casefold()
        and (relation.get("artist") or {}).get("id")
    ]


def _current_member_count(data: dict) -> int:
    members = {
        (relation.get("artist") or {}).get("id")
        for relation in _member_relations(data)
        if not relation.get("end") and relation.get("ended") is not True
    }
    return len(members)


def _artist_type_id(db: Session, data: dict) -> int | None:
    entity_type = (data.get("type") or "").casefold()
    if entity_type == "person":
        target = "solo"
    elif entity_type == "group":
        count = _current_member_count(data)
        if count <= 1:
            return None
        target = {
            2: "duo",
            3: "trio",
            4: "quartet",
            5: "quintet",
            6: "sixtet",
            7: "septet",
            8: "octet",
            9: "nonet",
            10: "dectet",
        }.get(count, "10+")
    else:
        return None
    return db.scalar(
        select(ArtistType.aty_id).where(func.lower(ArtistType.aty_name) == target)
    )


def _country_id(db: Session, data: dict) -> int | None:
    iso = (data.get("country") or "").strip().casefold()
    if not iso:
        codes = (data.get("area") or {}).get("iso-3166-1-codes") or []
        iso = (codes[0] if codes else "").strip().casefold()
    if not iso:
        return None
    return db.scalar(
        select(Country.cou_id).where(func.lower(Country.cou_iso) == iso)
    )


def _subgenre_ids(db: Session, data: dict) -> list[int]:
    wanted = {
        (tag.get("name") or "").strip().casefold()
        for tag in data.get("tags") or []
        if (tag.get("name") or "").strip()
    }
    if not wanted:
        return []
    return [
        row.sgn_id
        for row in db.scalars(select(Subgenre)).all()
        if (row.sgn_name or "").strip().casefold() in wanted
    ]


def _populate_band_metadata(db: Session, band: Band, data: dict) -> None:
    name = (data.get("name") or band.bnd_name or "Unknown").strip()
    aliases = ";".join(
        alias.get("name", "").strip()
        for alias in data.get("aliases") or []
        if alias.get("name", "").strip()
    )
    life = data.get("life-span") or {}
    origin = data.get("begin-area") or data.get("area") or {}

    band.bnd_name = name
    band.bnd_code = data.get("id") or band.bnd_code
    band.bnd_other_names = aliases or band.bnd_other_names
    band.bnd_origin_place = (origin.get("name") or "").strip() or band.bnd_origin_place
    country_id = _country_id(db, data)
    if country_id:
        band.bnd_fk_countries = str(country_id)
    band.bnd_starting_dates = life.get("begin") or band.bnd_starting_dates
    if life.get("end"):
        band.bnd_ending_dates = life["end"]
    elif life.get("ended") is False:
        band.bnd_ending_dates = None

    artist_type_id = _artist_type_id(db, data)
    if artist_type_id:
        band.bnd_fk_artisttypes = str(artist_type_id)
    subgenre_ids = _subgenre_ids(db, data)
    if subgenre_ids:
        band.bnd_fk_subgenres = ";".join(str(value) for value in subgenre_ids)

    annotation = (data.get("annotation") or "").strip()
    if annotation and not band.bnd_bio_manual:
        band.bnd_fk_images = annotation.replace(".", "■")
        band.bnd_bio_source = "musicbrainz"
        band.bnd_bio_manual = 0
    band.bnd_metadata_refreshed_at = _now()


def _release_category(group: dict) -> str | None:
    primary = (group.get("primary-type") or "").strip().casefold()
    secondary = {
        str(value).strip().casefold()
        for value in group.get("secondary-types") or []
    }
    if secondary & SKIPPED_SECONDARY_TYPES:
        return None
    if "soundtrack" in secondary:
        return "Soundtracks"
    if "live" in secondary:
        return "Live Albums"
    if secondary & {"compilation", "remix"}:
        return "Compilations"
    if primary == "album":
        return "Albums"
    if primary == "ep":
        return "Extended Plays"
    if primary == "single":
        return "Singles"
    return None


def _dated_title(date: str | None, title: str | None) -> str:
    safe_title = _safe_folder_component(title or "Untitled")
    clean_date = (date or "").strip().replace("-", ".")
    return f"{clean_date}. {safe_title}" if clean_date else safe_title


def _single_parent(group: dict) -> dict | None:
    for relation in group.get("relations") or []:
        if (relation.get("type") or "").casefold() != "single":
            continue
        if (relation.get("direction") or "").casefold() != "forward":
            continue
        linked = relation.get("release-group") or {}
        # Nested relationship targets do not always repeat primary-type, but
        # the forward "single" relation specifically points from a single/EP
        # to the album it was taken from.
        if linked.get("id") and linked.get("title"):
            return linked
    return None


async def _prepare_release_groups(mbid: str) -> list[dict]:
    groups = await musicbrainz.browse_official_release_groups(
        mbid,
        user_agent=settings.musicbrainz_user_agent,
    )
    prepared: list[dict] = []
    for group in groups:
        category = _release_category(group)
        if not category:
            continue
        item = dict(group)
        item["_category"] = category
        item["_medium_count"] = 0
        prepared.append(item)

    prepared.sort(
        key=lambda group: (
            CATEGORY_ORDER.index(group["_category"]),
            group.get("first-release-date") or "9999",
            (group.get("title") or "").casefold(),
        )
    )
    for group in prepared:
        if group["_category"] not in DISC_LOOKUP_CATEGORIES:
            continue
        group["_medium_count"] = await musicbrainz.max_official_medium_count(
            group.get("id") or "",
            user_agent=settings.musicbrainz_user_agent,
        )
    return prepared


def _create_artist_tree(
    db: Session,
    root: Path,
    artist_name: str,
    groups: list[dict],
    *,
    write_user_guide: bool,
) -> tuple[Path, int]:
    music_dir = _resolve_child_dir(root, "Music")
    artist_dir = music_dir / _letter_folder(artist_name) / _safe_folder_component(artist_name)
    for relative in ARTIST_FOLDERS:
        (artist_dir / Path(relative)).mkdir(parents=True, exist_ok=True)

    used_paths: dict[str, str] = {}
    releases_created = 0
    for group in groups:
        category = group["_category"]
        release_name = _dated_title(group.get("first-release-date"), group.get("title"))
        release_parent = artist_dir / category
        if category == "Singles":
            parent = _single_parent(group)
            if parent:
                release_parent /= _dated_title(
                    parent.get("first-release-date"), parent.get("title")
                )
        release_dir = release_parent / release_name
        collision_key = str(release_dir).casefold()
        group_id = group.get("id") or ""
        if collision_key in used_paths and used_paths[collision_key] != group_id:
            release_dir = release_parent / f"{release_name} [MBID {group_id[:8]}]"
            collision_key = str(release_dir).casefold()
        used_paths[collision_key] = group_id

        (release_dir / "[Artwork]").mkdir(parents=True, exist_ok=True)
        medium_count = int(group.get("_medium_count") or 0)
        if medium_count > 1:
            width = max(2, len(str(medium_count)))
            for position in range(1, medium_count + 1):
                label = str(position).zfill(width)
                (release_dir / f"{label}. Disc {label}").mkdir(exist_ok=True)
        releases_created += 1

    if write_user_guide:
        (artist_dir / "User guide.txt").write_text(
            get_artist_user_guide_template(db),
            encoding="utf-8",
        )
    return artist_dir, releases_created


def _format_duration(seconds: int) -> str:
    if seconds < 60:
        return "less than a minute"
    minutes = max(1, round(seconds / 60))
    if minutes == 1:
        return "about 1 minute"
    return f"about {minutes} minutes"


async def estimate_import(db: Session, mbid: str) -> dict:
    root = _media_root()
    known = db.scalars(select(Band).where(Band.bnd_code == mbid)).first()
    known_folder = _artist_dir(root, known.bnd_name) if known else None
    if known and known_folder:
        return {
            "name": _display_name(known.bnd_name),
            "release_group_count": 0,
            "member_count": 0,
            "estimated_seconds": 0,
            "estimated_label": "Already available locally",
            "local_folder_exists": True,
            "catalog_exists": True,
        }

    data = await musicbrainz.fetch_artist_with_members(
        mbid,
        user_agent=settings.musicbrainz_user_agent,
    )
    name = (data.get("name") or "Unknown").strip()
    band = _find_band(db, mbid, name)
    local_folder = _artist_dir(root, band.bnd_name if band else name)
    member_count = len(_member_relations(data))

    if band and local_folder:
        return {
            "name": name,
            "release_group_count": 0,
            "member_count": member_count,
            "estimated_seconds": 0,
            "estimated_label": "Already available locally",
            "local_folder_exists": True,
            "catalog_exists": True,
        }

    release_group_count = 0
    if not local_folder and name.casefold() != "various artists":
        release_group_count = await musicbrainz.count_official_release_groups(
            mbid,
            user_agent=settings.musicbrainz_user_agent,
        )
    seconds = max(
        15,
        int(
            12
            + math.ceil(release_group_count / 100) * 2
            + release_group_count * 0.6
            + member_count * 1.3
        ),
    )
    return {
        "name": name,
        "release_group_count": release_group_count,
        "member_count": member_count,
        "estimated_seconds": seconds,
        "estimated_label": _format_duration(seconds),
        "local_folder_exists": bool(local_folder),
        "catalog_exists": bool(band),
    }


async def import_artist(
    db: Session,
    mbid: str,
    *,
    write_user_guide: bool,
) -> dict:
    root = _media_root()
    known = db.scalars(select(Band).where(Band.bnd_code == mbid)).first()
    known_folder = _artist_dir(root, known.bnd_name) if known else None
    if known and known_folder:
        name = _display_name(known.bnd_name)
        return {
            "id": known.bnd_id,
            "code": known.bnd_code,
            "name": known.bnd_name,
            "existing": True,
            "local_status": "existing",
            "releases_created": 0,
            "message": f"{name} already exists locally. No files or catalog data were changed.",
        }

    data = await musicbrainz.fetch_artist_with_members(
        mbid,
        user_agent=settings.musicbrainz_user_agent,
    )
    name = (data.get("name") or "Unknown").strip()
    band = _find_band(db, mbid, name)
    local_folder = _artist_dir(root, band.bnd_name if band else name)

    if band and local_folder:
        return {
            "id": band.bnd_id,
            "code": band.bnd_code,
            "name": band.bnd_name,
            "existing": True,
            "local_status": "existing",
            "releases_created": 0,
            "message": f"{name} already exists locally. No files or catalog data were changed.",
        }

    groups: list[dict] = []
    if not local_folder and name.casefold() != "various artists":
        groups = await _prepare_release_groups(mbid)

    created_catalog = band is None
    if band is None:
        band = _new_band(db)
    _populate_band_metadata(db, band, data)
    db.commit()
    db.refresh(band)

    warnings: list[str] = []
    try:
        from app.band_lineup_import import import_band_lineup

        lineup = await import_band_lineup(db, band, replace_non_manual=True)
        if not lineup.get("ok"):
            warnings.append(f"Lineup import: {lineup.get('error') or 'unavailable'}")
    except Exception as exc:
        warnings.append(f"Lineup import: {exc}")

    try:
        from app.entity_links import refresh_band_links_merge

        links = await refresh_band_links_merge(db, band)
        if not links.get("ok"):
            warnings.append(f"External links: {links.get('error') or 'unavailable'}")
    except Exception as exc:
        warnings.append(f"External links: {exc}")

    releases_created = 0
    local_status = "existing"
    if not local_folder:
        # Recheck immediately before writing in case another import created it.
        local_folder = _artist_dir(root, name)
    if not local_folder:
        local_folder, releases_created = _create_artist_tree(
            db,
            root,
            name,
            groups,
            write_user_guide=write_user_guide,
        )
        local_status = "created"

    _invalidate_band_caches(band.bnd_id)

    if local_status == "existing":
        catalog_action = "created" if created_catalog else "updated"
        message = (
            f"{name}'s local folder already existed. The catalog was "
            f"{catalog_action} from MusicBrainz; local files were not changed."
        )
    else:
        message = (
            f"{name} was added with {releases_created} release folder"
            f"{'' if releases_created == 1 else 's'}."
        )
    return {
        "id": band.bnd_id,
        "code": band.bnd_code,
        "name": band.bnd_name,
        "existing": not created_catalog,
        "local_status": local_status,
        "releases_created": releases_created,
        "warnings": warnings,
        "message": message,
    }


def import_unregistered_artist(
    db: Session,
    name: str,
    *,
    write_user_guide: bool = False,
) -> dict:
    """Create a catalog row and empty artist folders without MusicBrainz."""
    artist_name = _display_name(name).strip()
    if not artist_name:
        raise ValueError("Artist name is required")

    root = _media_root()
    band = _find_band_by_name(db, artist_name)
    local_folder = _artist_dir(root, band.bnd_name if band else artist_name)
    if band and local_folder:
        return {
            "id": band.bnd_id,
            "code": band.bnd_code,
            "name": band.bnd_name,
            "existing": True,
            "local_status": "existing",
            "releases_created": 0,
            "message": (
                f"{artist_name} already exists locally. "
                "No files or catalog data were changed."
            ),
        }

    created_catalog = band is None
    if band is None:
        band = _new_band(db)
        band.bnd_name = artist_name
        band.bnd_code = _allocate_local_code(db)
        band.bnd_metadata_refreshed_at = _now()
    elif not (band.bnd_code or "").strip():
        band.bnd_code = _allocate_local_code(db)
        band.bnd_name = artist_name or band.bnd_name
    db.commit()
    db.refresh(band)

    releases_created = 0
    local_status = "existing"
    if not local_folder:
        local_folder = _artist_dir(root, artist_name)
    if not local_folder:
        local_folder, releases_created = _create_artist_tree(
            db,
            root,
            artist_name,
            [],
            write_user_guide=write_user_guide,
        )
        local_status = "created"

    _invalidate_band_caches(band.bnd_id)

    if local_status == "existing":
        catalog_action = "created" if created_catalog else "updated"
        message = (
            f"{artist_name}'s local folder already existed. The catalog was "
            f"{catalog_action}; local files were not changed."
        )
    else:
        message = f"{artist_name} was added without a MusicBrainz registration."
    return {
        "id": band.bnd_id,
        "code": band.bnd_code,
        "name": band.bnd_name,
        "existing": not created_catalog,
        "local_status": local_status,
        "releases_created": releases_created,
        "warnings": [],
        "message": message,
    }
