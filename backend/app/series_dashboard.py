"""Series module home dashboard — mirrors music_dashboard panes for Series."""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.franchise_identity import (
    enrich_catalog_with_artwork_home,
    enrich_catalog_with_music_identity,
)
from app.franchise_index import normalize_franchise_slug
from app.models import Country, Reproduction, Series
from app.play_stats import subgenre_image_url
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


def _franchise_from_path(path: str | None) -> tuple[str | None, str | None]:
    """Return (franchise_id/slug, franchise_display) from a Series/ path."""
    if not path:
        return None, None
    parts = [p for p in path.replace("\\", "/").split("/") if p]
    if len(parts) < 3 or parts[0].casefold() != "series":
        return None, None
    name = parts[2]
    return normalize_franchise_slug(name) or name.casefold(), name


def _subseries_from_path(path: str | None) -> str | None:
    """Best-effort subseries folder name from a Series/… episode path."""
    if not path:
        return None
    parts = [p for p in path.replace("\\", "/").split("/") if p]
    # Series/{Letter}/{Franchise}/{Subseries}/… or …/Seasons/…
    if len(parts) < 4 or parts[0].casefold() != "series":
        return None
    candidate = parts[3]
    if candidate.casefold() in {"seasons", "season", "gallery", "audio", "[audio]", "extras"}:
        return None
    return candidate


def _iter_catalog_subseries(franchises: list[dict]) -> list[dict]:
    """Flatten franchise.subseries into icon-card shaped rows."""
    out: list[dict] = []
    for f in franchises:
        fid = f.get("id")
        fname = f.get("name") or fid
        for s in f.get("subseries") or []:
            sid = s.get("id")
            if not sid:
                continue
            out.append(
                {
                    "id": f"{fid}::{sid}",
                    "name": s.get("title") or sid,
                    "franchise_id": fid,
                    "subseries_id": sid,
                    "franchise_name": fname,
                    "play_count": 0,
                    "portrait_url": s.get("portrait_url") or s.get("cover_url"),
                    "landscape_url": s.get("landscape_url"),
                    "banner_url": s.get("banner_url") or s.get("landscape_url"),
                    "photo_url": s.get("portrait_url") or s.get("cover_url") or f.get("portrait_url") or f.get("cover_url"),
                    "cover_url": s.get("portrait_url") or s.get("cover_url") or f.get("portrait_url") or f.get("cover_url"),
                    "logo_url": s.get("logo_url"),
                    "icon_url": s.get("icon_url"),
                    "show_name_on_hover": True,
                    "date_iso": s.get("date_iso"),
                    "season_count": int(s.get("season_count") or 0),
                }
            )
    return out


