"""Admin overrides for Video / Library item overview metadata."""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.media_item_overview import build_media_item_overview, patch_media_item_description
from app.paths import DATA_DIR

OVERRIDE_DIR = DATA_DIR / "media_item_overrides"


def _override_path(band_id: int, kind: str, item_id: str) -> Path:
    OVERRIDE_DIR.mkdir(parents=True, exist_ok=True)
    safe_id = item_id.replace("/", "_")
    return OVERRIDE_DIR / f"{band_id}_{kind}_{safe_id}.json"


def load_media_item_override(band_id: int, kind: str, item_id: str) -> dict:
    path = _override_path(band_id, kind, item_id)
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_media_item_override(
    band_id: int,
    kind: str,
    item_id: str,
    *,
    description: str | None = None,
    director: str | None = None,
    author: str | None = None,
    publisher: str | None = None,
    genres: list[str] | None = None,
) -> dict:
    path = _override_path(band_id, kind, item_id)
    data = load_media_item_override(band_id, kind, item_id)
    if description is not None:
        data["description"] = description.strip() or None
    if director is not None:
        data["director"] = director.strip() or None
    if author is not None:
        data["author"] = author.strip() or None
    if publisher is not None:
        data["publisher"] = publisher.strip() or None
    if genres is not None:
        data["genres"] = [s.strip() for s in genres if s.strip()]
    data["manual"] = True
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


def apply_media_item_overrides(
    payload: dict, band_id: int, kind: str, item_id: str
) -> dict:
    override = load_media_item_override(band_id, kind, item_id)
    if not override:
        return payload
    if override.get("description"):
        payload["description"] = override["description"]
        payload["description_manual"] = True
    if override.get("director"):
        payload["director"] = override["director"]
    if override.get("author"):
        payload["author"] = override["author"]
    if override.get("publisher"):
        payload["publisher"] = override["publisher"]
    if override.get("genres"):
        payload["genres"] = list(override["genres"])
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
    if description is not None:
        written = patch_media_item_description(
            db, band_id, kind, item_id, description
        )
        if not written:
            return None

    save_media_item_override(
        band_id,
        kind,
        item_id,
        description=description,
        director=director,
        author=author,
        publisher=publisher,
        genres=genres,
    )
    payload = build_media_item_overview(db, band_id, kind, item_id)
    if not payload:
        return None
    return payload
