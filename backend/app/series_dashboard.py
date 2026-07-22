"""Series module home dashboard — mirrors music_dashboard panes for Series."""
from __future__ import annotations

from collections import Counter
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.franchise_index import normalize_franchise_slug
from app.media_tabs_index import _folder_cover
from app.models import Reproduction
from app.profile_scope import rep_user_filter
from app.series_index import build_series_catalog


def _rep_weight(r: Reproduction) -> int:
    raw = getattr(r, "rep_count", None) or getattr(r, "rep_plays", None) or 1
    try:
        return max(1, int(raw))
    except (TypeError, ValueError):
        return 1


def _is_series_path(path: str | None) -> bool:
    if not path:
        return False
    return path.replace("\\", "/").casefold().startswith("series/")


def _episode_title(path: str | None, fallback: str | None) -> str:
    if fallback and fallback.strip():
        return fallback.strip()
    if not path:
        return "Episode"
    name = Path(path.replace("\\", "/")).stem
    return name or "Episode"


def _franchise_from_path(path: str | None) -> tuple[str | None, str | None]:
    """Return (franchise_id/slug, franchise_display) from a Series/ path."""
    if not path:
        return None, None
    parts = [p for p in path.replace("\\", "/").split("/") if p]
    if len(parts) < 3 or parts[0].casefold() != "series":
        return None, None
    name = parts[2]
    return normalize_franchise_slug(name) or name.casefold(), name


def build_series_dashboard(db: Session, user_id: int) -> dict:
    media_root = Path(settings.media_root) if settings.media_root else None
    catalog = build_series_catalog(media_root) if media_root else {"franchises": []}
    franchises = catalog.get("franchises") or []
    by_id = {f.get("id"): f for f in franchises if f.get("id")}

    reps = list(
        db.scalars(
            select(Reproduction)
            .where(rep_user_filter(user_id))
            .order_by(Reproduction.rep_id.desc())
            .limit(500)
        ).all()
    )

    series_reps = [
        r
        for r in reps
        if _is_series_path(r.rep_path)
        or getattr(r, "rep_media_type", None) == 400
    ]

    def plays(r: Reproduction) -> int:
        return _rep_weight(r)

    top_episodes = []
    for r in sorted(series_reps, key=plays, reverse=True)[:10]:
        if plays(r) <= 0:
            continue
        path = (r.rep_path or "").replace("\\", "/")
        cover = None
        if media_root and path:
            # Cover from season/parent folder
            folder = media_root / Path(path).parent
            if folder.is_dir():
                cover = _folder_cover(folder, media_root)
        fid, fname = _franchise_from_path(path)
        top_episodes.append(
            {
                "id": r.rep_id,
                "title": _episode_title(path, r.rep_title),
                "title_full": r.rep_title,
                "franchise_id": fid,
                "franchise_name": fname,
                "play_count": plays(r),
                "path": path,
                "cover_url": cover,
                "open_url": f"/api/media/file?path={path}" if path else None,
            }
        )

    franchise_counts: Counter[str] = Counter()
    for r in series_reps:
        fid, _ = _franchise_from_path(r.rep_path)
        if fid and plays(r) > 0:
            franchise_counts[fid] += plays(r)

    top_series = []
    for fid, count in franchise_counts.most_common(10):
        card = by_id.get(fid)
        if not card:
            continue
        top_series.append(
            {
                "id": fid,
                "name": card.get("name") or fid,
                "play_count": count,
                "photo_url": card.get("cover_url"),
                "logo_url": None,
                "icon_url": None,
                "show_name_on_hover": True,
                "cover_url": card.get("cover_url"),
            }
        )

    # Fill remaining Icons from catalog prominence when play history is thin
    if len(top_series) < 10:
        seen = {t["id"] for t in top_series}
        ranked = sorted(
            franchises,
            key=lambda f: (
                -int(f.get("season_count") or 0),
                -int(f.get("subseries_count") or 0),
                (f.get("name") or "").casefold(),
            ),
        )
        for f in ranked:
            fid = f.get("id")
            if not fid or fid in seen:
                continue
            top_series.append(
                {
                    "id": fid,
                    "name": f.get("name") or fid,
                    "play_count": 0,
                    "photo_url": f.get("cover_url"),
                    "logo_url": None,
                    "icon_url": None,
                    "show_name_on_hover": True,
                    "cover_url": f.get("cover_url"),
                }
            )
            seen.add(fid)
            if len(top_series) >= 10:
                break

    # Genres / countries — Series has little play-linked metadata yet; keep panes ready
    top_genres: list[dict] = []
    top_countries: list[dict] = []

    return {
        "top_episodes": top_episodes,
        "top_series": top_series,
        "top_genres": top_genres,
        "top_countries": top_countries,
    }
