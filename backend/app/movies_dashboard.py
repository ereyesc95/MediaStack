"""Movies module home dashboard — Series/Music-shaped panes for Movies."""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.franchise_index import normalize_franchise_slug
from app.models import Country, Reproduction
from app.movies_catalog_meta import movie_vibe_rows
from app.movies_index import build_movies_catalog
from app.profile_scope import rep_user_filter


def _rep_weight(r: Reproduction) -> int:
    raw = getattr(r, "rep_count", None) or getattr(r, "rep_plays", None) or 1
    try:
        return max(1, int(raw))
    except (TypeError, ValueError):
        return 1


def _is_movies_path(path: str | None) -> bool:
    if not path:
        return False
    return path.replace("\\", "/").casefold().startswith("movies/")


def _work_from_path(path: str | None) -> tuple[str | None, str | None]:
    """Return (work_slug, work_display) from a Movies/ path."""
    if not path:
        return None, None
    parts = [p for p in path.replace("\\", "/").split("/") if p]
    if len(parts) < 3 or parts[0].casefold() != "movies":
        return None, None
    name = parts[2]
    return normalize_franchise_slug(name) or name.casefold(), name


def build_movies_dashboard(db: Session, user_id: int) -> dict:
    media_root = Path(settings.media_root) if settings.media_root else None
    catalog = (
        build_movies_catalog(media_root) if media_root else {"franchises": [], "films": []}
    )
    franchises = catalog.get("franchises") or []
    films = catalog.get("films") or []
    films_by_path = {
        (f.get("folder_path") or "").casefold().rstrip("/"): f
        for f in films
        if f.get("folder_path")
    }

    reps = list(
        db.scalars(
            select(Reproduction)
            .where(rep_user_filter(user_id))
            .order_by(Reproduction.rep_id.desc())
            .limit(500)
        ).all()
    )
    movie_reps = [
        r
        for r in reps
        if _is_movies_path(r.rep_path)
        or getattr(r, "rep_media_type", None) == 300
    ]

    def plays(r: Reproduction) -> int:
        return _rep_weight(r)

    # BEST SAGAS — top works/franchises by play count
    work_counts: Counter[str] = Counter()
    for r in movie_reps:
        if plays(r) <= 0:
            continue
        wid, _ = _work_from_path(r.rep_path)
        if wid:
            work_counts[wid] += plays(r)

    by_work = {f.get("id"): f for f in franchises if f.get("id")}
    top_franchises: list[dict] = []
    for wid, count in work_counts.most_common(10):
        card = by_work.get(wid)
        if not card:
            continue
        top_franchises.append(
            {
                "id": wid,
                "name": card.get("name") or wid,
                "play_count": count,
                "photo_url": card.get("cover_url"),
                "cover_url": card.get("cover_url"),
                "logo_url": card.get("logo_url"),
                "icon_url": card.get("icon_url"),
                "show_name_on_hover": not (card.get("logo_url") or card.get("icon_url")),
            }
        )

    if len(top_franchises) < 10:
        seen = {t["id"] for t in top_franchises}
        ranked = sorted(
            franchises,
            key=lambda f: (
                -int(f.get("film_count") or 0),
                (f.get("name") or "").casefold(),
            ),
        )
        for f in ranked:
            wid = f.get("id")
            if not wid or wid in seen:
                continue
            top_franchises.append(
                {
                    "id": wid,
                    "name": f.get("name") or wid,
                    "play_count": 0,
                    "photo_url": f.get("cover_url"),
                    "cover_url": f.get("cover_url"),
                    "logo_url": f.get("logo_url"),
                    "icon_url": f.get("icon_url"),
                    "show_name_on_hover": not (f.get("logo_url") or f.get("icon_url")),
                }
            )
            seen.add(wid)
            if len(top_franchises) >= 10:
                break

    # Keep top_episodes for API compat (unused by home UI)
    top_episodes: list[dict] = []

    # BEST MOVIES (icons) — top films by play count
    film_counts: Counter[str] = Counter()
    for r in movie_reps:
        path = (r.rep_path or "").replace("\\", "/")
        if not path or plays(r) <= 0:
            continue
        folder = str(Path(path).parent).replace("\\", "/")
        film_counts[folder.casefold().rstrip("/")] += plays(r)

    top_series: list[dict] = []
    for folder_key, count in film_counts.most_common(10):
        film = films_by_path.get(folder_key)
        if not film:
            continue
        top_series.append(
            {
                "id": film["id"],
                "name": film.get("title") or film["id"],
                "play_count": count,
                "photo_url": film.get("cover_url"),
                "cover_url": film.get("cover_url"),
                "logo_url": film.get("logo_url"),
                "icon_url": film.get("icon_url"),
                "show_name_on_hover": not (film.get("logo_url") or film.get("icon_url")),
                "work_id": film.get("work_id"),
            }
        )

    if len(top_series) < 10:
        seen = {t["id"] for t in top_series}
        ranked = sorted(
            films,
            key=lambda f: (
                f.get("date_iso") or "9999",
                (f.get("title") or "").casefold(),
            ),
        )
        for f in ranked:
            fid = f.get("id")
            if not fid or fid in seen:
                continue
            top_series.append(
                {
                    "id": fid,
                    "name": f.get("title") or fid,
                    "play_count": 0,
                    "photo_url": f.get("cover_url"),
                    "cover_url": f.get("cover_url"),
                    "logo_url": f.get("logo_url"),
                    "icon_url": f.get("icon_url"),
                    "show_name_on_hover": not (f.get("logo_url") or f.get("icon_url")),
                    "work_id": f.get("work_id"),
                }
            )
            seen.add(fid)
            if len(top_series) >= 10:
                break

    # Film Vibes — movie taxonomy subgenres (not TMDb parent genres)
    top_genres = movie_vibe_rows(db, limit=10)

    # Global Acts — origin countries from MovieWork metadata
    country_iso_counts: Counter[str] = Counter()
    from app.models import MovieWork

    for row in db.scalars(select(MovieWork)).all():
        try:
            meta = json.loads(row.mwk_metadata_json or "{}")
        except (json.JSONDecodeError, TypeError):
            continue
        if not isinstance(meta, dict):
            continue
        blobs: list[dict] = [meta]
        films_meta = meta.get("films") if isinstance(meta.get("films"), dict) else {}
        blobs.extend(b for b in films_meta.values() if isinstance(b, dict))
        for blob in blobs:
            for iso in blob.get("origin_countries") or []:
                code = str(iso).lower()[:2]
                if code:
                    country_iso_counts[code] += 1

    top_countries: list[dict] = []
    for iso, count in country_iso_counts.most_common(10):
        crow = db.scalars(
            select(Country).where(Country.cou_iso.ilike(iso))
        ).first()
        top_countries.append(
            {
                "id": crow.cou_id if crow else None,
                "name": (crow.cou_name if crow else iso.upper()),
                "iso": (crow.cou_iso or iso).lower() if crow else iso,
                "play_count": count,
            }
        )

    return {
        "top_episodes": top_episodes,
        "top_series": top_series,
        "top_genres": top_genres,
        "top_countries": top_countries,
        "franchise_count": len(franchises),
        "film_count": len(films),
        "top_franchises": top_franchises,
        "scanned_at": catalog.get("scanned_at"),
    }
