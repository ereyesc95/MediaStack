from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Band,
    Book,
    ContentType,
    Episode,
    Filter,
    Game,
    MenuItem,
    Movie,
    Playlist,
    PlaylistData,
    Release,
    Reproduction,
    Season,
    Series,
    Track,
    User,
)
from app.services.passwords import hash_password, needs_upgrade, verify_password
from app.schemas import (
    BandOut,
    BookOut,
    ContentTypeOut,
    EpisodeOut,
    FilterOut,
    GameOut,
    MenuItemOut,
    MovieOut,
    PlaylistOut,
    ReleaseOut,
    SeasonOut,
    SeriesOut,
    TrackOut,
)


def _bio_excerpt(text: str | None, limit: int = 200) -> str | None:
    if not text:
        return None
    return text if len(text) <= limit else text[:limit] + "…"


def band_to_out(b: Band) -> BandOut:
    return BandOut(
        id=b.bnd_id,
        name=b.bnd_name,
        code=b.bnd_code,
        origin_place=b.bnd_origin_place,
        starting_dates=b.bnd_starting_dates,
        genres=b.bnd_fk_genres,
        bio_excerpt=_bio_excerpt(b.bnd_fk_images),
    )


def series_to_out(s: Series) -> SeriesOut:
    return SeriesOut(
        id=s.ser_id,
        name=s.ser_name,
        code=s.ser_code,
        starting_date=s.ser_starting_date,
        ending_date=s.ser_ending_date,
        studio=s.ser_studio,
    )


def list_content_types(db: Session) -> list[ContentTypeOut]:
    rows = db.scalars(select(ContentType).order_by(ContentType.cnt_id)).all()
    return [
        ContentTypeOut(id=r.cnt_id, name=r.cnt_name, sort_id=r.cnt_sort_id) for r in rows
    ]


def list_menu_items(db: Session, content_type_id: int) -> list[MenuItemOut]:
    prefix = str(content_type_id)
    rows = db.scalars(select(MenuItem).order_by(MenuItem.mei_order)).all()
    out: list[MenuItemOut] = []
    for r in rows:
        ctype = r.mei_fk_contenttype or ""
        if ctype == prefix or ctype.startswith(prefix):
            out.append(
                MenuItemOut(
                    id=r.mei_id,
                    name=r.mei_name,
                    content_type=ctype,
                    order=r.mei_order,
                )
            )
    return out


def list_filters(db: Session, content_type_id: int, menu_item_id: int | None = None) -> list[FilterOut]:
    q = select(Filter).where(Filter.fil_fk_contenttype == content_type_id)
    if menu_item_id is not None:
        q = q.where(Filter.fil_fk_menuitems == menu_item_id)
    q = q.order_by(Filter.fil_order)
    rows = db.scalars(q).all()
    return [
        FilterOut(
            id=r.fil_id,
            name=r.fil_name,
            data_type=r.fil_data_type,
            content_type_id=r.fil_fk_contenttype,
            menu_item_id=r.fil_fk_menuitems,
            parent_table=r.fil_parent_table,
            parent_field=r.fil_parent_field,
            order=r.fil_order,
        )
        for r in rows
    ]


