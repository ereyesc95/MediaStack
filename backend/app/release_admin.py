"""Admin overrides for release overview metadata."""
from __future__ import annotations

import json
import uuid
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


def _write_override(band_id: int, release_id: str, data: dict) -> dict:
    path = _override_path(band_id, release_id)
    data["manual"] = True
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


def save_release_override(
    band_id: int,
    release_id: str,
    *,
    description: str | None = None,
    producer: str | None = None,
    label: str | None = None,
    subgenres: list[str] | None = None,
    staff: list[dict] | None = None,
) -> dict:
    data = load_release_override(band_id, release_id)
    if description is not None:
        data["description"] = description.strip() or None
    if producer is not None:
        data["producer"] = producer.strip() or None
    if label is not None:
        data["label"] = label.strip() or None
    if subgenres is not None:
        data["subgenres"] = [s.strip() for s in subgenres if s.strip()]
    if staff is not None:
        data["staff"] = staff
    return _write_override(band_id, release_id, data)


def _normalize_staff_member(raw: dict) -> dict | None:
    name = str(raw.get("name") or "").strip()
    if not name:
        return None
    roles = [
        str(r).strip()
        for r in (raw.get("roles") or [])
        if r and str(r).strip()
    ]
    return {
        "id": str(raw.get("id") or f"manual-{uuid.uuid4().hex[:10]}"),
        "name": name,
        "photo_url": (str(raw.get("photo_url")).strip() or None)
        if raw.get("photo_url")
        else None,
        "roles": roles,
    }


def apply_release_overrides(payload: dict, band_id: int, release_id: str) -> dict:
    override = load_release_override(band_id, release_id)
    if not override:
        payload.setdefault("staff", [])
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
    staff_raw = override.get("staff")
    staff: list[dict] = []
    if isinstance(staff_raw, list):
        for entry in staff_raw:
            if not isinstance(entry, dict):
                continue
            member = _normalize_staff_member(entry)
            if member:
                staff.append(member)
    payload["staff"] = staff
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


def add_release_staff_member(
    db: Session,
    band_id: int,
    release_id: str,
    *,
    name: str,
    photo_url: str | None = None,
    roles: list[str] | None = None,
) -> dict | None:
    if not resolve_release_content(db, band_id, release_id):
        return None
    data = load_release_override(band_id, release_id)
    staff = list(data.get("staff") or []) if isinstance(data.get("staff"), list) else []
    member = _normalize_staff_member(
        {
            "name": name,
            "photo_url": photo_url,
            "roles": roles or [],
        }
    )
    if not member:
        return None
    staff.append(member)
    data["staff"] = staff
    _write_override(band_id, release_id, data)
    return member


def patch_release_staff_member(
    db: Session,
    band_id: int,
    release_id: str,
    member_id: str,
    *,
    name: str | None = None,
    photo_url: str | None = None,
    roles: list[str] | None = None,
) -> dict | None:
    if not resolve_release_content(db, band_id, release_id):
        return None
    data = load_release_override(band_id, release_id)
    staff = list(data.get("staff") or []) if isinstance(data.get("staff"), list) else []
    want = str(member_id)
    for entry in staff:
        if not isinstance(entry, dict):
            continue
        if str(entry.get("id") or "") != want:
            continue
        if name is not None:
            entry["name"] = name.strip()
        if photo_url is not None:
            entry["photo_url"] = photo_url.strip() or None
        if roles is not None:
            entry["roles"] = [str(r).strip() for r in roles if r and str(r).strip()]
        data["staff"] = staff
        _write_override(band_id, release_id, data)
        return _normalize_staff_member(entry)
    return None


def remove_release_staff_member(
    db: Session, band_id: int, release_id: str, member_id: str
) -> bool:
    if not resolve_release_content(db, band_id, release_id):
        return False
    data = load_release_override(band_id, release_id)
    staff = list(data.get("staff") or []) if isinstance(data.get("staff"), list) else []
    want = str(member_id)
    next_staff = [
        e
        for e in staff
        if isinstance(e, dict) and str(e.get("id") or "") != want
    ]
    if len(next_staff) == len(staff):
        return False
    data["staff"] = next_staff
    _write_override(band_id, release_id, data)
    return True
