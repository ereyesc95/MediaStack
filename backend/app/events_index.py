"""Global EVENTS index — all attended shows across artists."""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.company_assets import company_logo_url
from app.config import settings
from app.gallery import (
    _artist_dir,
    _gallery_subdir,
    _list_era_brands,
    _media_url,
    _pick_brand_for_year,
)
from app.models import Band, Country, Genre, Subgenre, Tour, TourShow
from app.music_filters import _parse_ids
from app.tours_index import (
    _artwork_url,
    _list_prefixed_images,
    _subdir,
    show_slug,
    sync_all_band_tours,
    sync_band_tours,
    tour_slug,
)


def _band_country_id(band: Band) -> int | None:
    raw = (band.bnd_fk_countries or "").strip()
    if not raw:
        return None
    ids = _parse_ids(raw.split("[")[0] if "[" in raw else raw)
    return ids[0] if ids else None


def _year_from_iso(date_iso: str | None) -> int | None:
    if not date_iso or len(date_iso) < 4 or not date_iso[:4].isdigit():
        return None
    return int(date_iso[:4])


def _folder_exists(folder_path: str | None, media_root: Path | None) -> bool:
    if not folder_path or not media_root:
        return True
    try:
        return (media_root / folder_path).is_dir()
    except OSError:
        return False


def _promo_prefixed_url(
    show_folder: str | None,
    prefix: str,
    media_root: Path | None,
) -> str | None:
    if not show_folder or not media_root:
        return None
    try:
        show_dir = media_root / show_folder
        if not show_dir.is_dir():
            return None
        promo = _subdir(show_dir, "Promo")
        if not promo:
            return None
        imgs = _list_prefixed_images(promo, prefix)
        if not imgs:
            return None
        return _media_url(imgs[0], media_root)
    except OSError:
        return None


def _resolve_tour_logo(
    tour: Tour,
    media_root: Path | None,
) -> str | None:
    if tour.tur_logo_url:
        return tour.tur_logo_url
    if not media_root or not tour.tur_folder_path:
        return None
    try:
        tour_dir = media_root / tour.tur_folder_path
        art = _subdir(tour_dir, "[Artwork]") or _subdir(tour_dir, "Artwork")
        url = _artwork_url(art, "Logo", media_root)
        if url:
            return url
        # Opener tours: fall back to main-artist tour Artwork when local logo missing
        if tour.tur_is_support and tour.tur_main_artist_name:
            main_dir = _artist_dir(media_root, tour.tur_main_artist_name)
            if main_dir:
                # Match by tour title under main artist's Tours/
                tours_root = _subdir(main_dir, "Tours")
                if tours_root:
                    title = (tour.tur_title or "").casefold()
                    for child in tours_root.iterdir():
                        if not child.is_dir():
                            continue
                        # Skip other openers' folders
                        if "[by " in child.name.casefold():
                            continue
                        if title and title in child.name.casefold():
                            main_art = _subdir(child, "[Artwork]") or _subdir(
                                child, "Artwork"
                            )
                            return _artwork_url(main_art, "Logo", media_root)
    except OSError:
        return None
    return None


def _era_branding_for_year(
    band: Band,
    year: int | None,
    media_root: Path | None,
) -> tuple[str | None, str | None]:
    if not media_root or year is None:
        return None, None
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return None, None
    brands = _list_era_brands(_gallery_subdir(artist_dir, "Branding"))
    if not brands:
        return None, None
    seed = f"event:{band.bnd_id}"
    icon = _pick_brand_for_year(brands, year, "icon", seed=seed)
    logo = _pick_brand_for_year(brands, year, "logo", seed=seed)
    icon_url = _media_url(icon.path, media_root) if icon else None
    logo_url = _media_url(logo.path, media_root) if logo else None
    return icon_url, logo_url


def _band_subgenre_names(
    band: Band,
    subgenre_cache: dict[int, Subgenre],
) -> list[str]:
    names: list[str] = []
    for sid in _parse_ids(band.bnd_fk_subgenres):
        sg = subgenre_cache.get(sid)
        if sg and sg.sgn_name:
            names.append(sg.sgn_name)
    return names


