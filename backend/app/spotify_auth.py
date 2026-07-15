"""Spotify OAuth and Web API helpers (per MediaStack profile)."""
from __future__ import annotations

import base64
import secrets
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ApiAuth, SpotifyProfileAuth

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API = "https://api.spotify.com/v1"
SCOPES = "playlist-read-private playlist-read-collaborative user-read-private user-read-email"


def _spotify_error_message(res: httpx.Response) -> str:
    body = (res.text or "").strip()
    if body:
        return body.split("\n")[0].strip()
    return res.reason_phrase or f"HTTP {res.status_code}"


def _cleanup_oauth_states(db: Session) -> None:
    db.execute(
        text('DELETE FROM spotify_oauth_state WHERE "sosExpiresAt" < :now'),
        {"now": time.time()},
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_spotify_credentials(db: Session) -> tuple[str | None, str | None]:
    env_id = (getattr(settings, "spotify_client_id", "") or "").strip()
    env_secret = (getattr(settings, "spotify_client_secret", "") or "").strip()
    if env_id and env_secret:
        return env_id, env_secret
    row = db.scalar(
        select(ApiAuth).where(ApiAuth.api_name.in_(("Spotify", "spotify")))
    )
    if not row:
        return None, None
    client_id = (row.api_key_encrypted or "").strip() or None
    client_secret = (row.api_secret_encrypted or "").strip() or None
    return client_id, client_secret


def validate_spotify_credentials(client_id: str, client_secret: str) -> None:
    cid = client_id.strip()
    sec = client_secret.strip()
    if not cid or not sec:
        raise ValueError("Client ID and secret are required")
    auth = base64.b64encode(f"{cid}:{sec}".encode()).decode()
    with httpx.Client(timeout=20) as client:
        res = client.post(
            SPOTIFY_TOKEN_URL,
            data={"grant_type": "client_credentials"},
            headers={"Authorization": f"Basic {auth}"},
        )
    if res.status_code == 400:
        detail = res.text
        if "invalid_client" in detail.lower():
            raise ValueError(
                "Spotify rejected this Client ID or secret. Create an app at "
                "developer.spotify.com and paste its credentials here."
            )
        raise ValueError("Spotify rejected these credentials.")
    res.raise_for_status()


def save_spotify_credentials(db: Session, *, client_id: str, client_secret: str) -> None:
    cid = client_id.strip()
    sec = client_secret.strip()
    validate_spotify_credentials(cid, sec)
    row = db.scalar(
        select(ApiAuth).where(ApiAuth.api_name.in_(("Spotify", "spotify")))
    )
    if not row:
        next_id = int(db.scalar(select(func.max(ApiAuth.api_id))) or 0) + 1
        row = ApiAuth(
            api_id=next_id,
            api_name="Spotify",
            api_key_encrypted=cid,
            api_secret_encrypted=sec,
        )
        db.add(row)
    else:
        row.api_key_encrypted = cid
        row.api_secret_encrypted = sec
    db.commit()


def spotify_setup_info(db: Session, public_base: str) -> dict:
    client_id, _ = get_spotify_credentials(db)
    redirect_uri = redirect_uri_for_base(public_base)
    masked = None
    if client_id:
        masked = client_id if len(client_id) <= 8 else f"{client_id[:4]}…{client_id[-4:]}"
    return {
        "configured": bool(client_id),
        "client_id_hint": masked,
        "redirect_uri": redirect_uri,
    }


def redirect_uri_for_base(public_base: str) -> str:
    base = (public_base or "").rstrip("/")
    override = getattr(settings, "spotify_redirect_uri", "") or ""
    if override:
        return override.rstrip("/")
    # Spotify rejects http://localhost — use loopback IP instead.
    base = base.replace("://localhost", "://127.0.0.1")
    return f"{base}/api/spotify/auth/callback"


def _sanitize_return_path(path: str | None) -> str:
    clean = (path or "/music/playlists").strip()
    if not clean.startswith("/") or clean.startswith("//"):
        return "/music/playlists"
    base = clean.split("?")[0].split("#")[0]
    return base or "/music/playlists"


def _sanitize_frontend_origin(origin: str | None, *, fallback: str) -> str:
    override = (getattr(settings, "public_url", "") or "").strip().rstrip("/")
    if override:
        return override
    clean = (origin or "").strip().rstrip("/")
    allowed = {o.rstrip("/") for o in getattr(settings, "cors_origins", []) or []}
    fb = fallback.rstrip("/")
    if clean and (clean in allowed or clean == fb):
        return clean
    return fb


def build_return_url(frontend_origin: str, return_path: str, hash_suffix: str = "") -> str:
    base = frontend_origin.rstrip("/")
    path = _sanitize_return_path(return_path)
    url = f"{base}{path}"
    if hash_suffix:
        url += hash_suffix if hash_suffix.startswith("#") else f"#{hash_suffix}"
    return url


def append_query_param(url: str, key: str, value: str) -> str:
    from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

    parsed = urlparse(url)
    query = parse_qs(parsed.query, keep_blank_values=True)
    query[key] = [value]
    return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))


