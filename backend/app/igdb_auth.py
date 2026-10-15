"""IGDB (Twitch) client credentials — env or ApiAuth DB row (like Spotify)."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ApiAuth

_API_NAMES = ("IGDB", "igdb", "Twitch", "twitch")


def get_igdb_credentials(db: Session | None = None) -> tuple[str | None, str | None]:
    env_id = (getattr(settings, "igdb_client_id", "") or "").strip()
    env_secret = (getattr(settings, "igdb_client_secret", "") or "").strip()
    if env_id and env_secret:
        return env_id, env_secret
    if db is None:
        from app.database import SessionLocal

        session = SessionLocal()
        try:
            return get_igdb_credentials(session)
        finally:
            session.close()
    row = db.scalar(select(ApiAuth).where(ApiAuth.api_name.in_(_API_NAMES)))
    if not row:
        return None, None
    client_id = (row.api_key_encrypted or "").strip() or None
    client_secret = (row.api_secret_encrypted or "").strip() or None
    return client_id, client_secret


def igdb_credentials_configured(db: Session | None = None) -> bool:
    cid, sec = get_igdb_credentials(db)
    return bool(cid and sec)


def save_igdb_credentials(
    db: Session, *, client_id: str, client_secret: str
) -> None:
    cid = client_id.strip()
    sec = client_secret.strip()
    if not cid or not sec:
        raise ValueError("IGDB Client ID and secret are required")
    row = db.scalar(select(ApiAuth).where(ApiAuth.api_name.in_(_API_NAMES)))
    if not row:
        next_id = int(db.scalar(select(func.max(ApiAuth.api_id))) or 0) + 1
        row = ApiAuth(
            api_id=next_id,
            api_name="IGDB",
            api_key_encrypted=cid,
            api_secret_encrypted=sec,
            api_url="https://api.igdb.com/v4",
            api_doc="https://api-docs.igdb.com/",
        )
        db.add(row)
    else:
        row.api_name = "IGDB"
        row.api_key_encrypted = cid
        row.api_secret_encrypted = sec
        if not row.api_url:
            row.api_url = "https://api.igdb.com/v4"
    db.commit()