def _enrich_show(
    db: Session,
    s: TourShow,
    tour: Tour,
    band: Band,
    *,
    media_root: Path | None,
    country_cache: dict[int, Country],
    subgenre_cache: dict[int, Subgenre],
) -> dict:
    is_support = bool(tour.tur_is_support)
    # Folder owner is always the act on the card (opener band for support rows)
    act_name = band.bnd_name or "Artist"
    main_name = (
        tour.tur_main_artist_name if is_support else act_name
    )
    country_id = _band_country_id(band)
    country = country_cache.get(country_id) if country_id else None
    subgenre_names = _band_subgenre_names(band, subgenre_cache)
    year = _year_from_iso(s.tsh_date_iso)
    tour_logo = _resolve_tour_logo(tour, media_root)
    era_icon_url, era_logo_url = _era_branding_for_year(band, year, media_root)
    thumbnail_url = _promo_prefixed_url(s.tsh_folder_path, "Thumbnail", media_root)
    playlist_url = _promo_prefixed_url(s.tsh_folder_path, "Playlist", media_root)
    # Opener promo fallbacks to main show when local Promo is thin
    if is_support and media_root and tour.tur_main_artist_name:
        if not thumbnail_url or not playlist_url:
            # Best-effort: reuse poster/banner already synced from main
            pass
    return {
        "id": s.tsh_id,
        "slug": show_slug(s.tsh_date_iso, s.tsh_city, s.tsh_venue),
        "date_iso": s.tsh_date_iso,
        "year": year,
        "country": s.tsh_country,
        "city": s.tsh_city,
        "venue": s.tsh_venue,
        "poster_url": s.tsh_poster_url or tour.tur_poster_url,
        "banner_url": s.tsh_banner_url or s.tsh_poster_url or tour.tur_banner_url,
        "thumbnail_url": thumbnail_url or s.tsh_banner_url or tour.tur_banner_url,
        "playlist_url": playlist_url or s.tsh_poster_url or tour.tur_poster_url,
        "tour_logo_url": tour_logo,
        "era_icon_url": era_icon_url,
        "era_logo_url": era_logo_url,
        "band_id": band.bnd_id,
        "band_name": band.bnd_name,
        "tour_id": tour.tur_id,
        "tour_title": tour.tur_title,
        "tour_slug": tour_slug(tour.tur_date_iso, tour.tur_title),
        "is_support": is_support,
        "main_artist_name": main_name,
        "hover_artist_name": act_name,
        "promoter": s.tsh_promoter,
        "ticketer": s.tsh_ticketer,
        "promoter_logo_url": company_logo_url(s.tsh_promoter),
        "ticketer_logo_url": company_logo_url(s.tsh_ticketer),
        "origin": country.cou_name if country else None,
        "origin_iso": (country.cou_iso or "").lower() if country else None,
        "show_country": s.tsh_country,
        "subgenre_names": subgenre_names,
        # Back-compat alias used by older clients
        "genre_names": subgenre_names,
    }


