"""Global EVENTS index — all attended shows across artists."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.company_assets import company_logo_url
from app.models import Band, Continent, Country, Genre, Tour, TourShow
from app.music_filters import _parse_ids
from app.tours_index import show_slug, sync_band_tours, tour_slug


def _band_country_id(band: Band) -> int | None:
    raw = (band.bnd_fk_countries or "").strip()
    if not raw:
        return None
    ids = _parse_ids(raw.split("[")[0] if "[" in raw else raw)
    return ids[0] if ids else None


def _band_genre_ids(band: Band) -> list[int]:
    return _parse_ids(band.bnd_fk_genres)


def _decade_from_iso(date_iso: str | None) -> int | None:
    if not date_iso or len(date_iso) < 4 or not date_iso[:4].isdigit():
        return None
    year = int(date_iso[:4])
    return (year // 10) * 10


def _enrich_show(
    db: Session,
    s: TourShow,
    tour: Tour,
    band: Band,
    *,
    country_cache: dict[int, Country],
    continent_cache: dict[int, Continent],
    genre_cache: dict[int, Genre],
) -> dict:
    is_support = bool(tour.tur_is_support)
    main_name = (
        tour.tur_main_artist_name if is_support else (band.bnd_name or "Artist")
    )
    country_id = _band_country_id(band)
    country = country_cache.get(country_id) if country_id else None
    continent_id = country.cou_continent_id if country else None
    continent = continent_cache.get(continent_id) if continent_id else None
    genre_ids = _band_genre_ids(band)
    genre_names = [
        genre_cache[g].gen_name
        for g in genre_ids
        if g in genre_cache and genre_cache[g].gen_name
    ]
    decade = _decade_from_iso(s.tsh_date_iso)
    return {
        "id": s.tsh_id,
        "slug": show_slug(s.tsh_date_iso, s.tsh_city, s.tsh_venue),
        "date_iso": s.tsh_date_iso,
        "country": s.tsh_country,
        "city": s.tsh_city,
        "venue": s.tsh_venue,
        "poster_url": s.tsh_poster_url or tour.tur_poster_url,
        "banner_url": s.tsh_banner_url or s.tsh_poster_url or tour.tur_banner_url,
        "band_id": band.bnd_id,
        "band_name": band.bnd_name,
        "tour_id": tour.tur_id,
        "tour_title": tour.tur_title,
        "tour_slug": tour_slug(tour.tur_date_iso, tour.tur_title),
        "is_support": is_support,
        "main_artist_name": main_name,
        "promoter": s.tsh_promoter,
        "ticketer": s.tsh_ticketer,
        "promoter_logo_url": company_logo_url(s.tsh_promoter),
        "ticketer_logo_url": company_logo_url(s.tsh_ticketer),
        "artist_country_id": country_id,
        "artist_country_name": country.cou_name if country else None,
        "artist_country_iso": (country.cou_iso or "").lower() if country else None,
        "continent_id": continent_id,
        "continent_name": continent.con_name if continent else None,
        "genre_ids": genre_ids,
        "genre_names": genre_names,
        "decade": decade,
        # Show-folder country (venue country) for geographic filters preferred
        "show_country": s.tsh_country,
    }


def list_event_cards(
    db: Session,
    *,
    act: str = "all",
    artist: str | None = None,
    genre: str | None = None,
    decade: int | None = None,
    country: str | None = None,
    continent: str | None = None,
    promoter: str | None = None,
    ticketer: str | None = None,
    sync_band_id: int | None = None,
) -> dict:
    """Return filtered show cards + facet options for the home EVENTS tab.

    act: all | main | openers
    """
    if sync_band_id is not None:
        band = db.get(Band, sync_band_id)
        if band:
            sync_band_tours(db, band)

    shows = db.scalars(
        select(TourShow).order_by(TourShow.tsh_date_iso.asc(), TourShow.tsh_id.asc())
    ).all()

    countries = {c.cou_id: c for c in db.scalars(select(Country)).all()}
    continents = {c.con_id: c for c in db.scalars(select(Continent)).all()}
    genres = {g.gen_id: g for g in db.scalars(select(Genre)).all()}

    all_cards: list[dict] = []
    for s in shows:
        tour = db.get(Tour, s.tsh_tour_id)
        band = db.get(Band, s.tsh_band_id)
        if not tour or not band:
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
                country_cache=countries,
                continent_cache=continents,
                genre_cache=genres,
            )
        )

    def _match_text(hay: str | None, needle: str | None) -> bool:
        if not needle or not needle.strip():
            return True
        return (hay or "").casefold() == needle.strip().casefold()

    def _match_contains(hay: str | None, needle: str | None) -> bool:
        if not needle or not needle.strip():
            return True
        return needle.strip().casefold() in (hay or "").casefold()

    filtered: list[dict] = []
    for card in all_cards:
        if artist and not (
            _match_contains(card.get("band_name"), artist)
            or _match_contains(card.get("main_artist_name"), artist)
        ):
            continue
        if genre:
            gwant = genre.strip().casefold()
            names = [n.casefold() for n in (card.get("genre_names") or []) if n]
            if gwant not in names and not any(gwant in n for n in names):
                continue
        if decade is not None and card.get("decade") != decade:
            continue
        if country:
            cwant = country.strip().casefold()
            show_c = (card.get("show_country") or "").casefold()
            art_c = (card.get("artist_country_name") or "").casefold()
            art_iso = (card.get("artist_country_iso") or "").casefold()
            if cwant not in (show_c, art_c, art_iso) and cwant not in show_c and cwant not in art_c:
                continue
        if continent:
            cwant = continent.strip().casefold()
            if (card.get("continent_name") or "").casefold() != cwant and str(
                card.get("continent_id") or ""
            ) != continent.strip():
                continue
        if promoter and not _match_contains(card.get("promoter"), promoter):
            continue
        if ticketer and not _match_contains(card.get("ticketer"), ticketer):
            continue
        filtered.append(card)

    # Facets from act-scoped pool (before secondary filters) so options stay useful
    artists = sorted(
        {c["band_name"] for c in all_cards if c.get("band_name")},
        key=str.casefold,
    )
    genre_opts = sorted(
        {n for c in all_cards for n in (c.get("genre_names") or []) if n},
        key=str.casefold,
    )
    decades = sorted({c["decade"] for c in all_cards if c.get("decade") is not None})
    country_opts = sorted(
        {
            c.get("show_country") or c.get("artist_country_name")
            for c in all_cards
            if c.get("show_country") or c.get("artist_country_name")
        },
        key=lambda x: (x or "").casefold(),
    )
    continent_opts = sorted(
        {c["continent_name"] for c in all_cards if c.get("continent_name")},
        key=str.casefold,
    )
    promoters = sorted(
        {c["promoter"] for c in all_cards if c.get("promoter")},
        key=str.casefold,
    )
    ticketers = sorted(
        {c["ticketer"] for c in all_cards if c.get("ticketer")},
        key=str.casefold,
    )

    return {
        "events": filtered,
        "act": act,
        "facets": {
            "artists": artists,
            "genres": genre_opts,
            "decades": decades,
            "countries": country_opts,
            "continents": continent_opts,
            "promoters": promoters,
            "ticketers": ticketers,
        },
        "total": len(filtered),
        "total_unfiltered": len(all_cards),
    }