def create_oauth_state(
    db: Session,
    user_id: int,
    *,
    return_path: str = "/music/playlists",
    frontend_origin: str,
) -> str:
    _cleanup_oauth_states(db)
    state = secrets.token_urlsafe(24)
    db.execute(
        text(
            """
            INSERT INTO spotify_oauth_state
                ("sosState", "sosUserID", "sosExpiresAt", "sosReturnPath", "sosFrontendOrigin")
            VALUES (:state, :user_id, :expires_at, :return_path, :frontend_origin)
            """
        ),
        {
            "state": state,
            "user_id": user_id,
            "expires_at": time.time() + 600,
            "return_path": _sanitize_return_path(return_path),
            "frontend_origin": _sanitize_frontend_origin(
                frontend_origin, fallback=frontend_origin
            ),
        },
    )
    db.commit()
    return state


def consume_oauth_state(db: Session, state: str) -> tuple[int | None, str, str]:
    clean = (state or "").strip()
    if not clean:
        return None, "/music/playlists", ""
    row = db.execute(
        text(
            """
            SELECT "sosUserID", "sosExpiresAt", "sosReturnPath", "sosFrontendOrigin"
            FROM spotify_oauth_state
            WHERE "sosState" = :state
            """
        ),
        {"state": clean},
    ).first()
    db.execute(
        text('DELETE FROM spotify_oauth_state WHERE "sosState" = :state'),
        {"state": clean},
    )
    db.commit()
    if not row:
        return None, "/music/playlists", ""
    user_id, expires_at, return_path, frontend_origin = row
    if time.time() > float(expires_at or 0):
        return None, return_path or "/music/playlists", frontend_origin or ""
    return int(user_id), return_path or "/music/playlists", frontend_origin or ""


def _save_tokens(
    db: Session,
    user_id: int,
    access_token: str,
    refresh_token: str | None,
    expires_in: int,
) -> None:
    expires_at = datetime.now(timezone.utc).timestamp() + max(expires_in - 30, 60)
    row = db.get(SpotifyProfileAuth, user_id)
    if not row:
        row = SpotifyProfileAuth(spa_user_id=user_id)
        db.add(row)
    row.spa_access_token = access_token
    if refresh_token:
        row.spa_refresh_token = refresh_token
    row.spa_expires_at = str(expires_at)
    row.spa_updated_at = _now_iso()
    db.commit()


def _get_profile_auth(db: Session, user_id: int) -> SpotifyProfileAuth | None:
    return db.get(SpotifyProfileAuth, user_id)


