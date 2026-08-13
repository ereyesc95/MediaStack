"""Canonical staff role catalog (Original / Dub / Hybrid) for cast UIs."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import StaffRole

# type: original | dub | hybrid
DEFAULT_STAFF_ROLES: list[tuple[str, str]] = [
    ("Adaptation Writer", "dub"),
    ("Author", "hybrid"),
    ("Character Design", "hybrid"),
    ("Cinematographer", "hybrid"),
    ("Composer", "hybrid"),
    ("Director", "hybrid"),
    ("Dub Studio", "dub"),
    ("Dub Vocalist", "dub"),
    ("Dubbing Director", "dub"),
    ("Editor", "hybrid"),
    ("Music Performer", "original"),
    ("Producer", "hybrid"),
    ("Publisher", "hybrid"),
    ("Sound Director", "original"),
    ("Translator", "dub"),
    ("Writer", "hybrid"),
]

# Retired: same meaning as Distributing Studio on series About.
REMOVED_STAFF_ROLES = frozenset({"studio"})

# Credits that feed left-panel distributor for dub langs — not cast circles.
HIDDEN_CAST_CIRCLE_ROLES = frozenset({"dub studio"})


def ensure_staff_roles(db: Session) -> None:
    existing = {
        (r.sro_name or "").strip().casefold(): r
        for r in db.scalars(select(StaffRole)).all()
        if (r.sro_name or "").strip()
    }
    dirty = False
    for key in REMOVED_STAFF_ROLES:
        row = existing.pop(key, None)
        if row is not None:
            db.delete(row)
            dirty = True
    for name, role_type in DEFAULT_STAFF_ROLES:
        key = name.casefold()
        row = existing.get(key)
        if row is None:
            db.add(StaffRole(sro_name=name, sro_type=role_type))
            dirty = True
        elif (row.sro_type or "").strip().casefold() != role_type:
            row.sro_type = role_type
            dirty = True
    if dirty:
        db.commit()


def list_staff_roles(db: Session) -> list[dict]:
    ensure_staff_roles(db)
    rows = sorted(
        db.scalars(select(StaffRole)).all(),
        key=lambda r: ((r.sro_name or "").casefold(), r.sro_id or 0),
    )
    return [
        {
            "id": r.sro_id,
            "name": r.sro_name,
            "type": (r.sro_type or "hybrid").strip().lower(),
        }
        for r in rows
        if (r.sro_name or "").strip()
        and (r.sro_name or "").strip().casefold() not in REMOVED_STAFF_ROLES
    ]


def staff_role_type_map(db: Session) -> dict[str, str]:
    return {
        (r["name"] or "").casefold(): r["type"]
        for r in list_staff_roles(db)
        if r.get("name")
    }


def role_visible_for_language(
    role_name: str,
    *,
    role_types: dict[str, str],
    is_origin_language: bool,
) -> bool:
    rtype = role_types.get((role_name or "").strip().casefold(), "hybrid")
    if rtype == "hybrid":
        return True
    if rtype == "original":
        return is_origin_language
    if rtype == "dub":
        return not is_origin_language
    return True
