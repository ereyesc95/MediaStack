"""Admin mutations for Books leaf about + cast (DB-backed; no media-disk sidecars)."""
from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.books_index import find_book_dir
from app.books_store import (
    load_book_about as _load_book_about_db,
    save_book_about as _save_book_about_db,
    save_work_about as _save_work_about_db,
)
from app.config import settings
from app.models import Country
from app.series_admin import _clean_genres, _clean_languages, _periods_from_activity
from app.series_languages import normalize_lang_code


def load_book_about(book_dir: Path, *, book_id: str | None = None) -> dict:
    return _load_book_about_db(book_dir, book_id=book_id)


def _save_book_about(
    book_dir: Path,
    about: dict,
    *,
    book_id: str | None = None,
    work_dir: Path | None = None,
) -> None:
    _save_book_about_db(
        book_dir, about, book_id=book_id, work_dir=work_dir
    )


def _split_semicolon(raw: str | None) -> list[str]:
    if raw is None:
        return []
    text = str(raw).strip().replace(",", ";")
    return [p.strip() for p in text.split(";") if p.strip()]


def _resolve_book(book_id: str) -> tuple[Path, Path, dict]:
    root = Path(settings.media_root or "")
    found = find_book_dir(book_id, root if root.is_dir() else None)
    if not found:
        raise ValueError(f"Book not found: {book_id}")
    book_dir, work_dir, _letter = found
    return book_dir, work_dir, load_book_about(book_dir, book_id=book_id)


def _load_cast(about: dict) -> dict:
    cast = about.get("cast") if isinstance(about.get("cast"), dict) else {}
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


def patch_book_about(
    db: Session,
    book_id: str,
    *,
    bio: str | None = None,
    writers: str | None = None,
    publishers: str | None = None,
    country_id: int | None = None,
    languages: list[str] | None = None,
    genres: list[dict] | list[str] | None = None,
    activity_start: str | None = None,
    activity_end: str | None = None,
    content_category: str | None = None,
) -> dict:
    book_dir, work_dir, about = _resolve_book(book_id)

    if bio is not None:
        about["bio"] = bio.strip()
        about["bio_manual"] = True

    if writers is not None:
        authors = _split_semicolon(writers)
        about["writers"] = authors
        about["authors"] = authors

    if publishers is not None:
        about["publishers"] = _split_semicolon(publishers)

    if genres is not None:
        about["genres"] = _clean_genres(genres)

    if languages is not None:
        cleaned = _clean_languages(languages)
        about["languages"] = cleaned
        if cleaned:
            about["origin_language"] = cleaned[0]

    if content_category is not None:
        from app.media_item_admin import normalize_content_category

        about["content_category"] = (
            normalize_content_category("library", content_category) or "Book"
        )

    if country_id is not None:
        country = db.get(Country, int(country_id)) if country_id else None
        if country:
            about["country"] = {
                "id": country.cou_id,
                "name": country.cou_name,
                "iso": country.cou_iso,
            }
        else:
            about.pop("country", None)

    if activity_start is not None or activity_end is not None:
        periods = _periods_from_activity(activity_start, activity_end)
        about["activity_periods"] = periods

    _save_book_about(book_dir, about, book_id=book_id, work_dir=work_dir)
    return {"ok": True, "book_id": book_id}


def add_book_cast_member(
    book_id: str,
    *,
    kind: str = "characters",
    name: str,
    character: str | None = None,
    photo_url: str | None = None,
    character_photo_url: str | None = None,
    roles: list[str] | None = None,
    language: str | None = None,
) -> dict:
    book_dir, work_dir, about = _resolve_book(book_id)
    cast = _load_cast(about)
    key = "characters" if kind in ("characters", "animated") else "staff"
    lang = normalize_lang_code(language) or language or "en"
    char_name = (character or name).strip()
    member: dict = {
        "id": f"manual-{uuid.uuid4().hex[:10]}",
        "name": char_name if key == "characters" else name.strip(),
        "character": char_name if key == "characters" else None,
        "photo_url": character_photo_url or photo_url,
        "roles": roles or [],
        "manual": True,
    }
    if key == "characters":
        # Books are character-centered — no actor rows required.
        member["performances"] = [{"language": lang, "actor_names": []}]
        member["actors"] = []
    cast.setdefault(key, []).append(member)
    cast["animated"] = cast.get("characters") or []
    cast["people"] = cast.get("staff") or []
    about["cast"] = cast
    _save_book_about(book_dir, about, book_id=book_id, work_dir=work_dir)
    return member


