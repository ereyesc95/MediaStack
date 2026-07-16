"""DB-backed metadata for Video / Library folder items."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Genre, MediaItemMeta
from app.paths import DATA_DIR

# genres.genMediaTypeID — video/TV/movies vs books/print
VIDEO_GENRE_MEDIA_TYPE = 300
LIBRARY_GENRE_MEDIA_TYPE = 500

OVERRIDE_DIR = DATA_DIR / "media_item_overrides"


def genre_media_type_for_kind(kind: str) -> int:
    return VIDEO_GENRE_MEDIA_TYPE if kind == "video" else LIBRARY_GENRE_MEDIA_TYPE


def title_case_words(value: str) -> str:
    """Capitalize the first letter of each whitespace-separated word."""
    parts: list[str] = []
    for word in (value or "").split():
        if not word:
            continue
        parts.append(word[:1].upper() + word[1:])
    return " ".join(parts)


def list_genres_for_kind(db: Session, kind: str) -> list[dict]:
    media_type = genre_media_type_for_kind(kind)
    rows = db.scalars(
        select(Genre)
        .where(Genre.gen_media_type_id == media_type)
        .order_by(Genre.gen_name)
    ).all()
    return [
        {"id": g.gen_id, "name": g.gen_name}
        for g in rows
        if g.gen_name and g.gen_name.strip()
    ]


def resolve_genre_names(db: Session, kind: str, names: list[str]) -> list[str] | None:
    """Map typed names to canonical DB names; return None if any name is unknown."""
    catalog = {
        (g["name"] or "").casefold(): g["name"]
        for g in list_genres_for_kind(db, kind)
    }
    resolved: list[str] = []
    seen: set[str] = set()
    for raw in names:
        key = (raw or "").strip().casefold()
        if not key:
            continue
        canon = catalog.get(key)
        if not canon:
            return None
        low = canon.casefold()
        if low in seen:
            continue
        seen.add(low)
        resolved.append(canon)
    return resolved


def _legacy_override_path(band_id: int, kind: str, item_id: str) -> Path:
    safe_id = item_id.replace("/", "_")
    return OVERRIDE_DIR / f"{band_id}_{kind}_{safe_id}.json"


def _load_legacy_json(band_id: int, kind: str, item_id: str) -> dict:
    path = _legacy_override_path(band_id, kind, item_id)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _get_row(db: Session, band_id: int, kind: str, item_id: str) -> MediaItemMeta | None:
    return db.scalars(
        select(MediaItemMeta).where(
            MediaItemMeta.mim_band_id == band_id,
            MediaItemMeta.mim_kind == kind,
            MediaItemMeta.mim_item_id == item_id,
        )
    ).first()


def load_media_item_meta(db: Session, band_id: int, kind: str, item_id: str) -> dict:
    row = _get_row(db, band_id, kind, item_id)
    if row:
        genres = [
            g.strip()
            for g in (row.mim_genres or "").split(";")
            if g.strip()
        ]
        return {
            "description": row.mim_description,
            "director": row.mim_director,
            "author": row.mim_author,
            "publisher": row.mim_publisher,
            "genres": genres,
            "description_manual": True,
        }

    legacy = _load_legacy_json(band_id, kind, item_id)
    if not legacy:
        return {}
    raw_genres = legacy.get("genres")
    legacy_genres: list[str] | None = None
    if isinstance(raw_genres, list):
        legacy_genres = []
        for item in raw_genres:
            if not isinstance(item, str):
                continue
            legacy_genres.extend(
                p.strip() for p in item.replace(",", ";").split(";") if p.strip()
            )
    elif isinstance(raw_genres, str):
        legacy_genres = [
            p.strip() for p in raw_genres.replace(",", ";").split(";") if p.strip()
        ]
    # Keep only genres that exist for this kind when migrating
    if legacy_genres is not None:
        resolved = resolve_genre_names(db, kind, legacy_genres)
        legacy_genres = resolved if resolved is not None else []
    # One-time migrate legacy JSON → DB
    save_media_item_meta(
        db,
        band_id,
        kind,
        item_id,
        description=legacy.get("description"),
        director=legacy.get("director"),
        author=legacy.get("author"),
        publisher=legacy.get("publisher"),
        genres=legacy_genres,
        validate_genres=False,
    )
    try:
        _legacy_override_path(band_id, kind, item_id).unlink(missing_ok=True)
    except OSError:
        pass
    return load_media_item_meta(db, band_id, kind, item_id)


def save_media_item_meta(
    db: Session,
    band_id: int,
    kind: str,
    item_id: str,
    *,
    description: str | None = None,
    director: str | None = None,
    author: str | None = None,
    publisher: str | None = None,
    genres: list[str] | None = None,
    validate_genres: bool = True,
) -> MediaItemMeta | None:
    resolved_genres: list[str] | None = None
    if genres is not None:
        if validate_genres:
            resolved_genres = resolve_genre_names(db, kind, genres)
            if resolved_genres is None:
                return None
        else:
            resolved_genres = [
                title_case_words(g.strip()) for g in genres if g.strip()
            ]

    row = _get_row(db, band_id, kind, item_id)
    if not row:
        row = MediaItemMeta(
            mim_band_id=band_id,
            mim_kind=kind,
            mim_item_id=item_id,
        )
        db.add(row)

    if description is not None:
        row.mim_description = description.strip() or None
    if director is not None:
        row.mim_director = title_case_words(director.strip()) or None
    if author is not None:
        row.mim_author = title_case_words(author.strip()) or None
    if publisher is not None:
        row.mim_publisher = title_case_words(publisher.strip()) or None
    if resolved_genres is not None:
        row.mim_genres = ";".join(resolved_genres) or None

    row.mim_updated_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    db.refresh(row)
    return row


def apply_media_item_meta(
    payload: dict, db: Session, band_id: int, kind: str, item_id: str
) -> dict:
    meta = load_media_item_meta(db, band_id, kind, item_id)
    if not meta:
        return payload
    if meta.get("description"):
        payload["description"] = meta["description"]
        payload["description_manual"] = True
    if meta.get("director"):
        payload["director"] = meta["director"]
    if meta.get("author"):
        payload["author"] = meta["author"]
    if meta.get("publisher"):
        payload["publisher"] = meta["publisher"]
    if meta.get("genres"):
        payload["genres"] = list(meta["genres"])
    return payload


def patch_media_item_overview(
    db: Session,
    band_id: int,
    kind: str,
    item_id: str,
    *,
    description: str | None = None,
    director: str | None = None,
    author: str | None = None,
    publisher: str | None = None,
    genres: list[str] | None = None,
) -> dict | None:
    from app.media_item_overview import build_media_item_overview

    # Ensure item exists before writing meta
    probe = build_media_item_overview(db, band_id, kind, item_id)
    if not probe:
        return None

    saved = save_media_item_meta(
        db,
        band_id,
        kind,
        item_id,
        description=description,
        director=director,
        author=author,
        publisher=publisher,
        genres=genres,
        validate_genres=True,
    )
    if genres is not None and saved is None:
        return None
    return build_media_item_overview(db, band_id, kind, item_id)