def list_bands(
    db: Session,
    *,
    search: str = "",
    page: int = 1,
    page_size: int = 48,
) -> tuple[list[BandOut], int]:
    q = select(Band)
    if search.strip():
        term = f"%{search.strip()}%"
        q = q.where(
            or_(Band.bnd_name.ilike(term), Band.bnd_other_names.ilike(term))
        )
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(
        q.order_by(Band.bnd_name).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return [band_to_out(b) for b in rows], total


def get_band(db: Session, band_id: int) -> Band | None:
    return db.get(Band, band_id)


def list_releases_for_band(db: Session, band_id: int) -> list[ReleaseOut]:
    needle = str(band_id)
    rows = db.scalars(select(Release).order_by(Release.rel_date)).all()
    out: list[ReleaseOut] = []
    for r in rows:
        fk = r.rel_fk_bands or ""
        if fk == needle or needle in fk.split(";"):
            out.append(
                ReleaseOut(
                    id=r.rel_id,
                    title=r.rel_title,
                    band_ids=r.rel_fk_bands,
                    date=r.rel_date,
                    release_code=r.rel_release_code,
                )
            )
    return out


def list_tracks_for_band(db: Session, band_id: int, limit: int = 100) -> list[TrackOut]:
    needle = str(band_id)
    rows = db.scalars(select(Track).order_by(Track.tra_name).limit(limit * 3)).all()
    out: list[TrackOut] = []
    for t in rows:
        if (t.tra_band_id or "") != needle and needle not in (t.tra_band_id or "").split(";"):
            continue
        out.append(
            TrackOut(
                id=t.tra_id,
                name=t.tra_name,
                duration=t.tra_duration,
                band_id=t.tra_band_id,
            )
        )
        if len(out) >= limit:
            break
    return out


def list_playlists(db: Session, playlist_type: int = 201) -> list[PlaylistOut]:
    rows = db.scalars(
        select(Playlist).where(Playlist.pla_type == playlist_type).order_by(Playlist.pla_id)
    ).all()
    return [
        PlaylistOut(
            id=p.pla_id,
            name=p.pla_name,
            type_id=p.pla_type,
            description=p.pla_description,
        )
        for p in rows
    ]


def list_series(
    db: Session,
    *,
    search: str = "",
    page: int = 1,
    page_size: int = 48,
) -> tuple[list[SeriesOut], int]:
    q = select(Series)
    if search.strip():
        term = f"%{search.strip()}%"
        q = q.where(
            or_(Series.ser_name.ilike(term), Series.ser_other_names.ilike(term))
        )
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(
        q.order_by(Series.ser_name).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return [series_to_out(s) for s in rows], total


def get_series(db: Session, series_id: int) -> Series | None:
    return db.get(Series, series_id)


def list_seasons(db: Session, series_id: int) -> list[SeasonOut]:
    rows = db.scalars(
        select(Season)
        .where(Season.ssn_serie_id == series_id)
        .order_by(Season.ssn_number)
    ).all()
    return [
        SeasonOut(id=s.ssn_id, series_id=s.ssn_serie_id, name=s.ssn_name, number=s.ssn_number)
        for s in rows
    ]


def list_episodes(db: Session, season_id: int) -> list[EpisodeOut]:
    rows = db.scalars(
        select(Episode)
        .where(Episode.epi_season_id == season_id)
        .order_by(Episode.epi_number)
    ).all()
    return [
        EpisodeOut(
            id=e.epi_id,
            season_id=e.epi_season_id,
            number=e.epi_number,
            name=e.epi_name,
        )
        for e in rows
    ]


def authenticate_user(db: Session, username: str, password: str) -> User | None:
    row = db.scalar(
        select(User).where(
            or_(User.usr_name == username, User.usr_mail == username),
        )
    )
    if not row or not verify_password(password, row.usr_password):
        return None
    if needs_upgrade(row.usr_password):
        row.usr_password = hash_password(password)
        db.commit()
    return row


def register_user(
    db: Session,
    username: str,
    password: str,
    email: str | None = None,
) -> User:
    existing = db.scalar(select(User).where(User.usr_name == username))
    if existing:
        raise ValueError("Username already exists")
    max_id = db.scalar(select(func.max(User.usr_id))) or 0
    user = User(
        usr_id=max_id + 1,
        usr_name=username,
        usr_password=hash_password(password),
        usr_mail=email,
        usr_role_id=1,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_lastfm_key(db: Session) -> str | None:
    from app.config import settings
    from app.models import ApiAuth

    if settings.lastfm_api_key:
        return settings.lastfm_api_key
    row = db.scalar(
        select(ApiAuth).where(ApiAuth.api_name.in_(("Last.fm", "LastFM", "lastfm")))
    )
    if row and row.api_key_encrypted:
        return row.api_key_encrypted
    if row and row.api_token:
        return row.api_token
    return None


def get_setlistfm_key(db: Session) -> str | None:
    from app.config import settings
    from app.models import ApiAuth

    if settings.setlistfm_api_key:
        return settings.setlistfm_api_key
    row = db.scalar(
        select(ApiAuth).where(
            ApiAuth.api_name.in_(("Setlist.fm", "SetlistFM", "setlistfm"))
        )
    )
    if row and row.api_key_encrypted:
        return row.api_key_encrypted
    if row and row.api_token:
        return row.api_token
    return None


def get_tmdb_key(db: Session) -> str | None:
    from app.config import settings
    from app.models import ApiAuth

    if settings.tmdb_api_key:
        return settings.tmdb_api_key
    row = db.scalar(select(ApiAuth).where(ApiAuth.api_name == "TMDb"))
    if row and row.api_key_encrypted:
        return row.api_key_encrypted
    if row and row.api_token:
        return row.api_token
    return None


def record_play(
    db: Session,
    *,
    path: str,
    artist_id: int | None,
    title: str | None,
    release: str | None,
    media_type: int,
    user_id: int,
) -> Reproduction:
    from app.profile_scope import rep_user_filter
    from app.profiles import ADMIN_USER_ID

    q = select(Reproduction).where(
        Reproduction.rep_path == path,
        rep_user_filter(user_id),
    )
    row = db.scalar(q)
    if row:
        count = int(row.rep_reproductions or "0") + 1
        row.rep_reproductions = str(count)
        db.commit()
        db.refresh(row)
        return row
    max_id = db.scalar(select(func.max(Reproduction.rep_id))) or 0
    row = Reproduction(
        rep_id=max_id + 1,
        rep_title=title,
        rep_artist_id=artist_id,
        rep_release=release,
        rep_media_type=media_type,
        rep_reproductions="1",
        rep_path=path,
        rep_user_id=ADMIN_USER_ID if user_id == ADMIN_USER_ID else user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_recent_plays(
    db: Session, *, user_id: int, limit: int = 30
) -> list[Reproduction]:
    from app.profile_scope import rep_user_filter

    return list(
        db.scalars(
            select(Reproduction)
            .where(
                Reproduction.rep_media_type == 200,
                rep_user_filter(user_id),
            )
            .order_by(Reproduction.rep_id.desc())
            .limit(limit)
        ).all()
    )


def get_playlist_track(db: Session, track_id: int) -> PlaylistData | None:
    return db.get(PlaylistData, track_id)


def list_movies(
    db: Session, *, search: str = "", page: int = 1, page_size: int = 48
) -> tuple[list[MovieOut], int]:
    q = select(Movie)
    if search.strip():
        term = f"%{search.strip()}%"
        q = q.where(Movie.mov_title.ilike(term))
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(
        q.order_by(Movie.mov_title).offset((page - 1) * page_size).limit(page_size)
    ).all()
    items = [
        MovieOut(
            id=m.mov_id,
            title=m.mov_title,
            release_date=m.mov_release_date,
            genre_id=m.mov_genre_id,
        )
        for m in rows
    ]
    return items, total


def list_books(
    db: Session, *, search: str = "", page: int = 1, page_size: int = 48
) -> tuple[list[BookOut], int]:
    q = select(Book)
    if search.strip():
        term = f"%{search.strip()}%"
        q = q.where(Book.boo_title.ilike(term))
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(
        q.order_by(Book.boo_title).offset((page - 1) * page_size).limit(page_size)
    ).all()
    items = [
        BookOut(
            id=b.boo_id,
            title=b.boo_title,
            author_id=b.boo_author_id,
            release_date=b.boo_release_date,
            series_id=b.boo_series_id,
            number=b.boo_number,
        )
        for b in rows
    ]
    return items, total


def list_games(
    db: Session, *, search: str = "", page: int = 1, page_size: int = 48
) -> tuple[list[GameOut], int]:
    q = select(Game)
    if search.strip():
        term = f"%{search.strip()}%"
        q = q.where(Game.gam_name.ilike(term))
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(
        q.order_by(Game.gam_name).offset((page - 1) * page_size).limit(page_size)
    ).all()
    items = [
        GameOut(
            id=g.gam_id,
            name=g.gam_name,
            code=g.gam_code,
            release_date=g.gam_release_date,
            studio=g.gam_studio,
        )
        for g in rows
    ]
    return items, total
