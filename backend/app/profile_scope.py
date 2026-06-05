"""Per-profile scoping for play history and dashboard stats."""
from __future__ import annotations

from sqlalchemy import or_

from app.models import Reproduction
from app.profiles import ADMIN_USER_ID

MUSIC_MEDIA_TYPE = 200


def rep_belongs_to_user(rep: Reproduction, user_id: int) -> bool:
    uid = rep.rep_user_id
    if user_id == ADMIN_USER_ID:
        return uid is None or uid == ADMIN_USER_ID
    return uid == user_id


def rep_user_filter(user_id: int):
    """SQLAlchemy filter for reproduction rows visible to a profile."""
    if user_id == ADMIN_USER_ID:
        return or_(
            Reproduction.rep_user_id.is_(None),
            Reproduction.rep_user_id == ADMIN_USER_ID,
        )
    return Reproduction.rep_user_id == user_id
