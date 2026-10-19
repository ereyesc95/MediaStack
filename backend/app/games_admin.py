"""Admin mutations for Games leaf about + cast (DB-backed; no media-disk sidecars)."""
from __future__ import annotations

import uuid
from pathlib import Path

from app.config import settings
from app.games_index import find_game_dir
from app.games_store import (
    load_game_about as _load_game_about_db,
    save_game_about as _save_game_about_db,
)
from app.series_languages import normalize_lang_code


def _resolve_game(game_id: str) -> tuple[Path, Path, dict, str]:
    root = Path(settings.media_root or "")
    found = find_game_dir(game_id, root if root.is_dir() else None)
    if not found:
        raise ValueError(f"Game not found: {game_id}")
    game_dir, work_dir, _platform, _letter = found
    about = _load_game_about_db(
        game_dir,
        game_id=game_id,
        folder_path=game_dir.relative_to(root).as_posix() if root.is_dir() else None,
    )
    return game_dir, work_dir, about, game_id


def _save_game_about(
    game_dir: Path,
    about: dict,
    *,
    game_id: str,
    work_dir: Path | None = None,
) -> None:
    root = Path(settings.media_root or "")
    folder_path = None
    work_slug = None
    if root.is_dir():
        try:
            folder_path = game_dir.relative_to(root).as_posix()
        except ValueError:
            folder_path = None
        if work_dir is not None:
            try:
                from app.franchise_index import normalize_franchise_slug

                work_slug = normalize_franchise_slug(work_dir.name) or work_dir.name.casefold()
            except Exception:
                work_slug = None
    _save_game_about_db(
        about,
        game_id=game_id,
        title=game_dir.name,
        folder_path=folder_path,
        work_slug=work_slug,
    )


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


def add_game_cast_member(
    game_id: str,
    *,
    kind: str = "characters",
    name: str,
    character: str | None = None,
    photo_url: str | None = None,
    character_photo_url: str | None = None,
    roles: list[str] | None = None,
    language: str | None = None,
    actors: list[dict] | None = None,
) -> dict:
    game_dir, work_dir, about, gid = _resolve_game(game_id)
    cast = _load_cast(about)
    key = "characters" if kind in ("characters", "animated") else "staff"
    lang = normalize_lang_code(language) or language or "en"
    char_name = (character or name).strip()
    actor_rows = [
        {
            "name": str(a.get("name") or "").strip(),
            "photo_url": a.get("photo_url") or None,
        }
        for a in (actors or [])
        if isinstance(a, dict) and str(a.get("name") or "").strip()
    ]
    member: dict = {
        "id": f"manual-{uuid.uuid4().hex[:10]}",
        "name": (
            (actor_rows[0]["name"] if actor_rows else char_name)
            if key == "characters"
            else name.strip()
        ),
        "character": char_name if key == "characters" else None,
        "photo_url": (
            (character_photo_url or photo_url)
            if key == "characters"
            else photo_url
        ),
        "roles": roles or ([a["name"] for a in actor_rows] if actor_rows else []),
        "manual": True,
    }
    if key == "characters":
        member["performances"] = [
            {
                "language": lang,
                "actor_names": [a["name"] for a in actor_rows],
            }
        ]
        member["actors"] = actor_rows
        if actor_rows:
            member["actor_photo_url"] = actor_rows[0].get("photo_url")
    cast.setdefault(key, []).append(member)
    cast["animated"] = cast.get("characters") or []
    cast["people"] = cast.get("staff") or []
    about["cast"] = cast
    _save_game_about(game_dir, about, game_id=gid, work_dir=work_dir)
    return member


def patch_game_cast_member(
    game_id: str,
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
) -> dict:
    game_dir, work_dir, about, gid = _resolve_game(game_id)
    cast = _load_cast(about)
    key = "characters" if kind in ("characters", "animated") else "staff"
    members = list(cast.get(key) or [])
    want = str(member_id)
    idx = next(
        (i for i, m in enumerate(members) if str(m.get("id") or "") == want),
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
        _save_game_about(game_dir, about, game_id=gid, work_dir=work_dir)
        return {"ok": True, "deleted": True}

    member = dict(members[idx])
    if name is not None:
        member["name"] = name.strip()
    if character is not None:
        member["character"] = character.strip() or None
        if key == "characters":
            member["name"] = character.strip() or member.get("name")
    if photo_url is not None:
        member["photo_url"] = photo_url or None
    if actor_photo_url is not None:
        member["actor_photo_url"] = actor_photo_url or None
    if roles is not None:
        member["roles"] = [str(r).strip() for r in roles if r and str(r).strip()]
    if actors is not None:
        actor_rows: list[dict] = []
        for a in actors:
            if isinstance(a, dict):
                n = str(a.get("name") or "").strip()
                if n:
                    actor_rows.append(
                        {"name": n, "photo_url": a.get("photo_url") or None}
                    )
            elif isinstance(a, str) and a.strip():
                actor_rows.append({"name": a.strip(), "photo_url": None})
        member["actors"] = actor_rows
        if actor_rows and not member.get("name"):
            member["name"] = actor_rows[0]["name"]
        if actor_photo_url is None and actor_rows:
            member["actor_photo_url"] = actor_rows[0].get("photo_url")
    if language is not None:
        lang = normalize_lang_code(language) or language
        actor_names = [
            str(a.get("name") or "")
            for a in (member.get("actors") or [])
            if isinstance(a, dict) and a.get("name")
        ]
        if not actor_names and member.get("roles"):
            actor_names = [str(r) for r in member["roles"] if r]
        member["performances"] = [
            {"language": lang, "actor_names": actor_names}
        ]
    members[idx] = member
    cast[key] = members
    cast["animated"] = cast.get("characters") or []
    cast["people"] = cast.get("staff") or []
    about["cast"] = cast
    _save_game_about(game_dir, about, game_id=gid, work_dir=work_dir)
    return member
