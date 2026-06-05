"""Password hashing — bcrypt for new users, legacy Base64 upgrade on login."""
from __future__ import annotations

import base64

from passlib.context import CryptContext

_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
_BCRYPT_PREFIX = "$2"


def is_bcrypt_hash(stored: str | None) -> bool:
    return bool(stored and stored.startswith(_BCRYPT_PREFIX))


def hash_password(plain: str) -> str:
    return _ctx.hash(plain)


def verify_password(plain: str, stored: str | None) -> bool:
    if not stored:
        return False
    if is_bcrypt_hash(stored):
        return _ctx.verify(plain, stored)
    try:
        legacy = base64.b64encode(plain.encode("utf-8")).decode("ascii")
        return legacy == stored
    except Exception:
        return False


def needs_upgrade(stored: str | None) -> bool:
    return bool(stored and not is_bcrypt_hash(stored))