def build_series_dashboard(
    db: Session, user_id: int, *, nsfw_unlocked: bool = False
) -> dict:
    media_root = Path(settings.media_root) if settings.media_root else None
    catalog = build_series_catalog(media_root) if media_root else {"franchises": []}
    from app.adult_content import adult_subgenre_names_from_db, filter_adult_cards
    from app.series_catalog_meta import enrich_catalog_metadata

    catalog = enrich_catalog_metadata(db, catalog)
    catalog = enrich_catalog_with_music_identity(
        db, catalog, orientation="portrait", media_root=media_root
    )
    catalog = enrich_catalog_with_artwork_home(catalog, media_root=media_root)
    franchises = filter_adult_cards(
        catalog.get("franchises") or [],
        nsfw_unlocked=nsfw_unlocked,
        extra_adult_subgenres=adult_subgenre_names_from_db(db),
    )
    by_id = {f.get("id"): f for f in franchises if f.get("id")}
    catalog_subs = _iter_catalog_subseries(franchises)
    subs_by_key = {s["id"]: s for s in catalog_subs}
    # Also index by franchise_id::name.casefold for play-path matching
    subs_by_franchise_title: dict[str, dict] = {}
    for s in catalog_subs:
        key = f"{s['franchise_id']}::{(s.get('name') or '').casefold()}"
        subs_by_franchise_title[key] = s
        key2 = f"{s['franchise_id']}::{(s.get('subseries_id') or '').casefold()}"
        subs_by_franchise_title[key2] = s

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

    def _is_saga_card(card: dict | None) -> bool:
        """True multi-show franchises only — standalones belong in Best Series."""
        if not card or card.get("is_standalone"):
            return False
        n = int(card.get("subseries_count") or 0)
        if not n:
            n = len(card.get("subseries") or [])
        return n > 1

    # BEST SAGAS — top franchises by play count (fill from catalog)
    franchise_counts: Counter[str] = Counter()
    for r in series_reps:
        if plays(r) <= 0:
            continue
        fid, _ = _franchise_from_path(r.rep_path)
        if fid:
            franchise_counts[fid] += plays(r)

    top_franchises: list[dict] = []
    for fid, count in franchise_counts.most_common(10):
        card = by_id.get(fid)
        if not _is_saga_card(card):
            continue
        top_franchises.append(
            {
                "id": fid,
                "name": card.get("name") or fid,
                "play_count": count,
                "portrait_url": card.get("portrait_url") or card.get("cover_url"),
                "landscape_url": card.get("landscape_url"),
                "banner_url": card.get("banner_url") or card.get("landscape_url"),
                "photo_url": card.get("portrait_url") or card.get("cover_url"),
                "cover_url": card.get("portrait_url") or card.get("cover_url"),
                "logo_url": card.get("logo_url"),
                "icon_url": card.get("icon_url"),
                "show_name_on_hover": True,
                "is_music_franchise": bool(card.get("is_music_franchise")),
                "music_band_id": card.get("music_band_id"),
                "artwork_home_module": card.get("artwork_home_module"),
            }
        )

    if len(top_franchises) < 10:
        seen = {t["id"] for t in top_franchises}
        ranked = sorted(
            (f for f in franchises if _is_saga_card(f)),
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
            top_franchises.append(
                {
                    "id": fid,
                    "name": f.get("name") or fid,
                    "play_count": 0,
                    "portrait_url": f.get("portrait_url") or f.get("cover_url"),
                    "landscape_url": f.get("landscape_url"),
                    "banner_url": f.get("banner_url") or f.get("landscape_url"),
                    "photo_url": f.get("portrait_url") or f.get("cover_url"),
                    "cover_url": f.get("portrait_url") or f.get("cover_url"),
                    "logo_url": f.get("logo_url"),
                    "icon_url": f.get("icon_url"),
                    "show_name_on_hover": True,
                    "is_music_franchise": bool(f.get("is_music_franchise")),
                    "music_band_id": f.get("music_band_id"),
                    "artwork_home_module": f.get("artwork_home_module"),
                }
            )
            seen.add(fid)
            if len(top_franchises) >= 10:
                break

    # Keep top_episodes for API compat (unused by home UI)
    top_episodes: list[dict] = []

    # BEST SERIES (icons) — top subseries (not franchises)
    sub_counts: Counter[str] = Counter()
    for r in series_reps:
        if plays(r) <= 0:
            continue
        fid, _ = _franchise_from_path(r.rep_path)
        sid = _subseries_from_path(r.rep_path)
        if not fid:
            continue
        if sid:
            key = f"{fid}::{sid}"
            hit = subs_by_key.get(key) or subs_by_franchise_title.get(
                f"{fid}::{sid.casefold()}"
            )
            if hit:
                sub_counts[hit["id"]] += plays(r)
                continue
        # Fall back: attribute plays to first/only subseries of franchise
        card = by_id.get(fid)
        subs = (card or {}).get("subseries") or []
        if len(subs) == 1:
            only = subs[0]
            sub_counts[f"{fid}::{only.get('id')}"] += plays(r)
        elif not subs:
            # Franchise with no nested subseries — treat franchise as the show
            sub_counts[f"{fid}::"] += plays(r)

    top_series: list[dict] = []
    for key, count in sub_counts.most_common(10):
        hit = subs_by_key.get(key)
        if hit:
            top_series.append({**hit, "play_count": count})
            continue
        if key.endswith("::"):
            fid = key[:-2]
            card = by_id.get(fid)
            if not card:
                continue
            top_series.append(
                {
                    "id": fid,
                    "name": card.get("name") or fid,
                    "franchise_id": fid,
                    "subseries_id": None,
                    "franchise_name": card.get("name"),
                    "play_count": count,
                    "portrait_url": card.get("portrait_url") or card.get("cover_url"),
                    "landscape_url": card.get("landscape_url"),
                    "banner_url": card.get("banner_url") or card.get("landscape_url"),
                    "photo_url": card.get("portrait_url") or card.get("cover_url"),
                    "cover_url": card.get("portrait_url") or card.get("cover_url"),
                    "logo_url": card.get("logo_url"),
                    "icon_url": card.get("icon_url"),
                    "show_name_on_hover": True,
                }
            )

    if len(top_series) < 10:
        seen = {t["id"] for t in top_series}
        ranked = sorted(
            catalog_subs,
            key=lambda s: (
                -int(s.get("season_count") or 0),
                s.get("date_iso") or "9999",
                (s.get("name") or "").casefold(),
            ),
        )
        for s in ranked:
            if s["id"] in seen:
                continue
            top_series.append(dict(s))
            seen.add(s["id"])
            if len(top_series) >= 10:
                break
        # Franchises with zero nested subseries
        if len(top_series) < 10:
            for f in franchises:
                fid = f.get("id")
                if not fid or fid in seen or (f.get("subseries") or []):
                    continue
                top_series.append(
                    {
                        "id": fid,
                        "name": f.get("name") or fid,
                        "franchise_id": fid,
                        "subseries_id": None,
                        "play_count": 0,
                        "portrait_url": f.get("portrait_url") or f.get("cover_url"),
                        "landscape_url": f.get("landscape_url"),
                        "banner_url": f.get("banner_url") or f.get("landscape_url"),
                        "photo_url": f.get("portrait_url") or f.get("cover_url"),
                        "cover_url": f.get("portrait_url") or f.get("cover_url"),
                        "logo_url": f.get("logo_url"),
                        "icon_url": f.get("icon_url"),
                        "show_name_on_hover": True,
                    }
                )
                seen.add(fid)
                if len(top_series) >= 10:
                    break

    # SHOW VIBES / GLOBAL ACTS — from Series DB metadata
    from app.models import Subgenre

    genre_counts: Counter[str] = Counter()
    genre_meta: dict[str, dict] = {}
    country_counts: Counter[str] = Counter()

    series_subs_by_name: dict[str, dict] = {}
    for s in db.scalars(
        select(Subgenre).where(Subgenre.sgn_media_type_id.in_([300, 400]))
    ).all():
        name = (s.sgn_name or "").strip()
        if not name:
            continue
        key = name.casefold()
        # Prefer Series (400) over Movies when both exist
        prev = series_subs_by_name.get(key)
        if not prev or s.sgn_media_type_id == 400:
            series_subs_by_name[key] = {"id": s.sgn_id, "name": name}

    for row in db.scalars(select(Series)).all():
        weight = 1
        try:
            genres = json.loads(row.ser_genres_json or "[]")
        except (json.JSONDecodeError, TypeError):
            genres = []
        if isinstance(genres, list):
            for g in genres:
                if isinstance(g, dict):
                    name = (g.get("name") or "").strip()
                    gid = g.get("id") or name
                else:
                    name = str(g).strip()
                    gid = name
                if not name:
                    continue
                key = name.casefold()
                resolved = series_subs_by_name.get(key)
                if resolved:
                    gid = resolved["id"]
                    name = resolved["name"]
                genre_counts[key] += weight
                genre_meta[key] = {"id": gid, "name": name}
        iso = (row.ser_country_iso or "").strip().lower()[:2]
        if iso:
            country_counts[iso] += weight

    top_genres: list[dict] = []
    for key, count in genre_counts.most_common(10):
        meta = genre_meta.get(key) or {"id": key, "name": key.title()}
        top_genres.append(
            {
                "id": meta["id"],
                "name": meta["name"],
                "play_count": count,
                "image_url": subgenre_image_url(meta["name"]),
            }
        )

    top_countries: list[dict] = []
    for iso, count in country_counts.most_common(10):
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
        "top_franchises": top_franchises,
        "top_series": top_series,
        "top_genres": top_genres,
        "top_countries": top_countries,
    }
