"""Refresh Books metadata via Google Books (search → pick)."""
from __future__ import annotations

from pathlib import Path

from app.books_index import find_book_dir, find_work_dir
from app.services.google_books import get_google_book, search_google_books


def search_book_metadata(query: str) -> dict:
    return {"results": search_google_books(query)}


def preview_book_metadata(volume_id: str) -> dict | None:
    data = get_google_book(volume_id)
    return data


def apply_book_metadata_stub(book_id: str, volume_id: str) -> dict:
    """
    v1: return normalized metadata payload for the client / future DB persist.
    Local art remains authoritative on disk; this seeds bio/authors/genres.
    """
    data = get_google_book(volume_id)
    if not data:
        return {"ok": False, "error": "Volume not found"}
    found = find_book_dir(book_id)
    folder = None
    if found:
        folder = str(found[0])
    return {
        "ok": True,
        "book_id": book_id,
        "folder": folder,
        "google_books_id": data.get("id"),
        "bio": data.get("description"),
        "authors": data.get("authors") or [],
        "writers": data.get("authors") or [],
        "publishers": [data["publisher"]] if data.get("publisher") else [],
        "genres": [{"id": i, "name": c} for i, c in enumerate(data.get("categories") or [])],
        "language": data.get("language"),
        "thumbnail": data.get("thumbnail"),
        "title": data.get("title"),
    }


def search_work_metadata(work_id: str, query: str | None = None) -> dict:
    found = find_work_dir(work_id)
    name = found[0].name if found else work_id
    return {"results": search_google_books(query or name)}


def _about_path(work_dir: Path) -> Path:
    return work_dir / ".mystack" / "about.json"


def load_work_about(work_dir: Path) -> dict:
    import json

    path = _about_path(work_dir)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def patch_work_about(
    db,
    work_id: str,
    *,
    bio: str | None = None,
    writers: str | None = None,
) -> dict:
    """Persist franchise-level bio / authors for a Books work."""
    import json

    from app.config import settings
    from app.universes import universe_for_franchise, update_universe

    root = Path(settings.media_root or "")
    found = find_work_dir(work_id, root if root.is_dir() else None)
    if not found:
        raise ValueError(f"Books franchise not found: {work_id}")
    work_dir, _letter = found
    about = load_work_about(work_dir)
    if writers is not None:
        text = str(writers).strip().replace(",", ";")
        authors = [p.strip() for p in text.split(";") if p.strip()]
        about["writers"] = authors
        about["authors"] = authors
    if bio is not None:
        about["bio"] = bio.strip()
        about["bio_manual"] = True
        # Prefer universe overview when linked; also keep local sidecar.
        uni = universe_for_franchise(db, "books", work_id)
        if uni and hasattr(uni, "id"):
            try:
                update_universe(
                    db, uni.id, overview=bio.strip() or None, set_overview=True
                )
            except Exception:
                pass
    path = _about_path(work_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(about, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"ok": True, "work_id": work_id}
