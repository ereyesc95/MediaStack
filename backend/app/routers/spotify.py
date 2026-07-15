"""Spotify OAuth and import API routes."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.spotify_auth import (
    _sanitize_return_path,
    append_query_param,
    build_authorize_url,
    build_return_url,
    consume_oauth_state,
    disconnect_spotify,
    exchange_code,
    fetch_playlist_tracks_for_import,
    get_access_token,
    list_user_playlists as spotify_list_playlists,
    redirect_uri_for_base,
    save_spotify_credentials,
    spotify_connected,
    spotify_session_status,
    spotify_setup_info,
    _sanitize_frontend_origin,
)
from app.user_playlist import create_user_playlist, import_spotify_snapshot

router = APIRouter(prefix="/api/spotify", tags=["spotify"])


class SpotifyImportBody(BaseModel):
    spotify_playlist_id: str
    name: str | None = None
    description: str | None = None


class SpotifyCredentialsBody(BaseModel):
    client_id: str
    client_secret: str


def _public_base(request: Request) -> str:
    override = getattr(settings, "public_url", "") or ""
    if override:
        return override.rstrip("/")
    return str(request.base_url).rstrip("/")


@router.get("/setup")
def spotify_setup(
    request: Request,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return spotify_setup_info(db, _public_base(request))


@router.post("/credentials")
def spotify_save_credentials(
    body: SpotifyCredentialsBody,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    try:
        save_spotify_credentials(
            db, client_id=body.client_id, client_secret=body.client_secret
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Spotify API error: {exc}") from exc
    return {"ok": True}


@router.get("/status")
def spotify_status(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return spotify_session_status(db, user.usr_id)


@router.post("/disconnect")
def spotify_disconnect(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    disconnect_spotify(db, user.usr_id)
    return {"ok": True}


@router.get("/auth/start")
def spotify_auth_start(
    request: Request,
    return_path: str = Query("/music/playlists"),
    frontend_origin: str = Query(""),
    force_account: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    public_base = _public_base(request)
    safe_return = _sanitize_return_path(return_path)
    origin = _sanitize_frontend_origin(
        frontend_origin or request.headers.get("origin"),
        fallback=public_base,
    )
    if force_account:
        disconnect_spotify(db, user.usr_id)
    elif spotify_connected(db, user.usr_id) and not get_access_token(db, user.usr_id):
        disconnect_spotify(db, user.usr_id)
    try:
        url = build_authorize_url(
            db,
            user_id=user.usr_id,
            public_base=public_base,
            return_path=safe_return,
            frontend_origin=origin,
            show_dialog=force_account,
        )
        setup = spotify_setup_info(db, public_base)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"url": url, "redirect_uri": setup["redirect_uri"], "return_path": safe_return}


@router.get("/auth/callback")
def spotify_auth_callback(
    request: Request,
    code: str = Query(""),
    state: str = Query(""),
    error: str = Query(""),
    db: Session = Depends(get_db),
):
    public_base = _public_base(request)
    user_id, return_path, frontend_origin = consume_oauth_state(db, state)
    origin = frontend_origin or _sanitize_frontend_origin(None, fallback=public_base)
    return_url = build_return_url(origin, return_path)

    def error_redirect(message: str) -> RedirectResponse:
        url = append_query_param(return_url, "spotify", "error")
        url = append_query_param(url, "detail", message)
        return RedirectResponse(url, status_code=302)

    if error:
        return error_redirect(error)
    if not user_id:
        return error_redirect("invalid_state")
    redirect_uri = redirect_uri_for_base(public_base)
    try:
        exchange_code(db, user_id=user_id, code=code, redirect_uri=redirect_uri)
    except Exception as exc:
        return error_redirect(str(exc))
    success_url = append_query_param(return_url, "spotify", "ready")
    return RedirectResponse(success_url, status_code=302)


@router.get("/playlists")
def spotify_playlists(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        items = spotify_list_playlists(db, user.usr_id)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        detail = str(exc)
        if "premium subscription" in detail.lower():
            raise HTTPException(403, detail) from exc
        if "403" in detail or "401" in detail:
            raise HTTPException(
                403,
                detail.split("\n")[0] if detail else "Spotify denied access to playlists.",
            ) from exc
        raise HTTPException(502, f"Spotify API error: {exc}") from exc
    return {"items": items}


@router.post("/import")
def spotify_import(
    body: SpotifyImportBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not settings.media_root:
        raise HTTPException(400, "Media root not configured")
    media_root = Path(settings.media_root)
    if not media_root.is_dir():
        raise HTTPException(400, "Media root not configured")

    spotify_id = body.spotify_playlist_id.strip()
    if not spotify_id:
        raise HTTPException(400, "Missing Spotify playlist id")

    try:
        raw_tracks = fetch_playlist_tracks_for_import(db, user.usr_id, spotify_id)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, f"Spotify API error: {exc}") from exc

    playlist_name = (body.name or "").strip()
    if not playlist_name:
        try:
            playlists = spotify_list_playlists(db, user.usr_id)
            match = next((p for p in playlists if p.get("id") == spotify_id), None)
            playlist_name = (match or {}).get("name") or "Spotify playlist"
        except Exception:
            playlist_name = "Spotify playlist"

    created = create_user_playlist(
        db,
        name=playlist_name,
        description=body.description,
        source="spotify",
        spotify_id=spotify_id,
        kind="snapshot",
    )
    if not created.get("ok"):
        raise HTTPException(400, created.get("error") or "Failed to create playlist")

    playlist_id = int(created["id"])
    stats = import_spotify_snapshot(
        db, media_root, playlist_id=playlist_id, tracks=raw_tracks
    )
    return {
        "ok": True,
        "playlist_id": playlist_id,
        "name": created.get("name"),
        "cover_url": created.get("cover_url"),
        **stats,
    }
