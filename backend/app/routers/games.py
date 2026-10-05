"""Games module API — disk-index catalog, franchise/leaf overview, launch."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, get_nsfw_unlocked, require_admin
from app.franchise_index import normalize_franchise_slug
from app.games_dashboard import build_games_dashboard
from app.games_index import (
    build_game_detail,
    build_games_catalog,
    build_work_detail,
    resolve_games_path,
)
from app.games_overview import (
    build_game_overview,
    build_games_gallery,
    build_work_overview,
)
from app.models import Genre, Subgenre, User
from app.seed_games import GAMES_MEDIA_TYPE, ensure_games_genres
from app.universes import universe_for_franchise

router = APIRouter(prefix="/api/games", tags=["games"])


@router.get("/catalog")
def games_catalog(
    db: Session = Depends(get_db),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    try:
        from app.adult_content import adult_subgenre_names_from_db, filter_adult_cards
        from app.franchise_identity import (
            enrich_catalog_with_artwork_home,
            enrich_catalog_with_music_identity,
        )

        catalog = build_games_catalog()
        catalog = enrich_catalog_with_music_identity(
            db, catalog, orientation="portrait"
        )
        catalog = enrich_catalog_with_artwork_home(catalog)
        adult_subs = adult_subgenre_names_from_db(db)
        catalog["franchises"] = filter_adult_cards(
            catalog.get("franchises") or [],
            nsfw_unlocked=nsfw_unlocked,
            extra_adult_subgenres=adult_subs,
        )
        catalog["games"] = filter_adult_cards(
            catalog.get("games") or [],
            nsfw_unlocked=nsfw_unlocked,
            extra_adult_subgenres=adult_subs,
        )
        catalog["films"] = catalog["games"]
        return catalog
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("/filters/options")
def games_filter_options(
    db: Session = Depends(get_db),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    from app.adult_content import filter_subgenre_groups

    ensure_games_genres(db)

    parent_genres = {
        g.gen_id: g.gen_name
        for g in db.scalars(
            select(Genre).where(Genre.gen_media_type_id == GAMES_MEDIA_TYPE)
        ).all()
        if g.gen_name and g.gen_name.strip()
    }
    all_by_parent: dict[str, list[dict]] = {}
    for s in db.scalars(
        select(Subgenre)
        .where(Subgenre.sgn_media_type_id == GAMES_MEDIA_TYPE)
        .order_by(Subgenre.sgn_name)
    ).all():
        if not s.sgn_name or not s.sgn_name.strip():
            continue
        parent = parent_genres.get(s.sgn_genre_id or 0)
        if not parent:
            g = db.get(Genre, s.sgn_genre_id or 0)
            parent = (g.gen_name if g and g.gen_name else None) or "Other"
        all_by_parent.setdefault(parent, []).append(
            {
                "id": s.sgn_id,
                "name": s.sgn_name,
                "genre_id": s.sgn_genre_id,
            }
        )
    for items in all_by_parent.values():
        items.sort(key=lambda x: (x.get("name") or "").casefold())
    all_subgenre_groups = [
        {"genre": name, "items": items}
        for name, items in sorted(
            all_by_parent.items(), key=lambda x: x[0].casefold()
        )
    ]
    all_subgenre_groups = filter_subgenre_groups(
        all_subgenre_groups, nsfw_unlocked=nsfw_unlocked
    )

    catalog = build_games_catalog()
    platforms = [
        {"id": p.get("id") or p.get("slug"), "name": p.get("name")}
        for p in (catalog.get("platforms") or [])
        if p.get("name")
    ]

    return {
        "continents": [],
        "countries": [],
        "genres": [
            {"id": item["id"], "name": item["name"]}
            for group in all_subgenre_groups
            for item in group["items"]
        ],
        "platforms": platforms,
        "publishers": [],
        "studios": [],
        "decades": [],
        "country_groups": [],
        "all_country_groups": [],
        "subgenre_groups": all_subgenre_groups,
        "all_subgenre_groups": all_subgenre_groups,
        "content_categories": [],
    }


@router.get("/resolve")
def games_resolve(path: str = Query(..., min_length=1)):
    hit = resolve_games_path(path)
    if not hit:
        raise HTTPException(404, "Path not found under Games/")
    return hit


@router.get("/dashboard")
def games_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
    recent: str = Query("", description="Comma-separated recent game ids"),
):
    recent_ids = [x.strip() for x in recent.split(",") if x.strip()]
    return build_games_dashboard(
        db,
        user.usr_id,
        nsfw_unlocked=nsfw_unlocked,
        recent_game_ids=recent_ids or None,
    )


@router.get("/franchises/{work_id}")
def games_franchise(
    work_id: str,
    db: Session = Depends(get_db),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    from app.adult_content import adult_subgenre_names_from_db, filter_adult_cards

    detail = build_work_detail(work_id)
    if not detail:
        raise HTTPException(404, "Games franchise not found")
    adult_subs = adult_subgenre_names_from_db(db)
    detail["games"] = filter_adult_cards(
        detail.get("games") or [],
        nsfw_unlocked=nsfw_unlocked,
        extra_adult_subgenres=adult_subs,
    )
    detail["films"] = detail["games"]
    uni = universe_for_franchise(db, "games", work_id)
    return {**detail, "universe": uni}


@router.get("/franchises/{work_id}/overview")
def games_franchise_overview(
    work_id: str,
    db: Session = Depends(get_db),
    orientation: str = Query("portrait"),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    from app.adult_content import adult_subgenre_names_from_db, filter_adult_cards

    ov = build_work_overview(work_id, db, orientation=orientation)
    if not ov:
        raise HTTPException(404, "Games franchise not found")
    adult_subs = adult_subgenre_names_from_db(db)
    ov["games"] = filter_adult_cards(
        ov.get("games") or [],
        nsfw_unlocked=nsfw_unlocked,
        extra_adult_subgenres=adult_subs,
    )
    ov["films"] = ov["games"]
    return ov


@router.get("/franchises/{work_id}/media/{kind}")
def games_franchise_media(
    work_id: str,
    kind: str,
    db: Session = Depends(get_db),
):
    detail = build_work_detail(work_id)
    if not detail:
        raise HTTPException(404, "Games franchise not found")
    kind_l = (kind or "").casefold()
    if kind_l in ("games", "game"):
        return {"items": detail.get("games") or []}
    if kind_l == "audio":
        from app.series_audio import scan_folder_audio

        folder_paths = [detail.get("folder_path") or ""]
        folder_paths.extend(
            g.get("folder_path") or ""
            for g in detail.get("games") or []
            if isinstance(g, dict)
        )
        releases: list[dict] = []
        seen: set[str] = set()
        for folder_path in folder_paths:
            for release in scan_folder_audio(db, folder_path).get("releases") or []:
                key = str(
                    release.get("folder_path") or release.get("id") or ""
                ).casefold()
                if key and key in seen:
                    continue
                if key:
                    seen.add(key)
                releases.append(release)
        categories = sorted(
            {r.get("category") for r in releases if r.get("category")}
        )
        return {
            "releases": releases,
            "categories": categories,
            "band_id": None,
            "source": "games",
        }
    root = Path(settings.media_root or "")
    from app.franchise_index import (
        build_franchise_index,
        load_franchise_index,
        save_franchise_index,
    )

    slug = normalize_franchise_slug(work_id) or work_id.casefold()
    index = load_franchise_index()
    if index is None and root.is_dir():
        index = build_franchise_index(root)
        save_franchise_index(index)
    bucket = index.franchises.get(slug) if index else None
    kind_map = {
        "series": "series",
        "movies": "movie",
        "movie": "movie",
        "books": "book",
        "book": "book",
        "music": "music",
    }
    entry_kind = kind_map.get(kind_l)
    items: list[dict] = []
    if bucket and entry_kind:
        for entry in bucket.entries:
            if entry.kind != entry_kind:
                continue
            items.append(
                {
                    "id": entry.path,
                    "title": entry.title or entry.franchise_display,
                    "date_iso": entry.date_iso,
                    "path": entry.path,
                    "platform": entry.platform,
                    "cover_url": None,
                    "navigate_franchise_id": slug,
                    "open_mode": entry_kind if entry_kind != "movie" else "movies",
                }
            )
    return {"items": items}


@router.get("/games/{game_id}/media/audio")
def games_game_audio(game_id: str, db: Session = Depends(get_db)):
    """Audio under the game folder's Audio / [Audio] bucket."""
    detail = build_game_detail(game_id)
    if not detail:
        raise HTTPException(404, "Game not found")
    from app.series_audio import scan_folder_audio

    return scan_folder_audio(db, detail.get("folder_path") or "")


