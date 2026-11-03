"""Lean band ↔ media subject links (biopics / tribute films / etc.)."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.franchise_index import (
    FranchiseEntry,
    FranchiseIndex,
    EntryKind,
    ensure_franchise_index,
    normalize_franchise_slug,
    parse_dated_folder_name,
    related_for_artist_name,
)
from app.models import SubjectMediaLink

_MODULE_PREFIX: dict[str, EntryKind] = {
    "movies": "movie",
    "series": "series",
    "books": "book",
    "games": "game",
}

_KIND_BUCKET: dict[EntryKind, str] = {
    "movie": "movies",
    "series": "series",
    "book": "books",
    "game": "games",
    "music": "music",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_rel_path(path: str) -> str:
    return (path or "").replace("\\", "/").strip().strip("/")


def module_from_path(path: str) -> str | None:
    parts = [p for p in normalize_rel_path(path).split("/") if p]
    if not parts:
        return None
    head = parts[0].casefold()
    if head in _MODULE_PREFIX:
        return head
    return None


def serialize_link(row: SubjectMediaLink) -> dict[str, Any]:
    return {
        "id": row.sml_id,
        "band_id": row.sml_band_id,
        "module": row.sml_module,
        "path": row.sml_folder_path,
        "reason": row.sml_reason,
        "created_at": row.sml_created_at,
    }


def list_links(db: Session, band_id: int) -> list[SubjectMediaLink]:
    return list(
        db.scalars(
            select(SubjectMediaLink)
            .where(SubjectMediaLink.sml_band_id == band_id)
            .order_by(SubjectMediaLink.sml_id)
        ).all()
    )


def add_link(
    db: Session,
    *,
    band_id: int,
    folder_path: str,
    reason: str | None = None,
    module: str | None = None,
) -> SubjectMediaLink:
    rel = normalize_rel_path(folder_path)
    if not rel:
        raise ValueError("Path required")
    mod = (module or module_from_path(rel) or "").strip().casefold()
    if mod not in _MODULE_PREFIX:
        raise ValueError("Path must be under Movies/, Series/, Books/, or Games/")
    existing = db.scalars(
        select(SubjectMediaLink).where(
            SubjectMediaLink.sml_band_id == band_id,
            SubjectMediaLink.sml_folder_path == rel,
        )
    ).first()
    if existing:
        if reason is not None:
            existing.sml_reason = (reason or "").strip() or None
            db.commit()
            db.refresh(existing)
        return existing
    row = SubjectMediaLink(
        sml_band_id=band_id,
        sml_module=mod,
        sml_folder_path=rel,
        sml_reason=(reason or "").strip() or None,
        sml_created_at=_now_iso(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def remove_link(db: Session, *, band_id: int, link_id: int) -> bool:
    row = db.get(SubjectMediaLink, link_id)
    if not row or row.sml_band_id != band_id:
        return False
    db.delete(row)
    db.commit()
    return True


def _entry_from_path(
    index: FranchiseIndex, rel: str, *, kind: EntryKind
) -> FranchiseEntry | None:
    norm = normalize_rel_path(rel).casefold()
    for group in index.franchises.values():
        for entry in group.entries:
            if entry.path.casefold().rstrip("/") == norm:
                return entry
            # Allow linking a work folder when only leaf entries are indexed.
            if entry.path.casefold().rstrip("/").startswith(norm + "/"):
                return FranchiseEntry(
                    kind=kind,
                    path=normalize_rel_path(rel),
                    title=group.display_name,
                    date_iso=None,
                    letter=group.letter,
                    franchise_display=group.display_name,
                )
    parts = [p for p in normalize_rel_path(rel).split("/") if p]
    if len(parts) < 3:
        return None
    leaf = parts[-1]
    date_iso, title = parse_dated_folder_name(leaf)
    letter = parts[1] if len(parts) >= 2 else None
    franchise_display = parts[2] if len(parts) >= 3 else title
    return FranchiseEntry(
        kind=kind,
        path=normalize_rel_path(rel),
        title=title or leaf,
        date_iso=date_iso,
        letter=letter,
        franchise_display=franchise_display,
    )


def _empty_buckets() -> dict[str, list[dict[str, Any]]]:
    return {bucket: [] for bucket in ("movies", "series", "books", "games", "music")}


def merge_subject_entries(
    buckets: dict[str, list[dict[str, Any]]],
    index: FranchiseIndex,
    links: list[SubjectMediaLink],
) -> dict[str, list[dict[str, Any]]]:
    """Append subject-link entries into related buckets (dedupe by path)."""
    out = {k: list(v) for k, v in buckets.items()}
    seen: dict[str, set[str]] = {
        k: {normalize_rel_path(e.get("path") or "").casefold() for e in v if isinstance(e, dict)}
        for k, v in out.items()
    }
    for link in links:
        kind = _MODULE_PREFIX.get(link.sml_module.casefold())
        if not kind:
            continue
        bucket = _KIND_BUCKET[kind]
        entry = _entry_from_path(index, link.sml_folder_path, kind=kind)
        if not entry:
            continue
        key = entry.path.casefold().rstrip("/")
        if key in seen.get(bucket, set()):
            continue
        row = {
            "kind": entry.kind,
            "path": entry.path,
            "title": entry.title,
            "date_iso": entry.date_iso,
            "letter": entry.letter,
            "platform": entry.platform,
            "subseries": entry.subseries,
            "franchise_display": entry.franchise_display,
            "subject_link_id": link.sml_id,
            "subject_reason": link.sml_reason,
        }
        out.setdefault(bucket, []).append(row)
        seen.setdefault(bucket, set()).add(key)
    return out


def related_media_for_band(
    db: Session,
    *,
    band_id: int,
    band_name: str | None,
    media_root: Path | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Franchise slug match + override links + DB subject links."""
    root = media_root
    if root is None:
        from app.config import settings

        raw = settings.media_root
        root = Path(raw) if raw else None
    if root is None or not root.is_dir():
        return _empty_buckets()
    index = ensure_franchise_index(root)
    buckets = related_for_artist_name(index, band_name or "")
    links = list_links(db, band_id)
    if links:
        buckets = merge_subject_entries(buckets, index, links)
    return buckets


def related_media_counts(
    db: Session,
    *,
    band_id: int,
    band_name: str | None,
    media_root: Path | None = None,
) -> dict[str, int]:
    buckets = related_media_for_band(
        db, band_id=band_id, band_name=band_name, media_root=media_root
    )
    return {k: len(v or []) for k, v in buckets.items() if k != "music"}