def list_event_cards(
    db: Session,
    *,
    act: str = "all",
    artist: str | None = None,
    origin: str | None = None,
    country: str | None = None,
    venue: str | None = None,
    genre: str | None = None,
    year: int | None = None,
    decade: int | None = None,
    promoter: str | None = None,
    ticketer: str | None = None,
    sync_band_id: int | None = None,
    refresh: bool = False,
) -> dict:
    """Return filtered show cards + facet options for the home EVENTS tab.

    act: all | main | openers
    origin: artist country of origin
    country: show / venue country
    genre: subgenre name (not parent genre)
    year: calendar year of the show
    """
    if sync_band_id is not None:
        band = db.get(Band, sync_band_id)
        if band:
            sync_band_tours(db, band)
    elif refresh:
        sync_all_band_tours(db)

    media_root = Path(settings.media_root) if settings.media_root else None
    shows = db.scalars(
        select(TourShow).order_by(TourShow.tsh_date_iso.asc(), TourShow.tsh_id.asc())
    ).all()

    countries = {c.cou_id: c for c in db.scalars(select(Country)).all()}
    subgenres = {s.sgn_id: s for s in db.scalars(select(Subgenre)).all()}
    genres = {g.gen_id: g for g in db.scalars(select(Genre)).all()}

    all_cards: list[dict] = []
    for s in shows:
        tour = db.get(Tour, s.tsh_tour_id)
        band = db.get(Band, s.tsh_band_id)
        if not tour or not band:
            continue
        if not _folder_exists(s.tsh_folder_path, media_root):
            continue
        if not _folder_exists(tour.tur_folder_path, media_root):
            continue
        is_support = bool(tour.tur_is_support)
        if act == "main" and is_support:
            continue
        if act == "openers" and not is_support:
            continue
        all_cards.append(
            _enrich_show(
                db,
                s,
                tour,
                band,
                media_root=media_root,
                country_cache=countries,
                subgenre_cache=subgenres,
            )
        )

    def _match_contains(hay: str | None, needle: str | None) -> bool:
        if not needle or not needle.strip():
            return True
        return needle.strip().casefold() in (hay or "").casefold()

    def _match_eq(hay: str | None, needle: str | None) -> bool:
        if not needle or not needle.strip():
            return True
        return (hay or "").casefold() == needle.strip().casefold()

    # decade param kept as soft alias when year is omitted
    filtered: list[dict] = []
    for card in all_cards:
        if artist and not (
            _match_contains(card.get("band_name"), artist)
            or _match_contains(card.get("hover_artist_name"), artist)
            or _match_contains(card.get("main_artist_name"), artist)
        ):
            continue
        if origin and not (
            _match_eq(card.get("origin"), origin)
            or _match_eq(card.get("origin_iso"), origin)
        ):
            continue
        if country and not _match_eq(card.get("show_country"), country):
            continue
        if venue and not _match_contains(card.get("venue"), venue):
            continue
        if genre:
            gwant = genre.strip().casefold()
            names = [n.casefold() for n in (card.get("subgenre_names") or []) if n]
            if gwant not in names and not any(gwant in n for n in names):
                continue
        cy = card.get("year")
        if year is not None and cy != year:
            continue
        if decade is not None and year is None:
            if cy is None or (cy // 10) * 10 != decade:
                continue
        if promoter and not _match_contains(card.get("promoter"), promoter):
            continue
        if ticketer and not _match_contains(card.get("ticketer"), ticketer):
            continue
        filtered.append(card)

    artists = sorted(
        {c["band_name"] for c in all_cards if c.get("band_name")},
        key=str.casefold,
    )
    origins = sorted(
        {c["origin"] for c in all_cards if c.get("origin")},
        key=str.casefold,
    )
    country_opts = sorted(
        {c["show_country"] for c in all_cards if c.get("show_country")},
        key=str.casefold,
    )
    venues = sorted(
        {c["venue"] for c in all_cards if c.get("venue")},
        key=str.casefold,
    )
    years = sorted({c["year"] for c in all_cards if c.get("year") is not None})
    promoters = sorted(
        {c["promoter"] for c in all_cards if c.get("promoter")},
        key=str.casefold,
    )
    ticketers = sorted(
        {c["ticketer"] for c in all_cards if c.get("ticketer")},
        key=str.casefold,
    )

    # Subgenres grouped by parent genre (only those used by event artists)
    used_names: set[str] = set()
    for c in all_cards:
        for n in c.get("subgenre_names") or []:
            if n:
                used_names.add(n.casefold())
    by_parent: dict[str, list[str]] = {}
    for sg in subgenres.values():
        name = (sg.sgn_name or "").strip()
        if not name or name.casefold() not in used_names:
            continue
        parent = genres.get(sg.sgn_genre_id or 0)
        parent_name = (parent.gen_name if parent else None) or "Other"
        by_parent.setdefault(parent_name, [])
        if name not in by_parent[parent_name]:
            by_parent[parent_name].append(name)
    for items in by_parent.values():
        items.sort(key=str.casefold)
    genre_groups = [
        {"genre": parent, "items": items}
        for parent, items in sorted(by_parent.items(), key=lambda x: x[0].casefold())
    ]
    flat_genres = sorted(
        {n for items in by_parent.values() for n in items},
        key=str.casefold,
    )

    return {
        "events": filtered,
        "act": act,
        "facets": {
            "artists": artists,
            "origins": origins,
            "countries": country_opts,
            "venues": venues,
            "genres": flat_genres,
            "genre_groups": genre_groups,
            "years": years,
            # Deprecated — kept empty so old clients don't show decade chips
            "decades": [],
            "promoters": promoters,
            "ticketers": ticketers,
        },
        "total": len(filtered),
        "total_unfiltered": len(all_cards),
    }
