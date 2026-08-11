"""Admin mutations for Books leaf about + cast (disk sidecar under the book folder)."""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.books_index import find_book_dir
from app.config import settings
from app.models import Country
from app.series_admin import _clean_genres, _clean_languages, _periods_from_activity
from app.series_languages import normalize_lang_code


def _about_path(book_dir: Path) -> Path:
    return book_dir / ".mystack" / "about.json"


def load_book_about(book_dir: Path) -> dict:
    path = _about_path(book_dir)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_book_about(book_dir: Path, about: dict) -> None:
    path = _about_path(book_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(about, indent=2, ensure_ascii=False), encoding="utf-8")


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
    return book_dir, work_dir, load_book_about(book_dir)


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
) -> dict:
    book_dir, _work_dir, about = _resolve_book(book_id)

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

    _save_book_about(book_dir, about)
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
    book_dir, _work_dir, about = _resolve_book(book_id)
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
    _save_book_about(book_dir, about)
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
    book_dir, _work_dir, about = _resolve_book(book_id)
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
        _save_book_about(book_dir, about)
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
    _save_book_about(book_dir, about)
    return member
