"""Games module home dashboard."""
from __future__ import annotations

from collections import Counter
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adult_content import filter_adult_cards
from app.config import settings
from app.games_index import build_games_catalog
from app.models import Subgenre
from app.play_stats import subgenre_image_url
from app.platform_assets import platform_card_urls
from app.seed_games import GAMES_MEDIA_TYPE, ensure_games_genres


def build_games_dashboard(
    db: Session | None = None,
    user_id: int | None = None,
    *,
    nsfw_unlocked: bool = False,
    recent_game_ids: list[str] | None = None,
) -> dict:
    _ = user_id
    from app.franchise_identity import enrich_catalog_with_artwork_home
    from app.games_catalog_meta import enrich_games_catalog

    media_root = Path(settings.media_root) if settings.media_root else None
    catalog = (
        build_games_catalog(media_root)
        if media_root and media_root.is_dir()
        else {"franchises": [], "games": [], "platforms": []}
    )
    catalog = enrich_catalog_with_artwork_home(catalog, media_root=media_root)
    if db is not None:
        catalog = enrich_games_catalog(db, catalog)
    franchises = filter_adult_cards(
        catalog.get("franchises") or [], nsfw_unlocked=nsfw_unlocked
    )
    games = filter_adult_cards(
        catalog.get("games") or [], nsfw_unlocked=nsfw_unlocked
    )
    platforms = list(catalog.get("platforms") or [])
    for p in platforms:
        art = platform_card_urls(p.get("name"))
        if art.get("cover_url"):
            p["cover_url"] = art["cover_url"]
            p["portrait_url"] = art["cover_url"]
            p["landscape_url"] = art["cover_url"]
        if art.get("logo_url"):
            p["logo_url"] = art["logo_url"]
        if art.get("icon_url"):
            p["icon_url"] = art["icon_url"]

    def is_saga(card: dict | None) -> bool:
        if not card or card.get("is_standalone"):
            return False
        return int(card.get("game_count") or card.get("film_count") or 0) > 1

    sagas = [f for f in franchises if is_saga(f)]
    recent: list[dict] = []
    by_id = {(g.get("id") or ""): g for g in games}
    if recent_game_ids:
        for gid in recent_game_ids:
            hit = by_id.get(gid)
            if hit:
                recent.append(hit)

    # Most-visited first (recent order), then fill with remaining catalog games
    top_games: list[dict] = []
    seen: set[str] = set()
    for g in recent:
        gid = g.get("id") or ""
        if gid and gid not in seen:
            top_games.append(g)
            seen.add(gid)
    for g in games:
        gid = g.get("id") or ""
        if gid and gid not in seen:
            top_games.append(g)
            seen.add(gid)
        if len(top_games) >= 12:
            break
    top_games = top_games[:12]

    genre_counts: Counter[str] = Counter()
    genre_meta: dict[str, dict] = {}
    for card in games:
        if not isinstance(card, dict):
            continue
        names = card.get("genre_names") or []
        if not isinstance(names, list):
            continue
        for name in names:
            label = str(name or "").strip()
            if not label:
                continue
            key = label.casefold()
            genre_counts[key] += 1
            genre_meta.setdefault(key, {"name": label})

    top_genres: list[dict] = []
    if db is not None:
        ensure_games_genres(db)
        subs_by_name = {
            (s.sgn_name or "").casefold(): s
            for s in db.scalars(
                select(Subgenre).where(Subgenre.sgn_media_type_id == GAMES_MEDIA_TYPE)
            ).all()
            if s.sgn_name
        }
        for key, count in genre_counts.most_common(10):
            meta = genre_meta.get(key) or {"name": key.title()}
            name = meta["name"]
            sg = subs_by_name.get(key)
            top_genres.append(
                {
                    "id": sg.sgn_id if sg else name,
                    "name": (sg.sgn_name if sg else name),
                    "play_count": count,
                    "image_url": subgenre_image_url(sg.sgn_name if sg else name),
                }
            )

    return {
        "platforms": platforms,
        "recent_games": recent[:12],
        "top_franchises": sagas[:12]
        or [f for f in franchises if not f.get("is_standalone")][:12],
        "top_games": top_games,
        "top_films": top_games,
        "top_series": top_games,
        "franchise_count": len(franchises),
        "game_count": len(games),
        "platform_count": len(platforms),
        "scanned_at": catalog.get("scanned_at"),
        "top_genres": top_genres,
        "universes": [],
    }
