"""IGDB-backed metadata refresh for Games franchises and leaves (DB only)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.games_igdb import pick_best_igdb_hit, resolve_igdb_game_for_platform
from app.games_store import (
    load_game_about,
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
    platform = detail.get("platform")
    platform_s = platform.strip() if isinstance(platform, str) else None
    try:
        best = await resolve_igdb_game_for_platform(
            title=title,
            platform=platform_s,
            provider_id=str(detail.get("igdb_id") or detail.get("provider_id") or "")
            or None,
            limit=12,
        )
        if not best:
            hits = await search_games(title, limit=8)
            best = pick_best_igdb_hit(hits, title=title, platform=platform_s)
    except IgdbNotConfigured as exc:
        return {"ok": False, "error": str(exc)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    if not best:
        return {"ok": False, "error": "No IGDB match"}
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
    work_name = (
        detail.get("work_name")
        or (detail.get("franchise") or {}).get("name")
        or ""
    )
    work_slug = work_slug_for_name(work_name) if work_name else None
    # Keep manually set fields (e.g. Browser game URL) across IGDB refresh.
    try:
        prior = load_game_about(
            None,
            game_id=game_id,
            folder_path=folder_path or None,
            work_slug=work_slug,
            db=db,
        )
        if isinstance(prior, dict):
            for key in ("web_url", "cast"):
                if prior.get(key) and not about.get(key):
                    about[key] = prior[key]
    except Exception:
        pass
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
    platforms = detail.get("platforms") or []
    prefer_platform = (
        platforms[0]
        if isinstance(platforms, list) and platforms
        else detail.get("platform")
    )
    best = pick_best_igdb_hit(
        hits,
        title=name,
        platform=str(prefer_platform).strip() if prefer_platform else None,
    )
    if not best:
        return {"ok": False, "error": "No IGDB match"}
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
