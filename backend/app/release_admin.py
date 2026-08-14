"""Admin overrides for release overview metadata + DB-backed staff credits."""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ReleaseStaffMember
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
) -> dict:
    """Persist about-field overrides only (staff lives in the DB)."""
    data = load_release_override(band_id, release_id)
    if description is not None:
        data["description"] = description.strip() or None
    if producer is not None:
        data["producer"] = producer.strip() or None
    if label is not None:
        data["label"] = label.strip() or None
    if subgenres is not None:
        data["subgenres"] = [s.strip() for s in subgenres if s.strip()]
    # Staff must not be written back to disk
    data.pop("staff", None)
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


def _roles_to_json(roles: list[str] | None) -> str | None:
    cleaned = [str(r).strip() for r in (roles or []) if r and str(r).strip()]
    return json.dumps(cleaned) if cleaned else None


def _roles_from_json(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(data, list):
        return []
    return [str(r).strip() for r in data if r and str(r).strip()]


def _row_to_member(row: ReleaseStaffMember) -> dict:
    return {
        "id": row.rsm_member_key,
        "name": row.rsm_name,
        "photo_url": row.rsm_photo_url,
        "roles": _roles_from_json(row.rsm_roles_json),
    }


def _list_staff_rows(
    db: Session, band_id: int, release_id: str
) -> list[ReleaseStaffMember]:
    return list(
        db.scalars(
            select(ReleaseStaffMember)
            .where(
                ReleaseStaffMember.rsm_band_id == band_id,
                ReleaseStaffMember.rsm_release_id == release_id,
            )
            .order_by(
                ReleaseStaffMember.rsm_sort_order.asc(),
                ReleaseStaffMember.rsm_id.asc(),
            )
        ).all()
    )


def list_release_staff(db: Session, band_id: int, release_id: str) -> list[dict]:
    """Load staff from DB; one-time migrate legacy JSON override staff if needed."""
    rows = _list_staff_rows(db, band_id, release_id)
    if rows:
        return [_row_to_member(r) for r in rows]

    override = load_release_override(band_id, release_id)
    staff_raw = override.get("staff")
    if not isinstance(staff_raw, list) or not staff_raw:
        return []

    migrated: list[dict] = []
    for i, entry in enumerate(staff_raw):
        if not isinstance(entry, dict):
            continue
        member = _normalize_staff_member(entry)
        if not member:
            continue
        db.add(
            ReleaseStaffMember(
                rsm_band_id=band_id,
                rsm_release_id=release_id,
                rsm_member_key=member["id"],
                rsm_name=member["name"],
                rsm_photo_url=member.get("photo_url"),
                rsm_roles_json=_roles_to_json(member.get("roles")),
                rsm_sort_order=i,
            )
        )
        migrated.append(member)
    if migrated:
        db.commit()
        # Drop staff from override file so future edits stay DB-only
        override.pop("staff", None)
        try:
            _write_override(band_id, release_id, override)
        except OSError:
            pass
    return migrated


def apply_release_overrides(
    payload: dict,
    band_id: int,
    release_id: str,
    db: Session | None = None,
) -> dict:
    override = load_release_override(band_id, release_id)
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
    if db is not None:
        payload["staff"] = list_release_staff(db, band_id, release_id)
    else:
        # Legacy callers without a session — read JSON staff only as fallback
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
    return apply_release_overrides(payload, band_id, release_id, db=db)


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
    # Ensure any legacy JSON staff is migrated first so sort order is correct
    list_release_staff(db, band_id, release_id)
    member = _normalize_staff_member(
        {
            "name": name,
            "photo_url": photo_url,
            "roles": roles or [],
        }
    )
    if not member:
        return None
    existing = _list_staff_rows(db, band_id, release_id)
    sort_order = (existing[-1].rsm_sort_order or 0) + 1 if existing else 0
    db.add(
        ReleaseStaffMember(
            rsm_band_id=band_id,
            rsm_release_id=release_id,
            rsm_member_key=member["id"],
            rsm_name=member["name"],
            rsm_photo_url=member.get("photo_url"),
            rsm_roles_json=_roles_to_json(member.get("roles")),
            rsm_sort_order=sort_order,
        )
    )
    db.commit()
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
    list_release_staff(db, band_id, release_id)
    want = str(member_id)
    row = db.scalar(
        select(ReleaseStaffMember).where(
            ReleaseStaffMember.rsm_band_id == band_id,
            ReleaseStaffMember.rsm_release_id == release_id,
            ReleaseStaffMember.rsm_member_key == want,
        )
    )
    if not row:
        return None
    if name is not None:
        row.rsm_name = name.strip()
    if photo_url is not None:
        row.rsm_photo_url = photo_url.strip() or None
    if roles is not None:
        row.rsm_roles_json = _roles_to_json(roles)
    db.commit()
    db.refresh(row)
    return _row_to_member(row)


def remove_release_staff_member(
    db: Session, band_id: int, release_id: str, member_id: str
) -> bool:
    if not resolve_release_content(db, band_id, release_id):
        return False
    list_release_staff(db, band_id, release_id)
    want = str(member_id)
    row = db.scalar(
        select(ReleaseStaffMember).where(
            ReleaseStaffMember.rsm_band_id == band_id,
            ReleaseStaffMember.rsm_release_id == release_id,
            ReleaseStaffMember.rsm_member_key == want,
        )
    )
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True