def exchange_code(
    db: Session, *, user_id: int, code: str, redirect_uri: str
) -> None:
    client_id, client_secret = get_spotify_credentials(db)
    if not client_id or not client_secret:
        raise RuntimeError("Spotify API credentials not configured")
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
    }
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    with httpx.Client(timeout=30) as client:
        res = client.post(
            SPOTIFY_TOKEN_URL,
            data=data,
            headers={"Authorization": f"Basic {auth}"},
        )
        if res.status_code >= 400:
            detail = res.text.strip() or res.reason_phrase
            raise RuntimeError(f"Spotify token exchange failed: {detail}")
        payload = res.json()
    _save_tokens(
        db,
        user_id,
        payload["access_token"],
        payload.get("refresh_token"),
        int(payload.get("expires_in") or 3600),
    )


def _refresh_access_token(db: Session, user_id: int, refresh_token: str) -> str:
    client_id, client_secret = get_spotify_credentials(db)
    if not client_id or not client_secret:
        raise RuntimeError("Spotify API credentials not configured")
    data = {"grant_type": "refresh_token", "refresh_token": refresh_token}
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    with httpx.Client(timeout=30) as client:
        res = client.post(
            SPOTIFY_TOKEN_URL,
            data=data,
            headers={"Authorization": f"Basic {auth}"},
        )
        res.raise_for_status()
        payload = res.json()
    access = payload["access_token"]
    _save_tokens(
        db,
        user_id,
        access,
        payload.get("refresh_token") or refresh_token,
        int(payload.get("expires_in") or 3600),
    )
    return access


def get_access_token(db: Session, user_id: int) -> str | None:
    row = _get_profile_auth(db, user_id)
    if not row or not row.spa_access_token:
        return None
    expires = float(row.spa_expires_at or 0)
    if time.time() >= expires and row.spa_refresh_token:
        try:
            return _refresh_access_token(db, user_id, row.spa_refresh_token)
        except Exception:
            return None
    return row.spa_access_token


def disconnect_spotify(db: Session, user_id: int) -> None:
    row = _get_profile_auth(db, user_id)
    if row:
        db.delete(row)
        db.commit()


def fetch_spotify_profile(db: Session, user_id: int) -> dict | None:
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            me = _api_get(db, user_id, "/me")
            if not isinstance(me, dict):
                return None
            images = me.get("images") or []
            image_url = None
            if images and isinstance(images[0], dict):
                image_url = images[0].get("url")
            display = (me.get("display_name") or me.get("id") or "").strip()
            return {
                "id": me.get("id"),
                "display_name": display or "Spotify user",
                "image_url": image_url,
            }
        except Exception as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(0.35)
    if last_error:
        return None
    return None


def spotify_session_status(db: Session, user_id: int) -> dict:
    row = _get_profile_auth(db, user_id)
    if not row or not (row.spa_access_token or row.spa_refresh_token):
        return {"connected": False}
    token = get_access_token(db, user_id)
    if not token:
        return {"connected": False}
    profile = fetch_spotify_profile(db, user_id)
    if profile:
        return {"connected": True, "user": profile}
    return {
        "connected": True,
        "user": {
            "id": None,
            "display_name": "Spotify",
            "image_url": None,
        },
    }


def spotify_connected(db: Session, user_id: int) -> bool:
    row = _get_profile_auth(db, user_id)
    return bool(row and (row.spa_access_token or row.spa_refresh_token))


def build_authorize_url(
    db: Session,
    *,
    user_id: int,
    public_base: str,
    return_path: str = "/music/playlists",
    frontend_origin: str,
    show_dialog: bool = False,
) -> str:
    client_id, _ = get_spotify_credentials(db)
    if not client_id:
        raise RuntimeError("Spotify API credentials not configured")
    state = create_oauth_state(
        db,
        user_id,
        return_path=return_path,
        frontend_origin=frontend_origin,
    )
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri_for_base(public_base),
        "scope": SCOPES,
        "state": state,
    }
    if show_dialog:
        params["show_dialog"] = "true"
    return f"{SPOTIFY_AUTH_URL}?{urlencode(params)}"