def patch_book_cast_member(
    book_id: str,
    member_id: str | int,
    *,
    kind: str = "characters",
    name: str | None = None,
    character: str | None = None,
    photo_url: str | None = None,
    roles: list[str] | None = None,
    language: str | None = None,
    delete: bool = False,
) -> dict:
    book_dir, work_dir, about = _resolve_book(book_id)
    cast = _load_cast(about)
    key = "characters" if kind in ("characters", "animated") else "staff"
    members = list(cast.get(key) or [])
    want = str(member_id)
    idx = next(
        (
            i
            for i, m in enumerate(members)
            if str(m.get("id") or "") == want
        ),
        None,
    )
    if idx is None:
        raise ValueError(f"Cast member not found: {member_id}")
    if delete:
        members.pop(idx)
        cast[key] = members
        cast["animated"] = cast.get("characters") or []
        cast["people"] = cast.get("staff") or []
        about["cast"] = cast
        _save_book_about(book_dir, about, book_id=book_id, work_dir=work_dir)
        return {"ok": True, "deleted": True}
    member = dict(members[idx])
    if name is not None:
        member["name"] = name.strip()
    if character is not None:
        member["character"] = character.strip() or None
        if kind in ("characters", "animated"):
            member["name"] = character.strip() or member.get("name")
    if photo_url is not None:
        member["photo_url"] = photo_url or None
    if roles is not None:
        member["roles"] = [str(r).strip() for r in roles if r and str(r).strip()]
    if language is not None:
        lang = normalize_lang_code(language) or language
        member["performances"] = [{"language": lang, "actor_names": []}]
    members[idx] = member
    cast[key] = members
    cast["animated"] = cast.get("characters") or []
    cast["people"] = cast.get("staff") or []
    about["cast"] = cast
    _save_book_about(book_dir, about, book_id=book_id, work_dir=work_dir)
    return member


def _resolve_work_about(work_id: str) -> tuple[Path, dict]:
    from app.books_index import find_work_dir
    from app.books_store import load_work_about

    root = Path(settings.media_root or "")
    found = find_work_dir(work_id, root if root.is_dir() else None)
    if not found:
        raise ValueError(f"Books franchise not found: {work_id}")
    work_dir, _letter = found
    return work_dir, load_work_about(work_dir)


def _save_work_about(work_dir: Path, about: dict) -> None:
    _save_work_about_db(work_dir, about)


def add_book_work_related(
    work_id: str,
    *,
    bucket: str,
    title: str,
    tmdb_id: int | str | None = None,
    date_iso: str | None = None,
    poster_url: str | None = None,
    overview: str | None = None,
    via_members: list[str] | None = None,
) -> dict:
    from app.related_cards import add_related_card

    work_dir, about = _resolve_work_about(work_id)
    item = add_related_card(
        about,
        bucket=bucket,
        title=title,
        tmdb_id=tmdb_id,
        date_iso=date_iso,
        poster_url=poster_url,
        overview=overview,
        via_members=via_members,
    )
    _save_work_about(work_dir, about)
    return item


def remove_book_work_related(
    work_id: str, *, bucket: str, item_id: str | int
) -> bool:
    from app.related_cards import remove_related_card

    work_dir, about = _resolve_work_about(work_id)
    ok = remove_related_card(about, bucket=bucket, item_id=item_id)
    if ok:
        _save_work_about(work_dir, about)
    return ok


