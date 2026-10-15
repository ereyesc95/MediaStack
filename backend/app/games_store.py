"""Persist Games work/leaf about metadata in the DB (no media-disk sidecars)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.franchise_index import normalize_franchise_slug
from app.games_index import _game_id
from app.models import GameLeaf, GameWork


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _media_root() -> Path | None:
    root = Path(settings.media_root or "")
    return root if root.is_dir() else None


def _rel_path(folder: Path) -> str | None:
    root = _media_root()
    if not root:
        return None
    try:
        return folder.resolve().relative_to(root.resolve()).as_posix()
    except (OSError, ValueError):
        try:
            return folder.relative_to(root).as_posix()
        except ValueError:
            return None


def game_id_for_dir(game_dir: Path) -> str | None:
    rel = _rel_path(game_dir)
    if not rel:
        return None
    return _game_id(rel)


def work_slug_for_name(name: str) -> str:
    return normalize_franchise_slug(name) or (name or "").casefold()


def work_slug_for_dir(work_dir: Path) -> str:
    return work_slug_for_name(work_dir.name)


def _disk_about(folder: Path) -> dict:
    """One-time migration source — never write back to disk."""
    for path in (
        folder / "[Artwork]" / "about.json",
        folder / ".mystack" / "about.json",
    ):
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, json.JSONDecodeError):
            continue
    return {}


def _parse_meta(raw: str | None) -> dict:
    try:
        data = json.loads(raw or "{}")
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def _dump_meta(meta: dict) -> str:
    return json.dumps(meta, ensure_ascii=False)


def find_game_work(db: Session, work_slug: str) -> GameWork | None:
    want = work_slug_for_name(work_slug)
    rows = db.scalars(select(GameWork)).all()
    for row in rows:
        slug = row.gwk_slug or ""
        if slug == want or work_slug_for_name(row.gwk_name or "") == want:
            return row
    return None


def ensure_game_work(
    db: Session,
    *,
    work_slug: str,
    name: str,
    folder_path: str | None = None,
) -> GameWork:
    row = find_game_work(db, work_slug)
    if row:
        if folder_path and not row.gwk_folder_path:
            row.gwk_folder_path = folder_path
        if name and not row.gwk_name:
            row.gwk_name = name
        return row
    row = GameWork(
        gwk_slug=work_slug_for_name(work_slug),
        gwk_name=name,
        gwk_folder_path=folder_path,
    )
    db.add(row)
    db.flush()
    return row


def find_game_leaf(db: Session, game_id: str) -> GameLeaf | None:
    want = (game_id or "").strip()
    if not want:
        return None
    return db.scalar(select(GameLeaf).where(GameLeaf.glk_game_id == want))


def ensure_game_leaf(
    db: Session,
    *,
    game_id: str,
    work_slug: str | None = None,
    folder_path: str | None = None,
    title: str | None = None,
    platform: str | None = None,
) -> GameLeaf:
    row = find_game_leaf(db, game_id)
    if row:
        if work_slug and not row.glk_work_slug:
            row.glk_work_slug = work_slug
        if folder_path and not row.glk_folder_path:
            row.glk_folder_path = folder_path
        if title and not row.glk_title:
            row.glk_title = title
        if platform and not row.glk_platform:
            row.glk_platform = platform
        return row
    row = GameLeaf(
        glk_game_id=game_id,
        glk_work_slug=work_slug,
        glk_folder_path=folder_path,
        glk_title=title,
        glk_platform=platform,
    )
    db.add(row)
    db.flush()
    return row


def _work_slug_from_game_rel(rel: str | None) -> str | None:
    """Games/{Platform}/{Letter}/{Franchise}/… → franchise slug."""
    parts = (rel or "").replace("\\", "/").split("/")
    if len(parts) >= 4 and parts[0].casefold() == "games":
        return work_slug_for_name(parts[3])
    return None


def load_work_about(
    work_dir: Path | None = None,
    *,
    work_slug: str | None = None,
    work_name: str | None = None,
    db: Session | None = None,
) -> dict:
    slug = (work_slug or "").strip() or (
        work_slug_for_dir(work_dir) if work_dir else ""
    )
    if not slug:
        return {}
    own = db is None
    session = db or SessionLocal()
    try:
        row = find_game_work(session, slug)
        if row and row.gwk_metadata_json:
            meta = _parse_meta(row.gwk_metadata_json)
            if meta:
                return meta
        if work_dir:
            disk = _disk_about(work_dir)
            if disk:
                row = ensure_game_work(
                    session,
                    work_slug=slug,
                    name=work_name or work_dir.name,
                    folder_path=_rel_path(work_dir),
                )
                bio = disk.get("overview") or disk.get("bio")
                if row.gwk_bio is None and isinstance(bio, str):
                    row.gwk_bio = bio
                row.gwk_metadata_json = _dump_meta(disk)
                row.gwk_refreshed_at = _now()
                session.commit()
                return dict(disk)
        return {}
    finally:
        if own:
            session.close()


def save_work_about(
    about: dict,
    *,
    work_slug: str,
    work_name: str,
    folder_path: str | None = None,
    db: Session | None = None,
) -> None:
    own = db is None
    session = db or SessionLocal()
    try:
        row = ensure_game_work(
            session,
            work_slug=work_slug,
            name=work_name,
            folder_path=folder_path,
        )
        bio = about.get("overview") or about.get("bio")
        if isinstance(bio, str):
            row.gwk_bio = bio
        row.gwk_metadata_json = _dump_meta(about)
        row.gwk_refreshed_at = _now()
        session.commit()
    finally:
        if own:
            session.close()


def load_game_about(
    game_dir: Path | None = None,
    *,
    game_id: str | None = None,
    folder_path: str | None = None,
    work_slug: str | None = None,
    db: Session | None = None,
) -> dict:
    bid = (game_id or "").strip()
    if not bid and game_dir:
        bid = game_id_for_dir(game_dir) or ""
    if not bid and folder_path:
        bid = _game_id(folder_path.replace("\\", "/"))
    if not bid:
        return _disk_about(game_dir) if game_dir else {}
    own = db is None
    session = db or SessionLocal()
    try:
        row = find_game_leaf(session, bid)
        if row and row.glk_metadata_json:
            meta = _parse_meta(row.glk_metadata_json)
            if meta:
                return meta
        disk = _disk_about(game_dir) if game_dir else {}
        if disk:
            wslug = work_slug or _work_slug_from_game_rel(
                folder_path or (_rel_path(game_dir) if game_dir else None)
            )
            row = ensure_game_leaf(
                session,
                game_id=bid,
                work_slug=wslug,
                folder_path=folder_path
                or (_rel_path(game_dir) if game_dir else None),
                title=game_dir.name if game_dir else None,
            )
            row.glk_metadata_json = _dump_meta(disk)
            row.glk_refreshed_at = _now()
            session.commit()
            return dict(disk)
        return {}
    finally:
        if own:
            session.close()


def save_game_about(
    about: dict,
    *,
    game_id: str,
    title: str | None = None,
    folder_path: str | None = None,
    work_slug: str | None = None,
    platform: str | None = None,
    db: Session | None = None,
) -> None:
    bid = (game_id or "").strip()
    if not bid:
        raise ValueError("Cannot resolve game_id for about save")
    own = db is None
    session = db or SessionLocal()
    try:
        wslug = work_slug or _work_slug_from_game_rel(folder_path)
        row = ensure_game_leaf(
            session,
            game_id=bid,
            work_slug=wslug,
            folder_path=folder_path,
            title=title,
            platform=platform,
        )
        row.glk_metadata_json = _dump_meta(about)
        row.glk_refreshed_at = _now()
        if platform:
            row.glk_platform = platform
        if title:
            row.glk_title = title
        session.commit()
    finally:
        if own:
            session.close()


def iter_game_leaf_meta(db: Session) -> list[tuple[GameLeaf, dict]]:
    out: list[tuple[GameLeaf, dict]] = []
    for row in db.scalars(select(GameLeaf)).all():
        out.append((row, _parse_meta(row.glk_metadata_json)))
    return out


def iter_game_work_meta(db: Session) -> list[tuple[GameWork, dict]]:
    out: list[tuple[GameWork, dict]] = []
    for row in db.scalars(select(GameWork)).all():
        out.append((row, _parse_meta(row.gwk_metadata_json)))
    return out