@router.post("/franchises/{work_id}/refresh-metadata")
async def games_franchise_refresh_metadata(
    work_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Pull IGDB metadata into franchise about (scaffold for studio/publisher)."""
    from app.games_refresh import refresh_franchise_metadata

    detail = build_work_detail(work_id)
    if not detail:
        raise HTTPException(404, "Games franchise not found")
    result = await refresh_franchise_metadata(db, work_id, detail)
    return result


@router.post("/games/{game_id}/refresh-metadata")
async def games_game_refresh_metadata(
    game_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    from app.games_refresh import refresh_game_metadata

    detail = build_game_detail(game_id)
    if not detail:
        raise HTTPException(404, "Game not found")
    result = await refresh_game_metadata(db, game_id, detail)
    return result


@router.get("/games/{game_id}")
def games_game_detail(
    game_id: str,
    db: Session = Depends(get_db),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _ = db, nsfw_unlocked
    detail = build_game_detail(game_id)
    if not detail:
        raise HTTPException(404, "Game not found")
    return detail


@router.get("/games/{game_id}/overview")
def games_game_overview(
    game_id: str,
    db: Session = Depends(get_db),
    orientation: str = Query("portrait"),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    from app.adult_content import adult_subgenre_names_from_db, filter_adult_cards

    ov = build_game_overview(game_id, db, orientation=orientation)
    if not ov:
        raise HTTPException(404, "Game not found")
    adult_subs = adult_subgenre_names_from_db(db)
    for key in ("games", "sibling_games", "films"):
        if key in ov:
            ov[key] = filter_adult_cards(
                ov.get(key) or [],
                nsfw_unlocked=nsfw_unlocked,
                extra_adult_subgenres=adult_subs,
            )
    return ov


@router.get("/games/{game_id}/gallery")
def games_game_gallery(
    game_id: str,
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    detail = build_game_detail(game_id)
    if not detail:
        raise HTTPException(404, "Game not found")
    path = detail.get("folder_path") or ""
    return build_games_gallery(path, nsfw_unlocked=nsfw_unlocked)


@router.get("/franchises/{work_id}/gallery")
def games_franchise_gallery(
    work_id: str,
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    detail = build_work_detail(work_id)
    if not detail:
        raise HTTPException(404, "Games franchise not found")
    path = detail.get("folder_path") or ""
    return build_games_gallery(path, nsfw_unlocked=nsfw_unlocked)


@router.post("/games/{game_id}/launch")
def games_launch(game_id: str):
    """Open the primary ROM/ISO with the OS default application."""
    detail = build_game_detail(game_id)
    if not detail:
        raise HTTPException(404, "Game not found")
    launch_path = detail.get("launch_path")
    if not launch_path:
        raise HTTPException(404, "No launchable game file found")
    from app.routers.media import open_local_media

    return open_local_media(path=launch_path)
