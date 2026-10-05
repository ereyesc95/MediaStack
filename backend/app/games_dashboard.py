"""Games module home dashboard."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.adult_content import filter_adult_cards
from app.config import settings
from app.games_index import build_games_catalog


def build_games_dashboard(
    db: Session | None = None,
    user_id: int | None = None,
    *,
    nsfw_unlocked: bool = False,
    recent_game_ids: list[str] | None = None,
) -> dict:
    _ = db, user_id
    media_root = Path(settings.media_root) if settings.media_root else None
    catalog = (
        build_games_catalog(media_root)
        if media_root and media_root.is_dir()
        else {"franchises": [], "games": [], "platforms": []}
    )
    franchises = filter_adult_cards(
        catalog.get("franchises") or [], nsfw_unlocked=nsfw_unlocked
    )
    games = filter_adult_cards(
        catalog.get("games") or [], nsfw_unlocked=nsfw_unlocked
    )
    platforms = list(catalog.get("platforms") or [])

    def is_saga(card: dict | None) -> bool:
        if not card or card.get("is_standalone"):
            return False
        return int(card.get("game_count") or card.get("film_count") or 0) > 1

    sagas = [f for f in franchises if is_saga(f)]
    recent: list[dict] = []
    if recent_game_ids:
        by_id = {(g.get("id") or ""): g for g in games}
        for gid in recent_game_ids:
            hit = by_id.get(gid)
            if hit:
                recent.append(hit)

    return {
        "platforms": platforms[:24],
        "recent_games": recent[:12],
        "top_franchises": sagas[:12]
        or [f for f in franchises if not f.get("is_standalone")][:12],
        "top_games": games[:12],
        "top_films": games[:12],
        "franchise_count": len(franchises),
        "game_count": len(games),
        "platform_count": len(platforms),
        "scanned_at": catalog.get("scanned_at"),
        "top_genres": [],
        "universes": [],
    }
