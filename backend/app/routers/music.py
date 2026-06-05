from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.deps import get_current_user, require_admin
from app.profiles import is_admin_role
from app.models import Band, Continent, User
from app.music_dashboard import (
    artists_by_genre,
    build_dashboard,
    list_artist_cards,
    list_user_playlists,
    playlist_tracks,
)
from app.music_filters import filter_options, search_roster_artists
from app.services.musicbrainz import fetch_artist, search_artists
from app.schemas import BandListOut, BandOut, PlaylistOut, ReleaseListOut, TrackOut

router = APIRouter(prefix="/api/music", tags=["music"])


class ImportBandBody(BaseModel):
    mbid: str


@router.get("/dashboard")
def music_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return build_dashboard(db, user.usr_id)
    except Exception:
        return {
            "top_tracks": [],
            "top_artists": [],
            "top_genres": [],
            "top_countries": [],
        }


@router.get("/filters/options")
def music_filter_options(db: Session = Depends(get_db)):
    from app.seed_music import ensure_music_lookup_data

    ensure_music_lookup_data(db)
    continents = [
        {"id": c.con_id, "name": c.con_name}
        for c in db.scalars(select(Continent).order_by(Continent.con_name)).all()
        if c.con_name and c.con_id != 1007
    ]
    opts = filter_options(db)
    return {**opts, "continents": continents}


@router.get("/filters/roster-artists")
def music_roster_artists(
    db: Session = Depends(get_db),
    q: str = Query("", min_length=1),
    limit: int = Query(25, ge=1, le=50),
):
    return {"items": search_roster_artists(db, q, limit=limit)}


@router.get("/artist-cards")
def artist_cards(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    search: str = "",
    letter: str = "",
    filter_mode: str = Query("name"),
    member_count: int | None = None,
    member: str = "",
    member_artist_id: int | None = None,
    continent_id: int | None = None,
    country_id: int | None = None,
    start_decade: int | None = None,
    end_decade: int | None = None,
    subgenre_id: int | None = None,
    gender: str = "",
    label: str = "",
    producer: str = "",
    orientation: str = Query("landscape", pattern="^(landscape|portrait)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(48, ge=1, le=200),
):
    items, total = list_artist_cards(
        db,
        user_id=user.usr_id,
        search=search,
        letter=letter,
        orientation=orientation,
        page=page,
        page_size=page_size,
        filter_mode=filter_mode,
        member_count=member_count,
        member=member,
        member_artist_id=member_artist_id,
        continent_id=continent_id,
        country_id=country_id,
        start_decade=start_decade,
        end_decade=end_decade,
        subgenre_id=subgenre_id,
        gender=gender,
        label=label,
        producer=producer,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/musicbrainz/search")
async def mb_search(q: str = Query(..., min_length=1)):
    return {"items": await search_artists(q, limit=3)}


@router.post("/bands/import")
async def import_band_from_mb(
    body: ImportBandBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    mbid = body.mbid.strip()
    if not mbid:
        raise HTTPException(400, "mbid required")
    existing = db.scalars(select(Band).where(Band.bnd_code == mbid)).first()
    if existing:
        return {"id": existing.bnd_id, "code": existing.bnd_code, "name": existing.bnd_name, "existing": True}
    try:
        data = await fetch_artist(mbid)
    except Exception as exc:
        raise HTTPException(502, f"MusicBrainz error: {exc}") from exc
    name = data.get("name") or "Unknown"
    life = data.get("life-span") or {}
    start = life.get("begin") or ""
    end = life.get("end") or ""
    aliases = ";".join(a.get("name", "") for a in data.get("aliases", []) if a.get("name"))
    from sqlalchemy import func

    next_id = (db.scalar(select(func.max(Band.bnd_id))) or 0) + 1
    row = Band(
        bnd_id=next_id,
        bnd_name=name,
        bnd_code=mbid,
        bnd_other_names=aliases or None,
        bnd_starting_dates=start or None,
        bnd_ending_dates=end or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.bnd_id, "code": row.bnd_code, "name": row.bnd_name, "existing": False}


@router.get("/bands", response_model=BandListOut)
def list_bands(
    db: Session = Depends(get_db),
    search: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(48, ge=1, le=200),
):
    items, total = crud.list_bands(db, search=search, page=page, page_size=page_size)
    return BandListOut(items=items, total=total, page=page, page_size=page_size)


@router.get("/bands/{band_id}", response_model=BandOut)
def get_band(band_id: int, db: Session = Depends(get_db)):
    row = crud.get_band(db, band_id)
    if not row:
        raise HTTPException(404, "Band not found")
    return crud.band_to_out(row)


@router.get("/bands/{band_id}/releases", response_model=ReleaseListOut)
def band_releases(band_id: int, db: Session = Depends(get_db)):
    if not crud.get_band(db, band_id):
        raise HTTPException(404, "Band not found")
    items = crud.list_releases_for_band(db, band_id)
    return ReleaseListOut(items=items, total=len(items))


@router.get("/bands/{band_id}/tracks", response_model=list[TrackOut])
def band_tracks(
    band_id: int,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    if not crud.get_band(db, band_id):
        raise HTTPException(404, "Band not found")
    return crud.list_tracks_for_band(db, band_id, limit=limit)


@router.get("/genres/{genre_name}/artists")
def genre_artists(genre_name: str, db: Session = Depends(get_db)):
    return {"items": artists_by_genre(db, genre_name)}


@router.get("/countries/{country_name}/artists")
def country_artists(country_name: str, db: Session = Depends(get_db)):
    from sqlalchemy import select

    from app.models import Band, Country

    rows = db.scalars(select(Band).order_by(Band.bnd_name)).all()
    from app.gallery import resolve_artist_card
    from app.music_dashboard import _parse_country_id

    items = []
    for b in rows:
        cid = _parse_country_id(b.bnd_fk_countries)
        if not cid:
            continue
        row = db.get(Country, cid)
        cname = row.cou_name if row else None
        if cname and cname.lower() == country_name.lower():
            card = resolve_artist_card(b.bnd_name, orientation="landscape")
            items.append(
                {
                    "id": b.bnd_id,
                    "name": b.bnd_name,
                    "photo_url": card.photo_url,
                    "logo_url": card.logo_url,
                    "icon_url": card.icon_url,
                    "era_year": card.era_year,
                    "show_name_on_hover": card.show_name_on_hover,
                }
            )
    return {"items": items}


@router.get("/playlists/library", response_model=list[PlaylistOut])
def playlists(
    playlist_type: int = Query(201),
    db: Session = Depends(get_db),
):
    return crud.list_playlists(db, playlist_type=playlist_type)


@router.get("/playlists")
def user_playlists(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {
        "items": list_user_playlists(
            db,
            user_id=user.usr_id,
            is_admin=is_admin_role(user.usr_role_id),
        )
    }


@router.get("/playlists/{playlist_id}/tracks")
def get_playlist_tracks(playlist_id: int, db: Session = Depends(get_db)):
    items = playlist_tracks(db, playlist_id)
    if not items:
        from app.models import Playlist

        if not db.get(Playlist, playlist_id):
            raise HTTPException(404, "Playlist not found")
    return {"items": items}
