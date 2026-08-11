"""Admin mutations for Movies film about + cast + trailer DB persistence."""
from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.franchise_index import normalize_franchise_slug
from app.models import Country
from app.movies_index import build_film_detail, find_film_dir, _film_id
from app.movies_refresh import (
    ensure_movie_work,
    find_movie_work,
    _load_meta,
    _save_meta,
)
from app.series_admin import (
    _clean_genres,
    _clean_languages,
    _member_id_matches,
    _periods_from_activity,
)
from app.series_languages import normalize_lang_code


def _resolve_film_row(db: Session, film_id: str):
    """Return (row, meta, films_meta, film_meta, fid, film_dir) or raise ValueError."""
    root = Path(settings.media_root or "")
    found = find_film_dir(film_id, root if root.is_dir() else None)
    if not found:
        raise ValueError(f"Film not found: {film_id}")
    film_dir, work_dir, _letter = found
    detail = build_film_detail(film_id, root if root.is_dir() else None)
    work = (detail or {}).get("work") or {}
    work_slug = (
        work.get("id")
        or normalize_franchise_slug(work_dir.name)
        or work_dir.name.casefold()
    )
    fid = (detail or {}).get("id") or _film_id(
        film_dir.relative_to(root).as_posix() if root.is_dir() else film_dir.name
    )
    row = find_movie_work(db, work_slug) or ensure_movie_work(
        db,
        work_slug=work_slug,
        name=work_dir.name,
        folder_path=work.get("folder_path"),
    )
    meta = _load_meta(row)
    films_meta = meta.get("films") if isinstance(meta.get("films"), dict) else {}
    if not isinstance(films_meta, dict):
        films_meta = {}
    film_meta = (
        dict(films_meta.get(fid))
        if isinstance(films_meta.get(fid), dict)
        else {}
    )
    if not film_meta and isinstance(films_meta.get(film_id), dict):
        film_meta = dict(films_meta.get(film_id))
    return row, meta, films_meta, film_meta, fid, film_dir


def _split_semicolon(raw: str | None) -> list[str]:
    if raw is None:
        return []
    text = str(raw).strip().replace(",", ";")
    return [p.strip() for p in text.split(";") if p.strip()]


def patch_movie_work_about(
    db: Session,
    work_id: str,
    *,
    bio: str | None = None,
    writers: str | None = None,
) -> dict:
    """Patch franchise-level bio / authors for a Movies work (independent of Series)."""
    root = Path(settings.media_root or "")
    from app.movies_index import find_work_dir, build_work_detail

    found = find_work_dir(work_id, root if root.is_dir() else None)
    if not found:
        raise ValueError(f"Movies franchise not found: {work_id}")
    work_dir, _letter = found
    detail = build_work_detail(work_id, root if root.is_dir() else None) or {}
    slug = detail.get("slug") or normalize_franchise_slug(work_dir.name) or work_dir.name.casefold()
    row = find_movie_work(db, slug) or ensure_movie_work(
        db,
        work_slug=slug,
        name=work_dir.name,
        folder_path=detail.get("folder_path"),
    )
    meta = _load_meta(row)
    if bio is not None:
        meta["bio"] = bio.strip()
        meta["bio_manual"] = True
        meta["bio_source"] = "manual"
    if writers is not None:
        meta["writers"] = _split_semicolon(writers)
        meta["authors"] = meta["writers"]
    _save_meta(row, meta)
    db.commit()
    return {"ok": True, "work_id": slug}


def _apply_country(db: Session, film_meta: dict, country_id: int | None) -> None:
    if country_id is None:
        return
    if country_id:
        crow = db.get(Country, country_id)
        iso = crow.cou_iso.lower() if crow and crow.cou_iso else None
        film_meta["country_id"] = int(country_id)
        film_meta["country_iso"] = iso
        film_meta["country_name"] = crow.cou_name if crow else None
        if iso:
            film_meta["origin_countries"] = [iso]
        else:
            film_meta["origin_countries"] = []
    else:
        film_meta["country_id"] = None
        film_meta["country_iso"] = None
        film_meta["country_name"] = None
        film_meta["origin_countries"] = []


