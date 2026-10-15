"""IGDB-backed metadata refresh for Games franchises and leaves (DB only)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.franchise_index import normalize_franchise_slug
from app.games_store import (
    save_game_about,
    save_work_about,
    work_slug_for_name,
)
from app.services.igdb import IgdbNotConfigured, igdb_configured, search_games


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def refresh_game_metadata(
    db: Session, game_id: str, detail: dict
) -> dict:
    if not igdb_configured():
        return {
            "ok": False,
            "error": "IGDB client id/secret not configured (env or ApiAuth IGDB)",
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
        "refreshed_at": _now(),
    }
    folder_path = (detail.get("folder_path") or "").replace("\\", "/").strip("/")
    platform = detail.get("platform")
    work_name = (
        detail.get("work_name")
        or (detail.get("franchise") or {}).get("name")
        or ""
    )
    work_slug = work_slug_for_name(work_name) if work_name else None
    try:
        save_game_about(
            about,
            game_id=game_id,
            title=title,
            folder_path=folder_path or None,
            work_slug=work_slug,
            platform=platform if isinstance(platform, str) else None,
            db=db,
        )
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "about": about, "match": best.get("name")}


async def refresh_franchise_metadata(
    db: Session, work_id: str, detail: dict
) -> dict:
    if not igdb_configured():
        return {
            "ok": False,
            "error": "IGDB client id/secret not configured (env or ApiAuth IGDB)",
        }
    name = (detail.get("name") or detail.get("title") or "").strip()
    if not name:
        return {"ok": False, "error": "No title to search"}
    try:
        hits = await search_games(name, limit=5)
    except IgdbNotConfigured as exc:
        return {"ok": False, "error": str(exc)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    if not hits:
        return {"ok": False, "error": "No IGDB match"}
    want = normalize_franchise_slug(name) or name.casefold()
    best = hits[0]
    for h in hits:
        hit_name = normalize_franchise_slug(h.get("name") or "") or ""
        if hit_name == want:
            best = h
            break
    about = {
        "igdb_id": best.get("provider_id"),
        "overview": best.get("overview"),
        "studio": (best.get("developers") or [None])[0],
        "publisher": (best.get("publishers") or [None])[0],
        "developers": best.get("developers") or [],
        "publishers": best.get("publishers") or [],
        "genres": best.get("genres") or [],
        "platforms": best.get("platforms") or detail.get("platforms") or [],
        "date_iso": best.get("date_iso"),
        "cover_url": best.get("cover_url"),
        "refreshed_at": _now(),
    }
    folder_path = (detail.get("folder_path") or "").replace("\\", "/").strip("/")
    try:
        save_work_about(
            about,
            work_slug=work_slug_for_name(work_id) or work_slug_for_name(name),
            work_name=name,
            folder_path=folder_path or None,
            db=db,
        )
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True, "about": about, "match": best.get("name")}
