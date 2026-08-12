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
    nsfw_unlocked: bool = False


_sessions: dict[str, SessionRecord] = {}


def create_session(user_id: int, *, nsfw_unlocked: bool = False) -> str:
    token = secrets.token_urlsafe(32)
    _sessions[token] = SessionRecord(
        user_id=user_id,
        expires_at=time.time() + SESSION_TTL_SEC,
        nsfw_unlocked=bool(nsfw_unlocked),
    )
    return token


def resolve_session(token: str | None) -> int | None:
    rec = resolve_session_record(token)
    return rec.user_id if rec else None


def resolve_session_record(token: str | None) -> SessionRecord | None:
    if not token:
        return None
    rec = _sessions.get(token)
    if not rec:
        return None
    if rec.expires_at < time.time():
        _sessions.pop(token, None)
        return None
    return rec


def session_nsfw_unlocked(token: str | None) -> bool:
    rec = resolve_session_record(token)
    return bool(rec and rec.nsfw_unlocked)


def revoke_session(token: str | None) -> None:
    if token:
        _sessions.pop(token, None)
