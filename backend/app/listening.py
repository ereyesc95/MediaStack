"""Listening days — streaks + year Wrapped from dated play logs."""
from __future__ import annotations

from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.gallery import resolve_artist_card
from app.models import Band, Country, ListeningDayPlay
from app.play_stats import is_quiz_play_title, subgenre_image_url
from app.profiles import ADMIN_USER_ID


def _today_iso() -> str:
    return date.today().isoformat()


def _scoped_user_id(user_id: int) -> int:
    return ADMIN_USER_ID if user_id == ADMIN_USER_ID else user_id


def record_listening_day(
    db: Session,
    *,
    user_id: int,
    path: str,
    artist_id: int | None,
    title: str | None,
    release: str | None,
    play_date: str | None = None,
) -> None:
    """Upsert a dated play for streaks / Wrapped. Skips quiz titles."""
    if is_quiz_play_title(title):
        return
    rel = (path or "").replace("\\", "/").strip()
    if not rel:
        return
    day = (play_date or _today_iso()).strip()[:10]
    if len(day) < 10:
        day = _today_iso()
    uid = _scoped_user_id(user_id)
    row = db.scalar(
        select(ListeningDayPlay).where(
            ListeningDayPlay.ldp_user_id == uid,
            ListeningDayPlay.ldp_date == day,
            ListeningDayPlay.ldp_path == rel,
        )
    )
    if row:
        row.ldp_count = int(row.ldp_count or 0) + 1
        if title and not row.ldp_title:
            row.ldp_title = title
        if release and not row.ldp_release:
            row.ldp_release = release
        if artist_id and not row.ldp_artist_id:
            row.ldp_artist_id = artist_id
    else:
        row = ListeningDayPlay(
            ldp_user_id=uid,
            ldp_date=day,
            ldp_path=rel,
            ldp_artist_id=artist_id,
            ldp_title=title,
            ldp_release=release,
            ldp_count=1,
        )
        db.add(row)
    db.commit()


def _user_days(db: Session, user_id: int) -> list[date]:
    uid = _scoped_user_id(user_id)
    rows = db.scalars(
        select(ListeningDayPlay.ldp_date)
        .where(ListeningDayPlay.ldp_user_id == uid)
        .distinct()
        .order_by(ListeningDayPlay.ldp_date.desc())
    ).all()
    out: list[date] = []
    for raw in rows:
        try:
            out.append(date.fromisoformat(str(raw)[:10]))
        except ValueError:
            continue
    return out


def _streak_from_days(days: list[date], *, today: date | None = None) -> tuple[int, int]:
    """Return (current_streak, longest_streak). Current may include yesterday if not played today."""
    if not days:
        return 0, 0
    uniq = sorted(set(days), reverse=True)
    longest = 1
    run = 1
    for i in range(1, len(uniq)):
        if uniq[i - 1] - uniq[i] == timedelta(days=1):
            run += 1
            longest = max(longest, run)
        else:
            run = 1
    longest = max(longest, run)

    anchor = today or date.today()
    if uniq[0] not in (anchor, anchor - timedelta(days=1)):
        return 0, longest
    current = 1
    expect = uniq[0] - timedelta(days=1)
    for d in uniq[1:]:
        if d == expect:
            current += 1
            expect = d - timedelta(days=1)
        else:
            break
    return current, longest


def build_streaks(db: Session, user_id: int) -> dict[str, Any]:
    days = _user_days(db, user_id)
    today = date.today()
    current, longest = _streak_from_days(days, today=today)
    last = days[0].isoformat() if days else None
    month_ago = (today - timedelta(days=29)).isoformat()
    uid = _scoped_user_id(user_id)
    active_30 = db.scalar(
        select(func.count(func.distinct(ListeningDayPlay.ldp_date))).where(
            ListeningDayPlay.ldp_user_id == uid,
            ListeningDayPlay.ldp_date >= month_ago,
        )
    ) or 0
    year_start = f"{today.year:04d}-01-01"
    active_year = db.scalar(
        select(func.count(func.distinct(ListeningDayPlay.ldp_date))).where(
            ListeningDayPlay.ldp_user_id == uid,
            ListeningDayPlay.ldp_date >= year_start,
        )
    ) or 0
    plays_year = db.scalar(
        select(func.coalesce(func.sum(ListeningDayPlay.ldp_count), 0)).where(
            ListeningDayPlay.ldp_user_id == uid,
            ListeningDayPlay.ldp_date >= year_start,
        )
    ) or 0
    return {
        "current_streak": current,
        "longest_streak": longest,
        "last_play_date": last,
        "active_days_30": int(active_30),
        "active_days_year": int(active_year),
        "plays_year": int(plays_year),
        "year": today.year,
    }


