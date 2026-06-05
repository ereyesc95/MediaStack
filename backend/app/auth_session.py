"""In-memory profile sessions (local app)."""
from __future__ import annotations

import secrets
import time
from dataclasses import dataclass

SESSION_TTL_SEC = 60 * 60 * 24 * 30  # 30 days


@dataclass
class SessionRecord:
    user_id: int
    expires_at: float


_sessions: dict[str, SessionRecord] = {}


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    _sessions[token] = SessionRecord(
        user_id=user_id,
        expires_at=time.time() + SESSION_TTL_SEC,
    )
    return token


def resolve_session(token: str | None) -> int | None:
    if not token:
        return None
    rec = _sessions.get(token)
    if not rec:
        return None
    if rec.expires_at < time.time():
        _sessions.pop(token, None)
        return None
    return rec.user_id


def revoke_session(token: str | None) -> None:
    if token:
        _sessions.pop(token, None)