def patch_film_about(
    db: Session,
    film_id: str,
    *,
    bio: str | None = None,
    writers: str | None = None,
    publishers: str | None = None,
    country_id: int | None = None,
    languages: list[str] | None = None,
    genres: list[dict] | list[str] | None = None,
    activity_start: str | None = None,
    activity_end: str | None = None,
    directors: list[str] | None = None,
) -> dict:
    row, meta, films_meta, film_meta, fid, _film_dir = _resolve_film_row(
        db, film_id
    )

    if bio is not None:
        film_meta["overview"] = bio.strip()

    if writers is not None:
        writer_list = _split_semicolon(writers)
        film_meta["writers"] = writer_list
        if directors is None:
            film_meta["directors"] = list(writer_list)

    if directors is not None:
        if isinstance(directors, str):
            film_meta["directors"] = _split_semicolon(directors)
        else:
            film_meta["directors"] = [
                str(d).strip() for d in directors if d and str(d).strip()
            ]

    if publishers is not None:
        film_meta["publishers"] = _split_semicolon(publishers)

    if genres is not None:
        film_meta["genres"] = _clean_genres(genres)

    if languages is not None:
        cleaned = _clean_languages(languages)
        film_meta["languages"] = cleaned
        if cleaned:
            film_meta["original_language"] = cleaned[0]

    if country_id is not None:
        _apply_country(db, film_meta, country_id)

    if activity_start is not None or activity_end is not None:
        periods = _periods_from_activity(activity_start, activity_end)
        film_meta["activity_periods"] = periods
        first_start = (periods[0].get("start") if periods else None) or None
        if activity_start is not None:
            first = (str(activity_start).split(";")[0] or "").strip()
            film_meta["release_date"] = first or first_start

    films_meta[fid] = film_meta
    meta["films"] = films_meta
    _save_meta(row, meta)
    db.commit()
    return {"ok": True, "film_id": fid}


def save_film_trailer_db(db: Session, film_id: str, url: str | None) -> str | None:
    from app.movies_trailer import save_film_trailer_url

    row, meta, films_meta, film_meta, fid, _film_dir = _resolve_film_row(
        db, film_id
    )
    saved = save_film_trailer_url(None, url)
    film_meta["trailer_url"] = saved
    films_meta[fid] = film_meta
    meta["films"] = films_meta
    _save_meta(row, meta)
    db.commit()
    return saved


def get_film_trailer_db(db: Session, film_id: str) -> str | None:
    try:
        _row, _meta, _films_meta, film_meta, _fid, _film_dir = _resolve_film_row(
            db, film_id
        )
    except Exception:
        return None
    url = film_meta.get("trailer_url")
    return url.strip() if isinstance(url, str) and url.strip() else None


def _load_film_cast(film_meta: dict) -> dict:
    cast = film_meta.get("cast") if isinstance(film_meta.get("cast"), dict) else {}
    if not isinstance(cast, dict):
        cast = {}
    chars = [
        m
        for m in (cast.get("characters") or cast.get("animated") or [])
        if isinstance(m, dict)
    ]
    staff = [
        m
        for m in (cast.get("staff") or cast.get("people") or [])
        if isinstance(m, dict)
    ]
    cast["characters"] = chars
    cast["staff"] = staff
    cast["animated"] = chars
    cast["people"] = staff
    return cast


