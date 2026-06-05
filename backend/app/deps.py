from __future__ import annotations

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.auth_session import resolve_session
from app.database import get_db
from app.models import User
from app.profiles import get_profile_user, is_admin_role


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip() or None
    return None


def get_current_user(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> User:
    token = _bearer_token(authorization)
    user_id = resolve_session(token)
    if user_id is None:
        raise HTTPException(401, "Profile not selected")
    user = get_profile_user(db, user_id)
    if not user:
        raise HTTPException(401, "Invalid profile")
    return user


def get_optional_user(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> User | None:
    token = _bearer_token(authorization)
    user_id = resolve_session(token)
    if user_id is None:
        return None
    return get_profile_user(db, user_id)


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not is_admin_role(user.usr_role_id):
        raise HTTPException(403, "Admin profile required")
    return user
