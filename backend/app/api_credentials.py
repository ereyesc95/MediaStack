"""Admin catalog for third-party API credentials stored in ``apiauth``."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.crud import (
    get_google_books_key,
    get_lastfm_key,
    get_setlistfm_key,
    get_tmdb_key,
    save_google_books_key,
)
from app.igdb_auth import get_igdb_credentials, save_igdb_credentials
from app.models import ApiAuth
from app.spotify_auth import get_spotify_credentials, save_spotify_credentials
from app.user_settings import (
    get_saved_musicbrainz_user_agent,
    save_musicbrainz_user_agent,
)

FieldKind = Literal["key", "secret", "user_agent"]


@dataclass(frozen=True)
class ServiceSpec:
    id: str
    name: str
    api_names: tuple[str, ...]
    fields: tuple[FieldKind, ...]
    doc_url: str
    description: str


SERVICES: tuple[ServiceSpec, ...] = (
    ServiceSpec(
        id="spotify",
        name="Spotify",
        api_names=("Spotify", "spotify"),
        fields=("key", "secret"),
        doc_url="https://developer.spotify.com/dashboard",
        description="Playlist import / OAuth (Client ID + Client Secret).",
    ),
    ServiceSpec(
        id="tmdb",
        name="TMDb",
        api_names=("TMDb", "TMDB", "tmdb"),
        fields=("key",),
        doc_url="https://www.themoviedb.org/settings/api",
        description="Series and Movies metadata.",
    ),
    ServiceSpec(
        id="igdb",
        name="IGDB",
        api_names=("IGDB", "igdb", "Twitch", "twitch"),
        fields=("key", "secret"),
        doc_url="https://api-docs.igdb.com/",
        description="Games metadata (Twitch Client ID + Secret).",
    ),
    ServiceSpec(
        id="setlistfm",
        name="Setlist.fm",
        api_names=("Setlist.fm", "SetlistFM", "setlistfm"),
        fields=("key",),
        doc_url="https://api.setlist.fm/docs/1.0/index.html",
        description="Tour setlists.",
    ),
    ServiceSpec(
        id="lastfm",
        name="Last.fm",
        api_names=("Last.fm", "LastFM", "lastfm"),
        fields=("key",),
        doc_url="https://www.last.fm/api/account/create",
        description="Similar artists and related lookups.",
    ),
    ServiceSpec(
        id="google_books",
        name="Google Books",
        api_names=("Google Books", "GoogleBooks", "google_books", "googlebooks"),
        fields=("key",),
        doc_url="https://developers.google.com/books/docs/v1/using",
        description="Books catalog search / enrichment.",
    ),
    ServiceSpec(
        id="musicbrainz",
        name="MusicBrainz",
        api_names=(),
        fields=("user_agent",),
        doc_url="https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting",
        description="User-Agent string required for MusicBrainz requests.",
    ),
)


def _mask(value: str | None) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None
    if len(raw) <= 8:
        return "••••" + raw[-2:]
    return f"{raw[:4]}…{raw[-4:]}"


def _find_row(db: Session, names: tuple[str, ...]) -> ApiAuth | None:
    if not names:
        return None
    return db.scalar(select(ApiAuth).where(ApiAuth.api_name.in_(names)))


def _upsert_row(
    db: Session,
    *,
    canonical_name: str,
    names: tuple[str, ...],
    key: str | None = None,
    secret: str | None = None,
    url: str | None = None,
    doc: str | None = None,
) -> ApiAuth:
    row = _find_row(db, names)
    if not row:
        next_id = int(db.scalar(select(func.max(ApiAuth.api_id))) or 0) + 1
        row = ApiAuth(api_id=next_id, api_name=canonical_name)
        db.add(row)
    else:
        row.api_name = canonical_name
    if key is not None:
        row.api_key_encrypted = key.strip()
    if secret is not None:
        row.api_secret_encrypted = secret.strip()
    if url and not row.api_url:
        row.api_url = url
    if doc and not row.api_doc:
        row.api_doc = doc
    db.commit()
    db.refresh(row)
    return row


def _service_status(db: Session, spec: ServiceSpec) -> dict[str, Any]:
    configured = False
    hints: dict[str, str | None] = {}
    source = "none"

    if spec.id == "spotify":
        cid, sec = get_spotify_credentials(db)
        configured = bool(cid and sec)
        hints["key"] = _mask(cid)
        hints["secret"] = "••••••••" if sec else None
        if configured:
            env_id = (settings.spotify_client_id or "").strip()
            source = "env" if env_id else "database"
    elif spec.id == "igdb":
        cid, sec = get_igdb_credentials(db)
        configured = bool(cid and sec)
        hints["key"] = _mask(cid)
        hints["secret"] = "••••••••" if sec else None
        if configured:
            env_id = (settings.igdb_client_id or "").strip()
            source = "env" if env_id else "database"
    elif spec.id == "tmdb":
        key = get_tmdb_key(db)
        configured = bool(key)
        hints["key"] = _mask(key)
        if configured:
            source = "env" if (settings.tmdb_api_key or "").strip() else "database"
    elif spec.id == "setlistfm":
        key = get_setlistfm_key(db)
        configured = bool(key)
        hints["key"] = _mask(key)
        if configured:
            source = (
                "env" if (settings.setlistfm_api_key or "").strip() else "database"
            )
    elif spec.id == "lastfm":
        key = get_lastfm_key(db)
        configured = bool(key)
        hints["key"] = _mask(key)
        if configured:
            source = "env" if (settings.lastfm_api_key or "").strip() else "database"
    elif spec.id == "google_books":
        key = get_google_books_key(db)
        configured = bool(key)
        hints["key"] = _mask(key)
        if configured:
            source = (
                "env"
                if (settings.google_books_api_key or "").strip()
                else "database"
            )
    elif spec.id == "musicbrainz":
        saved = get_saved_musicbrainz_user_agent()
        effective = saved or (settings.musicbrainz_user_agent or "").strip()
        configured = bool(effective)
        hints["user_agent"] = effective or None
        source = "saved" if saved else ("env" if configured else "none")

    return {
        "id": spec.id,
        "name": spec.name,
        "description": spec.description,
        "doc_url": spec.doc_url,
        "fields": list(spec.fields),
        "configured": configured,
        "source": source,
        "hints": hints,
    }


def list_api_credentials(db: Session) -> list[dict[str, Any]]:
    return [_service_status(db, spec) for spec in SERVICES]


def get_service(service_id: str) -> ServiceSpec | None:
    sid = (service_id or "").strip().casefold()
    for spec in SERVICES:
        if spec.id == sid:
            return spec
    return None


def save_api_credentials(
    db: Session,
    service_id: str,
    *,
    key: str | None = None,
    secret: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    spec = get_service(service_id)
    if not spec:
        raise ValueError("Unknown API service")

    if spec.id == "spotify":
        if not key or not secret:
            raise ValueError("Spotify Client ID and secret are required")
        save_spotify_credentials(db, client_id=key, client_secret=secret)
    elif spec.id == "igdb":
        if not key or not secret:
            raise ValueError("IGDB Client ID and secret are required")
        save_igdb_credentials(db, client_id=key, client_secret=secret)
    elif spec.id == "google_books":
        if not key:
            raise ValueError("Google Books API key is required")
        save_google_books_key(db, key)
    elif spec.id == "tmdb":
        if not key:
            raise ValueError("TMDb API key is required")
        _upsert_row(
            db,
            canonical_name="TMDb",
            names=spec.api_names,
            key=key,
            url="https://api.themoviedb.org/3",
            doc=spec.doc_url,
        )
    elif spec.id == "setlistfm":
        if not key:
            raise ValueError("Setlist.fm API key is required")
        _upsert_row(
            db,
            canonical_name="Setlist.fm",
            names=spec.api_names,
            key=key,
            url="https://api.setlist.fm/rest/1.0",
            doc=spec.doc_url,
        )
    elif spec.id == "lastfm":
        if not key:
            raise ValueError("Last.fm API key is required")
        _upsert_row(
            db,
            canonical_name="Last.fm",
            names=spec.api_names,
            key=key,
            url="https://ws.audioscrobbler.com/2.0/",
            doc=spec.doc_url,
        )
    elif spec.id == "musicbrainz":
        if not user_agent:
            raise ValueError("MusicBrainz User-Agent is required")
        saved = save_musicbrainz_user_agent(user_agent)
        settings.musicbrainz_user_agent = saved
    else:
        raise ValueError("Unknown API service")

    return _service_status(db, spec)


def clear_api_credentials(db: Session, service_id: str) -> dict[str, Any]:
    spec = get_service(service_id)
    if not spec:
        raise ValueError("Unknown API service")

    if spec.id == "musicbrainz":
        save_musicbrainz_user_agent("")
        # Leave env default in place for runtime
    else:
        row = _find_row(db, spec.api_names)
        if row:
            db.delete(row)
            db.commit()

    return _service_status(db, spec)
