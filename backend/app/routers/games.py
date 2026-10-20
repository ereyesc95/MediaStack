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


@router.get("/roms/platforms")
def games_rom_platforms(_admin: User = Depends(require_admin)):
    """List platforms for Organize loose ROMs."""
    from app.games_rom_organize import list_rom_platforms

    try:
        return {"platforms": list_rom_platforms()}
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/roms/scan")
def games_rom_scan(
    body: dict,
    _admin: User = Depends(require_admin),
):
    """Preview loose ROMs at Games/{Platform}/ root (max 500)."""
    from app.games_rom_organize import scan_platform_roms

    platform = str((body or {}).get("platform") or "").strip()
    if not platform:
        raise HTTPException(400, "platform is required")
    try:
        return scan_platform_roms(platform)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/roms/organize")
async def games_rom_organize(
    body: dict,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Move loose ROMs into normal game folders; optional IGDB enrich after."""
    from app.games_rom_organize import organize_and_enrich

    platform = str((body or {}).get("platform") or "").strip()
    if not platform:
        raise HTTPException(400, "platform is required")
    raw_keys = (body or {}).get("keys")
    keys = None
    if isinstance(raw_keys, list):
        keys = [str(k) for k in raw_keys if str(k).strip()]
    enrich = bool((body or {}).get("enrich", True))
    try:
        return await organize_and_enrich(
            db, platform, keys=keys, enrich=enrich
        )
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


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

        from app.games_catalog_meta import enrich_games_catalog

        catalog = build_games_catalog()
        catalog = enrich_catalog_with_music_identity(
            db, catalog, orientation="portrait"
        )
        catalog = enrich_catalog_with_artwork_home(catalog)
        catalog = enrich_games_catalog(db, catalog)
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
    from app.adult_content import filter_adult_cards, filter_subgenre_groups

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

    from app.games_catalog_meta import enrich_games_catalog

    catalog = enrich_games_catalog(db, build_games_catalog())
    games = filter_adult_cards(
        catalog.get("games") or [], nsfw_unlocked=nsfw_unlocked
    )
    platforms = [
        {"id": p.get("id") or p.get("slug"), "name": p.get("name")}
        for p in (catalog.get("platforms") or [])
        if p.get("name")
    ]

    # Only expose genres that appear on at least one game in the library.
    used_genre_by_key: dict[str, str] = {}
    for g in games:
        for n in g.get("genre_names") or []:
            label = str(n).strip()
            if label:
                used_genre_by_key.setdefault(label.casefold(), label)
    used_genre_names = set(used_genre_by_key)
    if used_genre_names:
        filtered_groups: list[dict] = []
        matched_names: set[str] = set()
        for group in all_subgenre_groups:
            items = [
                item
                for item in group.get("items") or []
                if str(item.get("name") or "").strip().casefold() in used_genre_names
            ]
            for item in items:
                matched_names.add(str(item.get("name") or "").strip().casefold())
            if items:
                filtered_groups.append({"genre": group["genre"], "items": items})
        # Card genres not present in the seeded taxonomy still need filter chips.
        orphans = sorted(
            (
                used_genre_by_key[k]
                for k in used_genre_names - matched_names
            ),
            key=lambda s: s.casefold(),
        )
        if orphans:
            orphan_items = [
                {
                    "id": -(abs(hash(name.casefold())) % 900000 + 100000),
                    "name": name,
                }
                for name in orphans
            ]
            filtered_groups.append({"genre": "Other", "items": orphan_items})
        subgenre_groups = filtered_groups
    else:
        # No tagged games yet — keep taxonomy empty so Genre tab stays hidden
        # until metadata exists (avoids empty-result genres).
        subgenre_groups = []

    publishers = sorted(
        {
            str(n).strip()
            for g in games
            for n in (g.get("publishers") or [])
            if str(n).strip()
        },
        key=lambda s: s.casefold(),
    )
    developers = sorted(
        {
            str(n).strip()
            for g in games
            for n in (g.get("developers") or [])
            if str(n).strip()
        },
        key=lambda s: s.casefold(),
    )
    directors = sorted(
        {
            str(n).strip()
            for g in games
            for n in (g.get("directors") or g.get("writers") or [])
            if str(n).strip()
        },
        key=lambda s: s.casefold(),
    )
    decades: list[int] = []
    decade_set: set[int] = set()
    for g in games:
        iso = str(g.get("date_iso") or "")
        if len(iso) >= 4 and iso[:4].isdigit():
            decade_set.add((int(iso[:4]) // 10) * 10)
    decades = sorted(decade_set)

    from app.franchise_index import GAME_PLATFORMS

    return {
        "continents": [],
        "countries": [],
        "genres": [
            {"id": item["id"], "name": item["name"]}
            for group in subgenre_groups
            for item in group["items"]
        ],
        "platforms": platforms,
        "platform_options": list(GAME_PLATFORMS),
        "publishers": publishers,
        "developers": developers,
        "writers": directors,
        "studios": developers,
        "decades": decades,
        "country_groups": [],
        "all_country_groups": [],
        # Catalog Genre filter: only genres used by games in the library.
        # Edit-game modal uses all_subgenre_groups (full taxonomy by parent).
        "subgenre_groups": subgenre_groups,
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


@router.get("/games/{game_id}/player-tracks")
def games_game_player_tracks(game_id: str, db: Session = Depends(get_db)):
    """Playable audio tracks from a game folder's Audio/ shortcuts."""
    from app.series_extras import collect_game_audio_tracks

    tracks = collect_game_audio_tracks(db, game_id)
    return {"tracks": tracks, "count": len(tracks)}


@router.patch("/games/{game_id}/about")
def games_game_patch_about(
    game_id: str,
    body: dict,
    _admin: User = Depends(require_admin),
):
    from app.games_admin import patch_game_about

    try:
        return patch_game_about(
            game_id,
            bio=body.get("bio"),
            developers=body.get("developers") or body.get("writers"),
            publishers=body.get("publishers"),
            platform=body.get("platform"),
            activity_start=body.get("activity_start") or body.get("release_date"),
            languages=body.get("languages"),
            genres=body.get("genres"),
            web_url=body.get("web_url"),
        )
    except ValueError as exc:
        msg = str(exc)
        status = 404 if "not found" in msg.casefold() else 400
        raise HTTPException(status, msg) from exc


@router.post("/games/{game_id}/cast")
def games_game_add_cast(
    game_id: str,
    body: dict,
    _admin: User = Depends(require_admin),
):
    from app.games_admin import add_game_cast_member

    try:
        return add_game_cast_member(
            game_id,
            kind=body.get("kind") or body.get("bucket") or "characters",
            name=body.get("name") or body.get("character") or "",
            character=body.get("character"),
            photo_url=body.get("photo_url"),
            character_photo_url=body.get("character_photo_url"),
            roles=body.get("roles"),
            language=body.get("language"),
            actors=body.get("actors"),
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.patch("/games/{game_id}/cast/{member_id}")
def games_game_patch_cast(
    game_id: str,
    member_id: str,
    body: dict,
    _admin: User = Depends(require_admin),
):
    from app.games_admin import patch_game_cast_member

    try:
        return patch_game_cast_member(
            game_id,
            member_id,
            kind=body.get("kind") or body.get("bucket") or "characters",
            name=body.get("name"),
            character=body.get("character"),
            photo_url=body.get("photo_url"),
            actor_photo_url=body.get("actor_photo_url"),
            actors=body.get("actors"),
            roles=body.get("roles"),
            language=body.get("language"),
            delete=bool(body.get("delete")),
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


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
    db: Session = Depends(get_db),
):
    detail = build_game_detail(game_id)
    if not detail:
        raise HTTPException(404, "Game not found")
    path = detail.get("folder_path") or ""
    payload = build_games_gallery(path, nsfw_unlocked=nsfw_unlocked)
    if nsfw_unlocked:
        from app.exclusive_links import merge_exclusive_links_into_sections_gallery

        title = (detail.get("title") or detail.get("name") or "").strip()
        merge_exclusive_links_into_sections_gallery(
            payload, db, media_type="games", entity_name=title or None
        )
    return payload


@router.get("/franchises/{work_id}/gallery")
def games_franchise_gallery(
    work_id: str,
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
    db: Session = Depends(get_db),
):
    detail = build_work_detail(work_id)
    if not detail:
        raise HTTPException(404, "Games franchise not found")
    path = detail.get("folder_path") or ""
    payload = build_games_gallery(path, nsfw_unlocked=nsfw_unlocked)
    if nsfw_unlocked:
        from app.exclusive_links import merge_exclusive_links_into_sections_gallery

        title = (detail.get("title") or detail.get("name") or "").strip()
        merge_exclusive_links_into_sections_gallery(
            payload, db, media_type="games", entity_name=title or None
        )
    return payload


@router.post("/games/{game_id}/launch")
def games_launch(game_id: str):
    """Open the primary ROM/ISO, or return a Web game URL for the client."""
    detail = build_game_detail(game_id)
    if not detail:
        raise HTTPException(404, "Game not found")
    if detail.get("open_mode") == "web" and detail.get("open_url"):
        return {
            "ok": True,
            "open_mode": "web",
            "url": detail["open_url"],
        }
    launch_path = detail.get("launch_path")
    if not launch_path:
        raise HTTPException(404, "No launchable game file found")
    from app.routers.media import open_local_media

    return open_local_media(path=launch_path)
