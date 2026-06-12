"""Admin overrides for release overview metadata."""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.paths import DATA_DIR
from app.release_overview import build_release_overview, resolve_release_content

OVERRIDE_DIR = DATA_DIR / "release_overrides"


def _override_path(band_id: int, release_id: str) -> Path:
    OVERRIDE_DIR.mkdir(parents=True, exist_ok=True)
    safe_id = release_id.replace("/", "_")
    return OVERRIDE_DIR / f"{band_id}_{safe_id}.json"


def load_release_override(band_id: int, release_id: str) -> dict:
    path = _override_path(band_id, release_id)
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_release_override(
    band_id: int,
    release_id: str,
    *,
    description: str | None = None,
    producer: str | None = None,
    label: str | None = None,
    subgenres: list[str] | None = None,
) -> dict:
    path = _override_path(band_id, release_id)
    data = load_release_override(band_id, release_id)
    if description is not None:
        data["description"] = description.strip() or None
    if producer is not None:
        data["producer"] = producer.strip() or None
    if label is not None:
        data["label"] = label.strip() or None
    if subgenres is not None:
        data["subgenres"] = [s.strip() for s in subgenres if s.strip()]
    data["manual"] = True
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


def apply_release_overrides(payload: dict, band_id: int, release_id: str) -> dict:
    override = load_release_override(band_id, release_id)
    if not override:
        return payload
    if override.get("description"):
        payload["description"] = override["description"]
        payload["description_manual"] = True
        payload["description_source"] = "manual"
    if override.get("producer"):
        payload["producer"] = override["producer"]
    if override.get("label"):
        payload["label"] = override["label"]
    if override.get("subgenres"):
        payload["subgenres"] = [
            {"id": i, "name": name} for i, name in enumerate(override["subgenres"])
        ]
    return payload


def patch_release_overview(
    db: Session,
    band_id: int,
    release_id: str,
    *,
    description: str | None = None,
    producer: str | None = None,
    label: str | None = None,
    subgenres: list[str] | None = None,
) -> dict | None:
    if not resolve_release_content(db, band_id, release_id):
        return None
    save_release_override(
        band_id,
        release_id,
        description=description,
        producer=producer,
        label=label,
        subgenres=subgenres,
    )
    payload = build_release_overview(db, band_id, release_id)
    if not payload:
        return None
    return apply_release_overrides(payload, band_id, release_id)
