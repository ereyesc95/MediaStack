"""Admin mutations for Games leaf about + cast (DB-backed; no media-disk sidecars)."""
from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from app.config import settings
from app.database import SessionLocal
from app.franchise_index import GAME_PLATFORMS, normalize_franchise_slug
from app.games_index import _game_id, find_game_dir
from app.games_store import (
    find_game_leaf,
    load_game_about as _load_game_about_db,
    save_game_about as _save_game_about_db,
)
from app.series_languages import normalize_lang_code


def _media_root() -> Path:
    root = Path(settings.media_root or "")
    if not root.is_dir():
        raise ValueError("Media root is not configured or missing")
    return root


def _canonicalize_platform(raw: str | None) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None
    hit = next((p for p in GAME_PLATFORMS if p.casefold() == text.casefold()), None)
    return hit or text


def _resolve_game(game_id: str) -> tuple[Path, Path, dict, str, str]:
    """Return (game_dir, work_dir, about, game_id, platform)."""
    want = (game_id or "").strip()
    if not want:
        raise ValueError("Missing game id")
    root = _media_root()
    found = find_game_dir(want, root)
    if not found:
        # DB folder_path fallback (ids stay stable until a platform move).
        session = SessionLocal()
        try:
            row = find_game_leaf(session, want)
            folder = (row.glk_folder_path or "").replace("\\", "/").strip("/") if row else ""
            if folder:
                game_dir = root / folder
                if game_dir.is_dir():
                    # Games/{Platform}/{Letter}/{Franchise}/{leaf}
                    parts = Path(folder).parts
                    if len(parts) >= 4 and parts[0].casefold() == "games":
                        work_dir = game_dir.parent
                        platform = parts[1]
                        about = _load_game_about_db(
                            game_dir,
                            game_id=want,
                            folder_path=folder,
                        )
                        return game_dir, work_dir, about, want, platform
        finally:
            session.close()
        raise ValueError(f"Game not found: {want}")
    game_dir, work_dir, platform, _letter = found
    about = _load_game_about_db(
        game_dir,
        game_id=want,
        folder_path=game_dir.relative_to(root).as_posix(),
    )
    return game_dir, work_dir, about, want, platform


def _save_game_about(
    game_dir: Path,
    about: dict,
    *,
    game_id: str,
    work_dir: Path | None = None,
    platform: str | None = None,
    title: str | None = None,
) -> None:
    root = _media_root()
    folder_path = None
    work_slug = None
    try:
        folder_path = game_dir.relative_to(root).as_posix()
    except ValueError:
        folder_path = None
    if work_dir is not None:
        work_slug = normalize_franchise_slug(work_dir.name) or work_dir.name.casefold()
    _save_game_about_db(
        about,
        game_id=game_id,
        title=title or game_dir.name,
        folder_path=folder_path,
        work_slug=work_slug,
        platform=platform,
    )


def _dir_is_emptyish(path: Path) -> bool:
    if not path.is_dir():
        return True
    keep = {"desktop.ini", "folder.ico", "thumbs.db"}
    try:
        for child in path.iterdir():
            if child.name.casefold() in keep:
                continue
            return False
    except OSError:
        return False
    return True


def _move_game_platform(
    game_dir: Path,
    work_dir: Path,
    *,
    old_platform: str,
    new_platform: str,
    game_id: str,
) -> tuple[Path, Path, str]:
    """
    Move Games/{Old}/{Letter}/{Franchise}/{leaf} → Games/{New}/…
    Returns (new_game_dir, new_work_dir, new_game_id).
    """
    root = _media_root()
    canon = _canonicalize_platform(new_platform)
    if not canon:
        raise ValueError("Platform is required")
    if canon.casefold() == (old_platform or "").casefold():
        return game_dir, work_dir, game_id

    # work_dir = …/Games/{Platform}/{Letter}/{Franchise}
    letter = work_dir.parent.name
    franchise_name = work_dir.name
    new_work = root / "Games" / canon / letter / franchise_name
    new_work.mkdir(parents=True, exist_ok=True)
    new_leaf = new_work / game_dir.name
    if new_leaf.resolve() == game_dir.resolve():
        return game_dir, work_dir, game_id
    if new_leaf.exists():
        raise ValueError(f"Target already exists: {new_leaf.relative_to(root).as_posix()}")

    shutil.move(str(game_dir), str(new_leaf))

    # Drop empty old franchise (and letter) shells.
    old_franchise = work_dir
    if _dir_is_emptyish(old_franchise):
        try:
            for name in ("folder.ico", "desktop.ini"):
                p = old_franchise / name
                if p.is_file():
                    p.unlink()
            old_franchise.rmdir()
        except OSError:
            pass
        old_letter = old_franchise.parent
        if _dir_is_emptyish(old_letter):
            try:
                old_letter.rmdir()
            except OSError:
                pass

    try:
        from app.folder_icons import decorate_folder

        decorate_folder(new_work)
        decorate_folder(new_leaf, overwrite_ico=False)
        decorate_folder(root / "Games" / canon)
    except Exception:
        pass

    new_rel = new_leaf.relative_to(root).as_posix()
    new_id = _game_id(new_rel)
    session = SessionLocal()
    try:
        row = find_game_leaf(session, game_id)
        if row:
            # Unique glk_game_id — retarget the same row when the path hash changes.
            conflict = find_game_leaf(session, new_id)
            if conflict and conflict.glk_id != row.glk_id:
                session.delete(conflict)
                session.flush()
            row.glk_game_id = new_id
            row.glk_folder_path = new_rel
            row.glk_platform = canon
            session.commit()
        else:
            session.rollback()
    finally:
        session.close()

    return new_leaf, new_work, new_id


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


