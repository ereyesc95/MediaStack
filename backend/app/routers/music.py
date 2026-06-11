from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import crud
from app.config import settings
from app.database import get_db
from app.deps import get_current_user, get_optional_user, require_admin
from app.profiles import is_admin_role
from app.models import (
    Artist,
    ArtistParticipation,
    Band,
    Continent,
    EntityLink,
    EntityRelated,
    User,
)
from app.music_dashboard import (
    artists_by_genre,
    build_dashboard,
    list_artist_cards,
    list_user_playlists,
    playlist_tracks,
)
from app.music_filters import filter_options, search_roster_artists, search_roster_bands
from app.services.musicbrainz import fetch_artist, search_artists
from app.schemas import BandListOut, BandOut, PlaylistOut, ReleaseListOut, TrackOut

router = APIRouter(prefix="/api/music", tags=["music"])


class ImportBandBody(BaseModel):
    mbid: str


class RefreshMetadataBody(BaseModel):
    include_bio: bool = False


class PatchBioBody(BaseModel):
    bio: str


class PatchBandAboutBody(BaseModel):
    bio: str | None = None
    aliases: str | None = None
    origin_city: str | None = None
    country_id: int | None = None
    activity_start: str | None = None
    activity_end: str | None = None


class PatchArtistBody(BaseModel):
    name: str | None = None
    stage_name: str | None = None
    aliases: str | None = None
    birth_date: str | None = None
    birth_place: str | None = None
    birth_country_id: int | None = None
    death_date: str | None = None
    mbid: str | None = None


class PatchParticipationBody(BaseModel):
    start: str | None = None
    end: str | None = None
    roles_text: str | None = None
    is_official: bool | None = None
    is_founding: bool | None = None
    is_former: bool | None = None


class LinkBody(BaseModel):
    category: str
    label: str
    url: str
    logo_key: str | None = None


class PatchLinkBody(BaseModel):
    category: str | None = None
    label: str | None = None
    url: str | None = None
    logo_key: str | None = None
    clear_logo_upload: bool = False


class CreateParticipationBody(BaseModel):
    artist_id: int | None = None
    name: str | None = None
    mbid: str | None = None
    start: str | None = None
    end: str | None = None
    roles_text: str | None = None
    is_official: bool = True
    is_founding: bool = False
    is_former: bool = False


class AddSimilarBody(BaseModel):
    name: str
    mbid: str | None = None


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


@router.get("/filters/roster-bands")
def music_roster_bands(
    db: Session = Depends(get_db),
    q: str = Query("", min_length=1),
    limit: int = Query(25, ge=1, le=50),
):
    return {"items": search_roster_bands(db, q, limit=limit)}


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