def _api_get(db: Session, user_id: int, path: str, params: dict | None = None) -> Any:
    token = get_access_token(db, user_id)
    if not token:
        raise RuntimeError("Spotify not connected for this profile")
    url = f"{SPOTIFY_API}{path}"
    with httpx.Client(timeout=60) as client:
        res = client.get(url, params=params, headers={"Authorization": f"Bearer {token}"})
        if res.status_code in (401, 403):
            profile = _get_profile_auth(db, user_id)
            if profile and profile.spa_refresh_token:
                token = _refresh_access_token(db, user_id, profile.spa_refresh_token)
                res = client.get(url, params=params, headers={"Authorization": f"Bearer {token}"})
        if res.status_code >= 400:
            raise RuntimeError(_spotify_error_message(res))
        return res.json()


def _playlist_items_total(playlist: dict) -> int:
    """Track/item count from playlist metadata (Feb 2026: tracks → items)."""
    meta = playlist.get("items") or playlist.get("tracks") or {}
    if not isinstance(meta, dict):
        return 0
    return int(meta.get("total") or 0)


def _playlist_entry_media(entry: dict) -> dict | None:
    """Extract track (or episode) object from a playlist page entry."""
    media = entry.get("item") or entry.get("track")
    return media if isinstance(media, dict) else None


def list_user_playlists(db: Session, user_id: int) -> list[dict]:
    items: list[dict] = []
    offset = 0
    while True:
        data = _api_get(
            db,
            user_id,
            "/me/playlists",
            {"limit": 50, "offset": offset},
        )
        for item in data.get("items") or []:
            if not isinstance(item, dict):
                continue
            owner = item.get("owner") or {}
            collaborative = bool(item.get("collaborative"))
            items.append(
                {
                    "id": item.get("id"),
                    "name": item.get("name") or "Playlist",
                    "track_count": _playlist_items_total(item),
                    "collaborative": collaborative,
                    "owner": owner.get("display_name") or owner.get("id"),
                    "cover_url": (
                        ((item.get("images") or [{}])[0] or {}).get("url")
                    ),
                }
            )
        if not data.get("next"):
            break
        offset += 50
    items.sort(key=lambda p: (p.get("name") or "").casefold())
    return items


def _playlist_tracks_raw(db: Session, user_id: int, playlist_id: str) -> list[dict]:
    tracks: list[dict] = []
    offset = 0
    while True:
        data = _api_get(
            db,
            user_id,
            f"/playlists/{playlist_id}/items",
            {"limit": 100, "offset": offset, "market": "from_token"},
        )
        for entry in data.get("items") or []:
            if not isinstance(entry, dict):
                continue
            track = _playlist_entry_media(entry)
            if not track or track.get("is_local"):
                continue
            if track.get("type") != "track":
                continue
            artists = track.get("artists") or []
            artist_name = ", ".join(
                a.get("name") for a in artists if isinstance(a, dict) and a.get("name")
            )
            album = track.get("album") or {}
            album_name = album.get("name") or ""
            release_date = album.get("release_date") or ""
            year = release_date[:4] if release_date else None
            track_id = track.get("id") or ""
            spotify_uri = track_id if str(track_id).startswith("spotify:") else (
                f"spotify:track:{track_id}" if track_id else None
            )
            tracks.append(
                {
                    "spotify_uri": spotify_uri,
                    "title": track.get("name") or "Unknown",
                    "artist_name": artist_name or "Unknown",
                    "artist": artist_name or "Unknown",
                    "album_title": album_name,
                    "album": album_name,
                    "year": year,
                    "release_date": release_date if len(release_date) >= 4 else None,
                    "duration_ms": track.get("duration_ms"),
                    "popularity": track.get("popularity"),
                    "explicit": track.get("explicit"),
                }
            )
        if not data.get("next"):
            break
        offset += 100
    return tracks


def fetch_playlist_tracks_for_import(
    db: Session, user_id: int, spotify_playlist_id: str
) -> list[dict]:
    return _playlist_tracks_raw(db, user_id, spotify_playlist_id)
