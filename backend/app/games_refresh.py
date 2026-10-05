"""IGDB-backed metadata refresh for Games franchises and leaves."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.franchise_index import normalize_franchise_slug
from app.services.igdb import IgdbNotConfigured, igdb_configured, search_games


def _about_path(folder: Path) -> Path:
    return folder / "[Artwork]" / "about.json"


def _write_about(folder: Path, payload: dict) -> None:
    art = folder / "[Artwork]"
    art.mkdir(parents=True, exist_ok=True)
    path = _about_path(folder)
    import json

    existing: dict = {}
    if path.is_file():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            existing = {}
    merged = {**existing, **payload, "refreshed_at": datetime.now(timezone.utc).isoformat()}
    path.write_text(json.dumps(merged, indent=2, ensure_ascii=False), encoding="utf-8")


def _folder_from_detail(detail: dict) -> Path | None:
    root = Path(settings.media_root or "")
    rel = (detail.get("folder_path") or "").replace("\\", "/").strip("/")
    if not root.is_dir() or not rel:
        return None
    folder = root / rel
    return folder if folder.is_dir() else None


async def refresh_game_metadata(
    db: Session, game_id: str, detail: dict
) -> dict:
    _ = db, game_id
    if not igdb_configured():
        return {
            "ok": False,
            "error": "IGDB client id/secret not configured (MYSTACK_IGDB_CLIENT_ID / MYSTACK_IGDB_CLIENT_SECRET)",
        }
    title = (detail.get("title") or detail.get("name") or "").strip()
    if not title:
        return {"ok": False, "error": "No title to search"}
    try:
        hits = await search_games(title, limit=5)
    except IgdbNotConfigured as exc:
        return {"ok": False, "error": str(exc)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    if not hits:
        return {"ok": False, "error": "No IGDB match"}
    # Prefer exact-ish title match
    want = normalize_franchise_slug(title) or title.casefold()
    best = hits[0]
    for h in hits:
        name = normalize_franchise_slug(h.get("name") or "") or ""
        if name == want:
            best = h
            break
    folder = _folder_from_detail(detail)
    about = {
        "igdb_id": best.get("provider_id"),
        "overview": best.get("overview"),
        "studio": (best.get("developers") or [None])[0],
        "publisher": (best.get("publishers") or [None])[0],
        "developers": best.get("developers") or [],
        "publishers": best.get("publishers") or [],
        "genres": best.get("genres") or [],
        "platforms": best.get("platforms") or [],
        "date_iso": best.get("date_iso"),
        "cover_url": best.get("cover_url"),
    }
    if folder:
        _write_about(folder, about)
    return {"ok": True, "about": about, "match": best.get("name")}


async def refresh_franchise_metadata(
    db: Session, work_id: str, detail: dict
) -> dict:
    _ = work_id
    # Refresh using franchise display name; writes about.json on franchise folder
    name = detail.get("name") or detail.get("title") or ""
    synthetic = {**detail, "title": name}
    return await refresh_game_metadata(db, work_id, synthetic)