def add_film_cast_member(
    db: Session,
    film_id: str,
    *,
    kind: str = "characters",
    name: str,
    character: str | None = None,
    photo_url: str | None = None,
    character_photo_url: str | None = None,
    roles: list[str] | None = None,
    language: str | None = None,
) -> dict:
    row, meta, films_meta, film_meta, fid, _film_dir = _resolve_film_row(
        db, film_id
    )
    cast = _load_film_cast(film_meta)
    key = "characters" if kind in ("characters", "animated") else "staff"
    lang = normalize_lang_code(language) or language or "en"
    member: dict = {
        "id": f"manual-{uuid.uuid4().hex[:10]}",
        "name": name.strip(),
        "character": (character or "").strip() or None,
        "photo_url": photo_url or character_photo_url,
        "roles": roles or [],
        "manual": True,
    }
    if key == "characters":
        char_name = (character or name).strip()
        role_names = [r.strip() for r in (roles or []) if r and str(r).strip()]
        actor_name = (
            name.strip()
            if character and name.strip() and name.strip() != char_name
            else (role_names[0] if role_names else None)
        )
        if actor_name and actor_name not in role_names:
            role_names = [actor_name, *role_names]
        member["name"] = char_name
        member["character"] = char_name
        member["photo_url"] = character_photo_url or photo_url
        if role_names:
            member["roles"] = role_names
            member["performances"] = [
                {
                    "language": lang,
                    "actor_name": role_names[0],
                    "actor_names": role_names,
                }
            ]
            member["actors"] = [
                {"name": an, "language": lang} for an in role_names
            ]
    cast.setdefault(key, []).append(member)
    cast["animated"] = cast.get("characters") or []
    cast["people"] = cast.get("staff") or []
    film_meta["cast"] = cast
    films_meta[fid] = film_meta
    meta["films"] = films_meta
    _save_meta(row, meta)
    db.commit()
    return member


def patch_film_cast_member(
    db: Session,
    film_id: str,
    member_id: str | int,
    *,
    kind: str = "characters",
    name: str | None = None,
    character: str | None = None,
    photo_url: str | None = None,
    actor_photo_url: str | None = None,
    actors: list | None = None,
    roles: list[str] | None = None,
    language: str | None = None,
    delete: bool = False,
) -> dict | None:
    row, meta, films_meta, film_meta, fid, _film_dir = _resolve_film_row(
        db, film_id
    )
    cast = _load_film_cast(film_meta)
    key = "characters" if kind in ("characters", "animated") else "staff"
    want = str(member_id)
    character_centered = key == "characters"
    members = cast.get(key) or []
    for idx, member in enumerate(members):
        if not isinstance(member, dict):
            continue
        if not _member_id_matches(
            member, want, character_centered=character_centered
        ):
            continue
        if delete:
            cast[key] = [m for i, m in enumerate(members) if i != idx]
            cast["animated"] = cast.get("characters") or []
            cast["people"] = cast.get("staff") or []
            film_meta["cast"] = cast
            films_meta[fid] = film_meta
            meta["films"] = films_meta
            _save_meta(row, meta)
            db.commit()
            return {"ok": True, "deleted": True, "id": want}
        if name is not None:
            member["name"] = name.strip()
        if character is not None:
            member["character"] = character.strip() or None
            if character_centered and character.strip():
                member["name"] = character.strip()
        if photo_url is not None:
            member["photo_url"] = (photo_url or "").strip() or None
        if actor_photo_url is not None:
            member["actor_photo_url"] = (actor_photo_url or "").strip() or None
        if roles is not None:
            member["roles"] = [r for r in roles if r]
        if actors is not None:
            lang = normalize_lang_code(language) or language or "en"
            cleaned: list[dict] = []
            for a in actors:
                if isinstance(a, dict):
                    n = (a.get("name") or "").strip()
                    if not n:
                        continue
                    photo = a.get("photo_url")
                    if isinstance(photo, str):
                        photo = photo.strip() or None
                    cleaned.append(
                        {"name": n, "photo_url": photo, "language": lang}
                    )
                elif isinstance(a, str) and a.strip():
                    cleaned.append(
                        {"name": a.strip(), "photo_url": None, "language": lang}
                    )
            member["actors"] = cleaned
            member["roles"] = [c["name"] for c in cleaned]
            if cleaned:
                member["performances"] = [
                    {
                        "language": lang,
                        "actor_name": cleaned[0]["name"],
                        "actor_names": [c["name"] for c in cleaned],
                        "photo_url": cleaned[0].get("photo_url"),
                    }
                ]
        member["manual"] = True
        cast[key] = members
        cast["animated"] = cast.get("characters") or []
        cast["people"] = cast.get("staff") or []
        film_meta["cast"] = cast
        films_meta[fid] = film_meta
        meta["films"] = films_meta
        _save_meta(row, meta)
        db.commit()
        return member
    return None
