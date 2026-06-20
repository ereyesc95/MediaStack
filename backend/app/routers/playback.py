from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.deps import get_current_user, require_admin
from app.models import User
from app.media_paths import path_to_local_file, resolve_playback_url, resolve_stream_url
from app.schemas import LyricsOut, LyricsSaveIn, PlayRequest, PlayResponse, ReproductionOut, YouTubeOut, YouTubeSaveIn
from app.services.lyrics import resolve_lyrics, save_manual_lyrics

router = APIRouter(prefix="/api/music", tags=["playback"])


@router.post("/play", response_model=PlayResponse)
def play_track(
    body: PlayRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stream = resolve_playback_url(body.path)
    local = path_to_local_file(body.path)
    title = body.title
    if not title and "/" in body.path:
        title = Path(body.path.split("/")[-1]).stem[4:] if len(Path(body.path.split("/")[-1]).stem) > 4 else Path(body.path.split("/")[-1]).stem
    cover_url = None
    from app.config import settings
    from app.band_library import cover_url_for_track_path

    if settings.media_root:
        cover_url = cover_url_for_track_path(body.path, Path(settings.media_root))
    if body.record:
        crud.record_play(
            db,
            path=body.path,
            artist_id=body.artist_id,
            title=title,
            release=body.release,
            media_type=body.media_type,
            user_id=user.usr_id,
        )
    return PlayResponse(
        stream_url=stream,
        local_file=str(local) if local else None,
        title=title,
        cover_url=cover_url,
    )


@router.get("/stream")
def stream_track(path: str = Query(..., min_length=1)):
    local = path_to_local_file(path)
    if local and local.is_file():
        return FileResponse(local, media_type="audio/mpeg")
    url = resolve_stream_url(path)
    return RedirectResponse(url)


@router.get("/lyrics", response_model=LyricsOut)
async def track_lyrics(
    artist: str = Query(...),
    title: str = Query(...),
    play_path: str | None = Query(None),
    db: Session = Depends(get_db),
):
    from app.services.lyrics import _read_raw_lrc_file, resolve_lyrics

    synced = _read_raw_lrc_file(play_path, db=db) if play_path else None
    lyrics, source = await resolve_lyrics(artist, title, play_path=play_path, db=db)
    return LyricsOut(
        artist=artist,
        title=title,
        lyrics=lyrics,
        synced_lyrics=synced,
        source=source or "none",
    )


@router.put("/lyrics", response_model=LyricsOut)
def save_track_lyrics(
    body: LyricsSaveIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.services.lyrics import _read_raw_lrc_file

    save_manual_lyrics(
        body.artist,
        body.title,
        body.lyrics,
        play_path=body.play_path,
        synced_lyrics=body.synced_lyrics if "synced_lyrics" in body.model_fields_set else None,
        preserve_synced="synced_lyrics" not in body.model_fields_set,
        db=db,
        band_id=body.band_id,
    )
    synced = (
        _read_raw_lrc_file(body.play_path, db=db)
        if body.play_path
        else body.synced_lyrics
    )
    return LyricsOut(
        artist=body.artist,
        title=body.title,
        lyrics=body.lyrics.strip(),
        synced_lyrics=synced,
        source="manual",
    )


@router.get("/youtube", response_model=YouTubeOut)
def track_youtube(
    artist: str = Query(...),
    title: str = Query(...),
    play_path: str | None = Query(None),
    band_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    from app.person_lookup import find_local_band_for_person
    from app.track_youtube import read_track_youtube

    bid = band_id
    if not bid:
        bid = find_local_band_for_person(db, artist)
    if not bid:
        return YouTubeOut(artist=artist, title=title, youtube_url=None, source="none")
    url, source = read_track_youtube(
        db,
        band_id=bid,
        title=title,
        play_path=play_path,
    )
    return YouTubeOut(artist=artist, title=title, youtube_url=url, source=source)


@router.put("/youtube", response_model=YouTubeOut)
def save_track_youtube_route(
    body: YouTubeSaveIn,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.person_lookup import find_local_band_for_person
    from app.track_youtube import save_track_youtube

    bid = body.band_id
    if not bid:
        bid = find_local_band_for_person(db, body.artist)
    if not bid:
        raise HTTPException(400, "Could not resolve band for artist")
    try:
        url = save_track_youtube(
            db,
            band_id=bid,
            title=body.title,
            play_path=body.play_path,
            youtube_url=body.youtube_url,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return YouTubeOut(
        artist=body.artist,
        title=body.title,
        youtube_url=url,
        source="manual",
    )


@router.get("/reproductions", response_model=list[ReproductionOut])
def recent_plays(
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = crud.list_recent_plays(db, user_id=user.usr_id, limit=limit)
    from app.play_stats import is_quiz_play_title

    return [
        ReproductionOut(
            id=r.rep_id,
            title=r.rep_title,
            artist_id=r.rep_artist_id,
            play_count=int(r.rep_reproductions or "0"),
            path=r.rep_path,
        )
        for r in rows
        if not is_quiz_play_title(r.rep_title)
    ]


@router.get("/playlist-tracks/{track_id}")
def playlist_track(track_id: int, db: Session = Depends(get_db)):
    row = crud.get_playlist_track(db, track_id)
    if not row:
        raise HTTPException(404, "Track not found")
    return {
        "id": row.pld_id,
        "title": row.pld_title,
        "artist": row.pld_artist,
        "release": row.pld_release,
        "path": row.pld_path,
        "stream_url": resolve_stream_url(row.pld_path),
    }