def add_book_related(
    book_id: str,
    *,
    bucket: str,
    title: str,
    tmdb_id: int | str | None = None,
    date_iso: str | None = None,
    poster_url: str | None = None,
    overview: str | None = None,
    via_members: list[str] | None = None,
) -> dict:
    from app.related_cards import add_related_card

    book_dir, work_dir, about = _resolve_book(book_id)
    item = add_related_card(
        about,
        bucket=bucket,
        title=title,
        tmdb_id=tmdb_id,
        date_iso=date_iso,
        poster_url=poster_url,
        overview=overview,
        via_members=via_members,
    )
    _save_book_about(book_dir, about, book_id=book_id, work_dir=work_dir)
    return item


def remove_book_related(
    book_id: str, *, bucket: str, item_id: str | int
) -> bool:
    from app.related_cards import remove_related_card

    book_dir, work_dir, about = _resolve_book(book_id)
    ok = remove_related_card(about, bucket=bucket, item_id=item_id)
    if ok:
        _save_book_about(book_dir, about, book_id=book_id, work_dir=work_dir)
    return ok


def add_book_work_link(
    work_id: str,
    *,
    category: str,
    label: str,
    url: str,
    logo_key: str | None = None,
    logo_url: str | None = None,
) -> dict:
    from app.related_cards import add_link_item

    work_dir, about = _resolve_work_about(work_id)
    item = add_link_item(
        about,
        category=category,
        label=label,
        url=url,
        logo_key=logo_key,
        logo_url=logo_url,
    )
    _save_work_about(work_dir, about)
    return item


def patch_book_work_link(
    work_id: str,
    link_id: str,
    *,
    category: str | None = None,
    label: str | None = None,
    url: str | None = None,
    logo_key: str | None = None,
    logo_url: str | None = None,
    clear_logo_key: bool = False,
) -> dict | None:
    from app.related_cards import patch_link_item

    work_dir, about = _resolve_work_about(work_id)
    item = patch_link_item(
        about,
        link_id,
        category=category,
        label=label,
        url=url,
        logo_key=logo_key,
        logo_url=logo_url,
        clear_logo_key=clear_logo_key,
    )
    if item:
        _save_work_about(work_dir, about)
    return item


def delete_book_work_link(work_id: str, link_id: str) -> bool:
    from app.related_cards import delete_link_item

    work_dir, about = _resolve_work_about(work_id)
    ok = delete_link_item(about, link_id)
    if ok:
        _save_work_about(work_dir, about)
    return ok


def add_book_link(
    book_id: str,
    *,
    category: str,
    label: str,
    url: str,
    logo_key: str | None = None,
    logo_url: str | None = None,
) -> dict:
    from app.related_cards import add_link_item

    book_dir, work_dir, about = _resolve_book(book_id)
    item = add_link_item(
        about,
        category=category,
        label=label,
        url=url,
        logo_key=logo_key,
        logo_url=logo_url,
    )
    _save_book_about(book_dir, about, book_id=book_id, work_dir=work_dir)
    return item


def patch_book_link(
    book_id: str,
    link_id: str,
    *,
    category: str | None = None,
    label: str | None = None,
    url: str | None = None,
    logo_key: str | None = None,
    logo_url: str | None = None,
    clear_logo_key: bool = False,
) -> dict | None:
    from app.related_cards import patch_link_item

    book_dir, work_dir, about = _resolve_book(book_id)
    item = patch_link_item(
        about,
        link_id,
        category=category,
        label=label,
        url=url,
        logo_key=logo_key,
        logo_url=logo_url,
        clear_logo_key=clear_logo_key,
    )
    if item:
        _save_book_about(book_dir, about, book_id=book_id, work_dir=work_dir)
    return item


def delete_book_link(book_id: str, link_id: str) -> bool:
    from app.related_cards import delete_link_item

    book_dir, work_dir, about = _resolve_book(book_id)
    ok = delete_link_item(about, link_id)
    if ok:
        _save_book_about(book_dir, about, book_id=book_id, work_dir=work_dir)
    return ok