@router.get("/bands/{band_id}/overview")
async def band_overview(
    band_id: int,
    orientation: str = Query("landscape"),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    from app.band_lineup_import import ensure_lineup_imported_sync, import_band_lineup
    from app.band_overview import build_band_overview
    from app.crud import get_band

    row = get_band(db, band_id)
    if not row:
        raise HTTPException(404, "Band not found")
    if not row.bnd_lineup_imported_at and row.bnd_code:
        result = await import_band_lineup(db, row, replace_non_manual=True)
        if not result.get("ok"):
            ensure_lineup_imported_sync(db, row)  # fallback no-op path
    admin = is_admin_role(user.usr_role_id) if user else False
    card_orientation = "portrait" if orientation == "portrait" else "landscape"
    data = build_band_overview(
        db, band_id, is_admin=admin, card_orientation=card_orientation
    )
    if not data:
        raise HTTPException(404, "Band not found")
    return data


@router.get("/artists/{artist_id}")
def get_artist_details(
    artist_id: int,
    band_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    from app.artist_details import build_artist_details

    root = Path(settings.media_root) if settings.media_root else None
    media_root = root if root and root.is_dir() else None
    data = build_artist_details(
        db, artist_id, media_root=media_root, band_id=band_id
    )
    if not data:
        raise HTTPException(404, "Artist not found")
    return data


@router.post("/artists/{artist_id}/photo")
async def upload_artist_photo(
    artist_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.artist_admin import save_artist_photo_file

    artist = db.get(Artist, artist_id)
    if not artist:
        raise HTTPException(404, "Artist not found")
    root = Path(settings.media_root) if settings.media_root else None
    if not root or not root.is_dir():
        raise HTTPException(400, "Media root not configured")
    raw = await file.read()
    if not raw or len(raw) > 5_000_000:
        raise HTTPException(400, "Image must be under 5 MB")
    content_type = (file.content_type or "").lower()
    ext = ".jpg"
    if "png" in content_type:
        ext = ".png"
    elif "webp" in content_type:
        ext = ".webp"
    elif "jpeg" in content_type:
        ext = ".jpeg"
    url = save_artist_photo_file(artist, root, raw, ext)
    artist.art_photo_url = url
    artist.art_photo_source = "local"
    artist.art_photo_manual = 1
    from datetime import datetime, timezone

    artist.art_photo_fetched_at = datetime.now(timezone.utc).isoformat()
    db.commit()
    return {"ok": True, "photo_url": url}


@router.patch("/artists/{artist_id}")
def patch_artist_endpoint(
    artist_id: int,
    body: PatchArtistBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.artist_admin import patch_artist

    artist = db.get(Artist, artist_id)
    if not artist:
        raise HTTPException(404, "Artist not found")
    patch_artist(
        db,
        artist,
        name=body.name,
        stage_name=body.stage_name,
        aliases=body.aliases,
        birth_date=body.birth_date,
        birth_place=body.birth_place,
        birth_country_id=body.birth_country_id,
        death_date=body.death_date,
        mbid=body.mbid,
    )
    return {"ok": True}


@router.get("/filters/instruments")
def music_instrument_options(db: Session = Depends(get_db)):
    from app.lineup_instruments import instrument_filter_options

    return {"groups": instrument_filter_options(db)}


@router.post("/bands/{band_id}/participations")
def create_participation_endpoint(
    band_id: int,
    body: CreateParticipationBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.artist_admin import create_participation

    band = crud.get_band(db, band_id)
    if not band:
        raise HTTPException(404, "Band not found")
    try:
        arp = create_participation(
            db,
            band,
            artist_id=body.artist_id,
            name=body.name,
            mbid=body.mbid,
            start=body.start,
            end=body.end,
            roles_text=body.roles_text,
            is_official=body.is_official,
            is_founding=body.is_founding,
            is_former=body.is_former,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "participation_id": arp.arp_id, "artist_id": arp.arp_fk_artists}


@router.patch("/bands/{band_id}/participations/{arp_id}")
def patch_participation_endpoint(
    band_id: int,
    arp_id: int,
    body: PatchParticipationBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.artist_admin import patch_participation

    arp = db.get(ArtistParticipation, arp_id)
    if not arp or arp.arp_fk_bands != band_id:
        raise HTTPException(404, "Participation not found")
    patch_participation(
        db,
        arp,
        start=body.start,
        end=body.end,
        roles_text=body.roles_text,
        is_official=body.is_official,
        is_founding=body.is_founding,
        is_former=body.is_former,
    )
    return {"ok": True}


@router.delete("/bands/{band_id}/participations/{arp_id}")
def delete_participation_endpoint(
    band_id: int,
    arp_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.artist_admin import delete_participation

    arp = db.get(ArtistParticipation, arp_id)
    if not arp or arp.arp_fk_bands != band_id:
        raise HTTPException(404, "Participation not found")
    delete_participation(db, arp)
    return {"ok": True}


@router.patch("/bands/{band_id}/about")
def patch_band_about_endpoint(
    band_id: int,
    body: PatchBandAboutBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.artist_admin import patch_band_about

    band = crud.get_band(db, band_id)
    if not band:
        raise HTTPException(404, "Band not found")
    patch_band_about(
        db,
        band,
        bio=body.bio,
        aliases=body.aliases,
        origin_city=body.origin_city,
        country_id=body.country_id,
        activity_start=body.activity_start,
        activity_end=body.activity_end,
    )
    return {"ok": True}


@router.post("/bands/{band_id}/refresh-lineup")
async def band_refresh_lineup(
    band_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.band_lineup_import import import_band_lineup

    row = crud.get_band(db, band_id)
    if not row:
        raise HTTPException(404, "Band not found")
    return await import_band_lineup(db, row, replace_non_manual=True)


@router.get("/filters/link-catalog")
def link_catalog():
    from app.link_catalog import catalog_entries

    return {"items": catalog_entries()}


@router.post("/bands/{band_id}/refresh-links")
async def band_refresh_links(
    band_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.band_overview import _is_solo, _solo_performer
    from app.entity_links import refresh_artist_links_merge, refresh_band_links_merge

    row = crud.get_band(db, band_id)
    if not row:
        raise HTTPException(404, "Band not found")
    root = Path(settings.media_root) if settings.media_root else None
    media_root = root if root and root.is_dir() else None
    if _is_solo(db, row):
        perf = _solo_performer(db, row, media_root)
        if not perf:
            return {"ok": False, "error": "Solo performer not found"}
        return await refresh_artist_links_merge(db, perf["id"], None)
    return await refresh_band_links_merge(db, row)


@router.post("/bands/{band_id}/links")
def create_band_link(
    band_id: int,
    body: LinkBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.entity_links import create_link

    row = crud.get_band(db, band_id)
    if not row:
        raise HTTPException(404, "Band not found")
    try:
        link = create_link(
            db,
            band_id=band_id,
            category=body.category,
            label=body.label,
            url=body.url,
            logo_key=body.logo_key,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "id": link.lnk_id}


@router.patch("/bands/{band_id}/links/{link_id}")
def patch_band_link(
    band_id: int,
    link_id: int,
    body: PatchLinkBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.entity_links import patch_link

    link = db.get(EntityLink, link_id)
    if not link or link.lnk_fk_bands != band_id or link.lnk_hidden:
        raise HTTPException(404, "Link not found")
    try:
        patch_link(
            db,
            link,
            category=body.category,
            label=body.label,
            url=body.url,
            logo_key=body.logo_key,
            clear_logo_path=body.clear_logo_upload,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True}


@router.delete("/bands/{band_id}/links/{link_id}")
def delete_band_link(
    band_id: int,
    link_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.entity_links import hide_link

    link = db.get(EntityLink, link_id)
    if not link or link.lnk_fk_bands != band_id or link.lnk_hidden:
        raise HTTPException(404, "Link not found")
    hide_link(db, link)
    return {"ok": True}


@router.post("/bands/{band_id}/links/{link_id}/logo")
async def upload_band_link_logo(
    band_id: int,
    link_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.entity_links import save_link_logo_file

    link = db.get(EntityLink, link_id)
    if not link or link.lnk_fk_bands != band_id or link.lnk_hidden:
        raise HTTPException(404, "Link not found")
    root = Path(settings.media_root) if settings.media_root else None
    if not root or not root.is_dir():
        raise HTTPException(400, "Media root not configured")
    raw = await file.read()
    if not raw or len(raw) > 2_000_000:
        raise HTTPException(400, "Image must be under 2 MB")
    content_type = (file.content_type or "").lower()
    ext = ".png"
    if "svg" in content_type:
        ext = ".svg"
    elif "webp" in content_type:
        ext = ".webp"
    elif "jpeg" in content_type or "jpg" in content_type:
        ext = ".jpg"
    rel = save_link_logo_file(link, root, raw, ext)
    db.commit()
    return {"ok": True, "logo_path": rel}


@router.post("/artists/{artist_id}/links")
def create_artist_link(
    artist_id: int,
    body: LinkBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.entity_links import create_link

    if not db.get(Artist, artist_id):
        raise HTTPException(404, "Artist not found")
    try:
        link = create_link(
            db,
            artist_id=artist_id,
            category=body.category,
            label=body.label,
            url=body.url,
            logo_key=body.logo_key,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "id": link.lnk_id}


@router.patch("/artists/{artist_id}/links/{link_id}")
def patch_artist_link(
    artist_id: int,
    link_id: int,
    body: PatchLinkBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.entity_links import patch_link

    link = db.get(EntityLink, link_id)
    if not link or link.lnk_fk_artists != artist_id or link.lnk_hidden:
        raise HTTPException(404, "Link not found")
    try:
        patch_link(
            db,
            link,
            category=body.category,
            label=body.label,
            url=body.url,
            logo_key=body.logo_key,
            clear_logo_path=body.clear_logo_upload,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True}


@router.delete("/artists/{artist_id}/links/{link_id}")
def delete_artist_link(
    artist_id: int,
    link_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.entity_links import hide_link

    link = db.get(EntityLink, link_id)
    if not link or link.lnk_fk_artists != artist_id or link.lnk_hidden:
        raise HTTPException(404, "Link not found")
    hide_link(db, link)
    return {"ok": True}


@router.post("/artists/{artist_id}/links/{link_id}/logo")
async def upload_artist_link_logo(
    artist_id: int,
    link_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.entity_links import save_link_logo_file

    link = db.get(EntityLink, link_id)
    if not link or link.lnk_fk_artists != artist_id or link.lnk_hidden:
        raise HTTPException(404, "Link not found")
    root = Path(settings.media_root) if settings.media_root else None
    if not root or not root.is_dir():
        raise HTTPException(400, "Media root not configured")
    raw = await file.read()
    if not raw or len(raw) > 2_000_000:
        raise HTTPException(400, "Image must be under 2 MB")
    content_type = (file.content_type or "").lower()
    ext = ".png"
    if "svg" in content_type:
        ext = ".svg"
    elif "webp" in content_type:
        ext = ".webp"
    elif "jpeg" in content_type or "jpg" in content_type:
        ext = ".jpg"
    rel = save_link_logo_file(link, root, raw, ext)
    db.commit()
    return {"ok": True, "logo_path": rel}


def _solo_artist_for_band(db: Session, band: Band) -> Artist | None:
    from app.band_overview import _is_solo, _solo_performer

    if not _is_solo(db, band):
        return None
    root = Path(settings.media_root) if settings.media_root else None
    media_root = root if root and root.is_dir() else None
    perf = _solo_performer(db, band, media_root)
    if not perf:
        return None
    return db.get(Artist, perf["id"])


@router.post("/bands/{band_id}/resolve-related-photos")
async def band_resolve_related_photos(
    band_id: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    from app.entity_related import resolve_related_photos

    row = crud.get_band(db, band_id)
    if not row:
        raise HTTPException(404, "Band not found")
    solo = _solo_artist_for_band(db, row)
    return await resolve_related_photos(db, band=row, artist=solo)


@router.post("/bands/{band_id}/fetch-related")
async def band_fetch_related(
    band_id: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    from app.entity_related import ensure_related_fetched

    row = crud.get_band(db, band_id)
    if not row:
        raise HTTPException(404, "Band not found")
    solo = _solo_artist_for_band(db, row)
    return await ensure_related_fetched(db, band=row, artist=solo)


@router.post("/bands/{band_id}/refresh-related-similar")
async def band_refresh_related_similar(
    band_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.entity_related import refresh_similar_for_artist, refresh_similar_for_band

    row = crud.get_band(db, band_id)
    if not row:
        raise HTTPException(404, "Band not found")
    solo = _solo_artist_for_band(db, row)
    if solo:
        return await refresh_similar_for_artist(db, solo)
    return await refresh_similar_for_band(db, row, first_fetch=False)


@router.post("/bands/{band_id}/refresh-related-participations")
async def band_refresh_related_participations(
    band_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.entity_related import (
        refresh_participations_for_artist,
        refresh_participations_for_band,
    )

    row = crud.get_band(db, band_id)
    if not row:
        raise HTTPException(404, "Band not found")
    solo = _solo_artist_for_band(db, row)
    if solo:
        return await refresh_participations_for_artist(db, solo)
    return await refresh_participations_for_band(db, row)


@router.post("/bands/{band_id}/related/similar")
async def band_add_similar(
    band_id: int,
    body: AddSimilarBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.entity_related import add_similar_manual

    row = crud.get_band(db, band_id)
    if not row:
        raise HTTPException(404, "Band not found")
    solo = _solo_artist_for_band(db, row)
    erl = await add_similar_manual(
        db,
        band_id=None if solo else band_id,
        artist_id=solo.art_id if solo else None,
        name=body.name.strip(),
        mbid=body.mbid,
    )
    return {"ok": True, "id": erl.erl_id}


@router.delete("/bands/{band_id}/related/{erl_id}")
def band_delete_related(
    band_id: int,
    erl_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.entity_related import hide_related

    row = crud.get_band(db, band_id)
    if not row:
        raise HTTPException(404, "Band not found")
    erl = db.get(EntityRelated, erl_id)
    if not erl or erl.erl_hidden:
        raise HTTPException(404, "Related entry not found")
    solo = _solo_artist_for_band(db, row)
    if solo:
        if erl.erl_fk_artists != solo.art_id:
            raise HTTPException(404, "Related entry not found")
    elif erl.erl_fk_bands != band_id:
        raise HTTPException(404, "Related entry not found")
    hide_related(db, erl)
    return {"ok": True}


@router.post("/bands/{band_id}/refresh-photos")
async def band_refresh_photos(
    band_id: int,
    force: bool = Query(False),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from pathlib import Path

    from app.artist_photo import refresh_band_member_photos
    from app.config import settings
    from app.models import ArtistParticipation

    row = crud.get_band(db, band_id)
    if not row:
        raise HTTPException(404, "Band not found")
    root = Path(settings.media_root) if settings.media_root else None
    media_root = root if root and root.is_dir() else None
    member_ids = {
        arp.arp_fk_artists
        for arp in db.scalars(
            select(ArtistParticipation).where(
                ArtistParticipation.arp_fk_bands == band_id
            )
        ).all()
        if arp.arp_fk_artists
    }
    resolved = await refresh_band_member_photos(
        db, member_ids, media_root=media_root, force=force
    )
    return {"ok": True, "resolved": resolved}


@router.post("/bands/{band_id}/refresh-metadata")
async def band_refresh_metadata(
    band_id: int,
    body: RefreshMetadataBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.band_refresh import refresh_band_metadata

    row = crud.get_band(db, band_id)
    if not row:
        raise HTTPException(404, "Band not found")
    return await refresh_band_metadata(db, row, include_bio=body.include_bio)


@router.post("/bands/{band_id}/rescan-library")
def band_rescan_library(
    band_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.band_refresh import rescan_band_library

    row = crud.get_band(db, band_id)
    if not row:
        raise HTTPException(404, "Band not found")
    return rescan_band_library(db, row)


@router.patch("/bands/{band_id}/bio")
def band_patch_bio(
    band_id: int,
    body: PatchBioBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    row = crud.get_band(db, band_id)
    if not row:
        raise HTTPException(404, "Band not found")
    row.bnd_fk_images = body.bio.strip()
    row.bnd_bio_manual = 1
    row.bnd_bio_source = "manual"
    db.commit()
    return {"ok": True}


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