def _year_rows(db: Session, user_id: int, year: int) -> list[ListeningDayPlay]:
    uid = _scoped_user_id(user_id)
    start = f"{year:04d}-01-01"
    end = f"{year:04d}-12-31"
    return list(
        db.scalars(
            select(ListeningDayPlay).where(
                ListeningDayPlay.ldp_user_id == uid,
                ListeningDayPlay.ldp_date >= start,
                ListeningDayPlay.ldp_date <= end,
            )
        ).all()
    )


def build_wrapped(db: Session, user_id: int, *, year: int | None = None) -> dict[str, Any]:
    """Year listening recap from dated plays (empty until plays after feature ship)."""
    from app.band_library import cover_url_for_track_path
    from app.music_dashboard import _clean_track_title, _parse_country_id, _resolve_subgenre_name

    y = year or date.today().year
    rows = _year_rows(db, user_id, y)
    media_root = Path(settings.media_root) if settings.media_root else None

    path_counts: Counter[str] = Counter()
    path_meta: dict[str, ListeningDayPlay] = {}
    artist_counts: Counter[int] = Counter()
    day_set: set[str] = set()
    total_plays = 0
    for r in rows:
        n = int(r.ldp_count or 0)
        if n <= 0:
            continue
        total_plays += n
        day_set.add(r.ldp_date or "")
        if r.ldp_path:
            path_counts[r.ldp_path] += n
            prev = path_meta.get(r.ldp_path)
            if not prev or n >= int(prev.ldp_count or 0):
                path_meta[r.ldp_path] = r
        if r.ldp_artist_id:
            artist_counts[r.ldp_artist_id] += n

    top_tracks = []
    for i, (path, count) in enumerate(path_counts.most_common(10)):
        meta = path_meta.get(path)
        artist_name = None
        aid = meta.ldp_artist_id if meta else None
        if aid:
            band = db.get(Band, aid)
            artist_name = band.bnd_name if band else None
        raw_title = (meta.ldp_title if meta else None) or Path(path).stem
        cover_url = (
            cover_url_for_track_path(path, media_root) if media_root else None
        )
        top_tracks.append(
            {
                "id": i + 1,
                "title": _clean_track_title(raw_title),
                "title_full": raw_title,
                "artist_id": aid,
                "artist_name": artist_name,
                "artist_name_full": artist_name,
                "play_count": count,
                "path": path,
                "release": meta.ldp_release if meta else None,
                "cover_url": cover_url,
            }
        )

    top_artists = []
    for aid, count in artist_counts.most_common(10):
        band = db.get(Band, aid)
        if not band:
            continue
        card = resolve_artist_card(
            band.bnd_name, orientation="round", user_id=user_id
        )
        top_artists.append(
            {
                "id": band.bnd_id,
                "name": band.bnd_name,
                "play_count": count,
                "photo_url": card.photo_url,
                "logo_url": card.logo_url,
                "icon_url": card.icon_url,
                "show_name_on_hover": False,
            }
        )

    genre_counts: Counter[int] = Counter()
    country_counts: Counter[int] = Counter()
    for aid, weight in artist_counts.items():
        band = db.get(Band, aid)
        if not band:
            continue
        for part in (band.bnd_fk_subgenres or "").split(";"):
            part = part.strip()
            if part.isdigit():
                genre_counts[int(part)] += weight
        cid = _parse_country_id(band.bnd_fk_countries)
        if cid:
            country_counts[cid] += weight

    top_genres = []
    for gid, count in genre_counts.most_common(8):
        name = _resolve_subgenre_name(db, gid)
        if name:
            top_genres.append(
                {
                    "id": gid,
                    "name": name,
                    "play_count": count,
                    "image_url": subgenre_image_url(name),
                }
            )

    top_countries = []
    for cid, count in country_counts.most_common(8):
        row = db.get(Country, cid)
        if row and row.cou_name:
            top_countries.append(
                {
                    "id": cid,
                    "name": row.cou_name,
                    "iso": (row.cou_iso or "").lower(),
                    "play_count": count,
                }
            )

    streaks = build_streaks(db, user_id)
    return {
        "year": y,
        "total_plays": total_plays,
        "active_days": len(day_set),
        "current_streak": streaks["current_streak"],
        "longest_streak": streaks["longest_streak"],
        "top_tracks": top_tracks,
        "top_artists": top_artists,
        "top_genres": top_genres,
        "top_countries": top_countries,
        "empty": total_plays == 0,
    }
