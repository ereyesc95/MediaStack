"""Fixed local profiles: 1 admin + 3 guests."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import User

ADMIN_ROLE_ID = 2
GUEST_ROLE_ID = 3
ADMIN_USER_ID = 1
ADMIN_DISPLAY_NAME = "Admin"

PROFILE_SLOTS: tuple[dict[str, str | int], ...] = (
    {"id": 1, "name": "Admin", "role_id": ADMIN_ROLE_ID},
    {"id": 2, "name": "Guest 1", "role_id": GUEST_ROLE_ID},
    {"id": 3, "name": "Guest 2", "role_id": GUEST_ROLE_ID},
    {"id": 4, "name": "Guest 3", "role_id": GUEST_ROLE_ID},
)


def is_admin_role(role_id: int | None) -> bool:
    return role_id == ADMIN_ROLE_ID


def ensure_profiles(db: Session) -> None:
    for slot in PROFILE_SLOTS:
        uid = int(slot["id"])
        row = db.get(User, uid)
        if row is None:
            row = User(
                usr_id=uid,
                usr_name=str(slot["name"]),
                usr_role_id=int(slot["role_id"]),
            )
            db.add(row)
        else:
            row.usr_role_id = int(slot["role_id"])
    db.commit()


def profile_display_name(row: User, slot_name: str) -> str:
    if row.usr_id == ADMIN_USER_ID:
        return ADMIN_DISPLAY_NAME
    return (row.usr_name or "").strip() or slot_name


def slot_default_name(user_id: int) -> str:
    for slot in PROFILE_SLOTS:
        if int(slot["id"]) == user_id:
            return str(slot["name"])
    return "Guest"


def list_profiles(db: Session) -> list[dict]:
    ensure_profiles(db)
    out: list[dict] = []
    for slot in PROFILE_SLOTS:
        uid = int(slot["id"])
        row = db.get(User, uid)
        if not row:
            continue
        role_id = row.usr_role_id
        out.append(
            {
                "user_id": row.usr_id,
                "username": profile_display_name(row, str(slot["name"])),
                "role_id": role_id,
                "is_admin": is_admin_role(role_id),
                "avatar": None if row.usr_id == ADMIN_USER_ID else row.usr_image,
            }
        )
    return out


def get_profile_user(db: Session, user_id: int) -> User | None:
    ensure_profiles(db)
    row = db.get(User, user_id)
    if not row:
        return None
    allowed = {int(s["id"]) for s in PROFILE_SLOTS}
    if row.usr_id not in allowed:
        return None
    return row
