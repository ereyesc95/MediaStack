"""Persist Books work/leaf about metadata in the DB (no media-disk sidecars)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.books_index import _book_id
from app.config import settings
from app.database import SessionLocal
from app.franchise_index import normalize_franchise_slug
from app.models import BookLeaf, BookWork


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


def book_id_for_dir(book_dir: Path) -> str | None:
    rel = _rel_path(book_dir)
    if not rel:
        return None
    return _book_id(rel)


def work_slug_for_dir(work_dir: Path) -> str:
    return normalize_franchise_slug(work_dir.name) or work_dir.name.casefold()


def _disk_about(folder: Path) -> dict:
    """One-time migration source — never write back to disk."""
    path = folder / ".mystack" / "about.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _parse_meta(raw: str | None) -> dict:
    try:
        data = json.loads(raw or "{}")
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def _dump_meta(meta: dict) -> str:
    return json.dumps(meta, ensure_ascii=False)


def find_book_work(db: Session, work_slug: str) -> BookWork | None:
    want = normalize_franchise_slug(work_slug) or (work_slug or "").casefold()
    rows = db.scalars(select(BookWork)).all()
    for row in rows:
        slug = row.bwk_slug or ""
        if slug == want or normalize_franchise_slug(row.bwk_name or "") == want:
            return row
    return None


def ensure_book_work(
    db: Session,
    *,
    work_slug: str,
    name: str,
    folder_path: str | None = None,
) -> BookWork:
    row = find_book_work(db, work_slug)
    if row:
        if folder_path and not row.bwk_folder_path:
            row.bwk_folder_path = folder_path
        if name and not row.bwk_name:
            row.bwk_name = name
        return row
    row = BookWork(
        bwk_slug=normalize_franchise_slug(work_slug) or work_slug.casefold(),
        bwk_name=name,
        bwk_folder_path=folder_path,
    )
    db.add(row)
    db.flush()
    return row


def find_book_leaf(db: Session, book_id: str) -> BookLeaf | None:
    want = (book_id or "").strip()
    if not want:
        return None
    return db.scalar(select(BookLeaf).where(BookLeaf.blk_book_id == want))


def ensure_book_leaf(
    db: Session,
    *,
    book_id: str,
    work_slug: str | None = None,
    folder_path: str | None = None,
    title: str | None = None,
) -> BookLeaf:
    row = find_book_leaf(db, book_id)
    if row:
        if work_slug and not row.blk_work_slug:
            row.blk_work_slug = work_slug
        if folder_path and not row.blk_folder_path:
            row.blk_folder_path = folder_path
        if title and not row.blk_title:
            row.blk_title = title
        return row
    row = BookLeaf(
        blk_book_id=book_id,
        blk_work_slug=work_slug,
        blk_folder_path=folder_path,
        blk_title=title,
    )
    db.add(row)
    db.flush()
    return row


def load_work_about(work_dir: Path, *, db: Session | None = None) -> dict:
    slug = work_slug_for_dir(work_dir)
    own = db is None
    session = db or SessionLocal()
    try:
        row = find_book_work(session, slug)
        if row and row.bwk_metadata_json:
            meta = _parse_meta(row.bwk_metadata_json)
            if meta:
                return meta
        disk = _disk_about(work_dir)
        if disk:
            row = ensure_book_work(
                session,
                work_slug=slug,
                name=work_dir.name,
                folder_path=_rel_path(work_dir),
            )
            if row.bwk_bio is None and isinstance(disk.get("bio"), str):
                row.bwk_bio = disk.get("bio")
            row.bwk_metadata_json = _dump_meta(disk)
            row.bwk_refreshed_at = _now()
            session.commit()
            return dict(disk)
        return {}
    finally:
        if own:
            session.close()


def save_work_about(
    work_dir: Path,
    about: dict,
    *,
    db: Session | None = None,
) -> None:
    slug = work_slug_for_dir(work_dir)
    own = db is None
    session = db or SessionLocal()
    try:
        row = ensure_book_work(
            session,
            work_slug=slug,
            name=work_dir.name,
            folder_path=_rel_path(work_dir),
        )
        bio = about.get("bio")
        if isinstance(bio, str):
            row.bwk_bio = bio
        row.bwk_metadata_json = _dump_meta(about)
        row.bwk_refreshed_at = _now()
        session.commit()
    finally:
        if own:
            session.close()


def load_book_about(
    book_dir: Path,
    *,
    book_id: str | None = None,
    work_dir: Path | None = None,
    db: Session | None = None,
) -> dict:
    bid = (book_id or "").strip() or book_id_for_dir(book_dir)
    if not bid:
        return _disk_about(book_dir)
    own = db is None
    session = db or SessionLocal()
    try:
        row = find_book_leaf(session, bid)
        if row and row.blk_metadata_json:
            meta = _parse_meta(row.blk_metadata_json)
            if meta:
                return meta
        disk = _disk_about(book_dir)
        if disk:
            wslug = work_slug_for_dir(work_dir) if work_dir else None
            if not wslug:
                # book_dir is typically …/{Work}/{…}/leaf
                try:
                    # Prefer Books/{L}/{Work}/…
                    parts = (_rel_path(book_dir) or "").split("/")
                    if len(parts) >= 3 and parts[0].casefold() == "books":
                        wslug = normalize_franchise_slug(parts[2]) or parts[2].casefold()
                except Exception:
                    wslug = None
            row = ensure_book_leaf(
                session,
                book_id=bid,
                work_slug=wslug,
                folder_path=_rel_path(book_dir),
                title=book_dir.name,
            )
            row.blk_metadata_json = _dump_meta(disk)
            row.blk_refreshed_at = _now()
            session.commit()
            return dict(disk)
        return {}
    finally:
        if own:
            session.close()


def save_book_about(
    book_dir: Path,
    about: dict,
    *,
    book_id: str | None = None,
    work_dir: Path | None = None,
    db: Session | None = None,
) -> None:
    bid = (book_id or "").strip() or book_id_for_dir(book_dir)
    if not bid:
        raise ValueError("Cannot resolve book_id for about save")
    own = db is None
    session = db or SessionLocal()
    try:
        wslug = work_slug_for_dir(work_dir) if work_dir else None
        if not wslug:
            parts = (_rel_path(book_dir) or "").split("/")
            if len(parts) >= 3 and parts[0].casefold() == "books":
                wslug = normalize_franchise_slug(parts[2]) or parts[2].casefold()
        row = ensure_book_leaf(
            session,
            book_id=bid,
            work_slug=wslug,
            folder_path=_rel_path(book_dir),
            title=book_dir.name,
        )
        row.blk_metadata_json = _dump_meta(about)
        row.blk_refreshed_at = _now()
        session.commit()
    finally:
        if own:
            session.close()


def iter_book_leaf_meta(db: Session) -> list[tuple[BookLeaf, dict]]:
    out: list[tuple[BookLeaf, dict]] = []
    for row in db.scalars(select(BookLeaf)).all():
        out.append((row, _parse_meta(row.blk_metadata_json)))
    return out


def iter_book_work_meta(db: Session) -> list[tuple[BookWork, dict]]:
    out: list[tuple[BookWork, dict]] = []
    for row in db.scalars(select(BookWork)).all():
        out.append((row, _parse_meta(row.bwk_metadata_json)))
    return out