def patch_game_about(
    game_id: str,
    *,
    bio: str | None = None,
    developers: str | list | None = None,
    publishers: str | list | None = None,
    platform: str | None = None,
    activity_start: str | None = None,
    languages: list | None = None,
    genres: list | None = None,
    web_url: str | None = None,
) -> dict:
    """Update Games leaf about fields in DB metadata; move folder on platform change."""
    game_dir, work_dir, about, gid, cur_platform = _resolve_game(game_id)

    def _split_names(raw: str | list | None) -> list[str]:
        if raw is None:
            return []
        if isinstance(raw, list):
            return [str(x).strip() for x in raw if str(x).strip()]
        return [p.strip() for p in str(raw).split(";") if p.strip()]

    if bio is not None:
        about["overview"] = bio
        about["bio"] = bio
    if developers is not None:
        names = _split_names(developers)
        about["developers"] = names
        about["studio"] = names[0] if names else about.get("studio")
    if publishers is not None:
        names = _split_names(publishers)
        about["publishers"] = names
        about["publisher"] = names[0] if names else about.get("publisher")
    if activity_start is not None:
        date = str(activity_start).strip()
        about["date_iso"] = date or None
        about["release_date"] = date or None
    if languages is not None:
        about["languages"] = [
            normalize_lang_code(str(x)) or str(x)
            for x in languages
            if str(x).strip()
        ]
    if genres is not None:
        cleaned = []
        for g in genres:
            if isinstance(g, dict) and (g.get("name") or "").strip():
                cleaned.append(
                    {
                        "id": g.get("id"),
                        "name": str(g.get("name")).strip(),
                    }
                )
            elif isinstance(g, str) and g.strip():
                cleaned.append({"id": g.strip().casefold(), "name": g.strip()})
        about["genres"] = cleaned
    if web_url is not None:
        url = str(web_url).strip()
        if url and "://" not in url:
            url = f"https://{url.lstrip('/')}"
        about["web_url"] = url or None

    plat = _canonicalize_platform(platform) if platform is not None else None
    moved = False
    if plat is not None:
        about["platform"] = plat
        about["platforms"] = [plat] if plat else []
        if plat and plat.casefold() != (cur_platform or "").casefold():
            game_dir, work_dir, gid = _move_game_platform(
                game_dir,
                work_dir,
                old_platform=cur_platform,
                new_platform=plat,
                game_id=gid,
            )
            moved = True
            cur_platform = plat

    leaf_title = None
    try:
        from app.franchise_index import parse_dated_folder_name

        _d, leaf_title = parse_dated_folder_name(game_dir.name)
    except Exception:
        leaf_title = None

    _save_game_about(
        game_dir,
        about,
        game_id=gid,
        work_dir=work_dir,
        platform=plat if plat is not None else cur_platform,
        title=leaf_title,
    )
    return {
        "ok": True,
        "game_id": gid,
        "platform": plat if plat is not None else cur_platform,
        "folder_path": game_dir.relative_to(_media_root()).as_posix(),
        "moved": moved,
        "about": about,
    }


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
    game_dir, work_dir, about, gid, _platform = _resolve_game(game_id)
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
    game_dir, work_dir, about, gid, _platform = _resolve_game(game_id)
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
