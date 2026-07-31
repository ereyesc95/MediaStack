"""DB-backed movie universes (soft grouping; not reflected on disk)."""
from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.franchise_index import normalize_franchise_slug
from app.models import MovieUniverse, MovieUniverseMember, MovieWork


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(name: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", (name or "").casefold()).strip("-")
    return text or "universe"


def list_universes(db: Session) -> list[dict]:
    rows = db.scalars(select(MovieUniverse).order_by(MovieUniverse.mvu_name)).all()
    out: list[dict] = []
    for u in rows:
        members = db.scalars(
            select(MovieUniverseMember).where(
                MovieUniverseMember.mum_universe_id == u.mvu_id
            )
        ).all()
        out.append(
            {
                "id": u.mvu_id,
                "name": u.mvu_name,
                "slug": u.mvu_slug,
                "tmdb_collection_id": u.mvu_tmdb_collection_id,
                "overview": u.mvu_overview,
                "poster_url": u.mvu_poster_url,
                "backdrop_url": u.mvu_backdrop_url,
                "source": u.mvu_source,
                "work_slugs": [m.mum_work_slug for m in members],
                "member_count": len(members),
            }
        )
    return out


def universe_for_work(db: Session, work_slug: str) -> dict | None:
    slug = normalize_franchise_slug(work_slug) or (work_slug or "").casefold()
    member = db.scalar(
        select(MovieUniverseMember).where(MovieUniverseMember.mum_work_slug == slug)
    )
    if not member:
        work = db.scalar(select(MovieWork).where(MovieWork.mwk_slug == slug))
        if work and work.mwk_universe_id:
            u = db.get(MovieUniverse, work.mwk_universe_id)
            if u:
                return {
                    "id": u.mvu_id,
                    "name": u.mvu_name,
                    "slug": u.mvu_slug,
                    "overview": u.mvu_overview,
                    "poster_url": u.mvu_poster_url,
                }
        return None
    u = db.get(MovieUniverse, member.mum_universe_id)
    if not u:
        return None
    siblings = db.scalars(
        select(MovieUniverseMember).where(
            MovieUniverseMember.mum_universe_id == u.mvu_id
        )
    ).all()
    return {
        "id": u.mvu_id,
        "name": u.mvu_name,
        "slug": u.mvu_slug,
        "overview": u.mvu_overview,
        "poster_url": u.mvu_poster_url,
        "backdrop_url": u.mvu_backdrop_url,
        "work_slugs": [m.mum_work_slug for m in siblings],
    }


def ensure_universe(
    db: Session,
    *,
    name: str,
    tmdb_collection_id: int | None = None,
    overview: str | None = None,
    poster_url: str | None = None,
    backdrop_url: str | None = None,
    source: str = "manual",
) -> MovieUniverse:
    slug = _slugify(name)
    existing = db.scalar(select(MovieUniverse).where(MovieUniverse.mvu_slug == slug))
    if existing:
        if overview and not existing.mvu_overview:
            existing.mvu_overview = overview
        if poster_url and not existing.mvu_poster_url:
            existing.mvu_poster_url = poster_url
        if backdrop_url and not existing.mvu_backdrop_url:
            existing.mvu_backdrop_url = backdrop_url
        if tmdb_collection_id and not existing.mvu_tmdb_collection_id:
            existing.mvu_tmdb_collection_id = tmdb_collection_id
        existing.mvu_updated_at = _now()
        db.commit()
        db.refresh(existing)
        return existing
    row = MovieUniverse(
        mvu_name=name,
        mvu_slug=slug,
        mvu_tmdb_collection_id=tmdb_collection_id,
        mvu_overview=overview,
        mvu_poster_url=poster_url,
        mvu_backdrop_url=backdrop_url,
        mvu_source=source,
        mvu_created_at=_now(),
        mvu_updated_at=_now(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def link_work_to_universe(
    db: Session,
    *,
    universe_id: int,
    work_slug: str,
    source: str = "manual",
) -> None:
    slug = normalize_franchise_slug(work_slug) or work_slug.casefold()
    existing = db.scalar(
        select(MovieUniverseMember).where(
            MovieUniverseMember.mum_universe_id == universe_id,
            MovieUniverseMember.mum_work_slug == slug,
        )
    )
    if existing:
        return
    db.add(
        MovieUniverseMember(
            mum_universe_id=universe_id,
            mum_work_slug=slug,
            mum_source=source,
        )
    )
    work = db.scalar(select(MovieWork).where(MovieWork.mwk_slug == slug))
    if work:
        work.mwk_universe_id = universe_id
    db.commit()


def unlink_work_from_universe(db: Session, *, universe_id: int, work_slug: str) -> None:
    slug = normalize_franchise_slug(work_slug) or work_slug.casefold()
    row = db.scalar(
        select(MovieUniverseMember).where(
            MovieUniverseMember.mum_universe_id == universe_id,
            MovieUniverseMember.mum_work_slug == slug,
        )
    )
    if row:
        db.delete(row)
    work = db.scalar(select(MovieWork).where(MovieWork.mwk_slug == slug))
    if work and work.mwk_universe_id == universe_id:
        work.mwk_universe_id = None
    db.commit()


async def seed_universe_from_tmdb_collection(
    db: Session,
    *,
    collection_id: int,
    api_key: str,
    local_work_slug: str | None = None,
) -> dict:
    """Pull a TMDb collection, store as universe, optionally link a local work."""
    from app.services import tmdb

    data = await tmdb.fetch_collection(collection_id, api_key)
    name = (data.get("name") or f"Collection {collection_id}").strip()
    universe = ensure_universe(
        db,
        name=name,
        tmdb_collection_id=collection_id,
        overview=(data.get("overview") or None),
        poster_url=tmdb.image_url(data.get("poster_path"), "w500"),
        backdrop_url=tmdb.image_url(data.get("backdrop_path"), "w1280"),
        source="tmdb",
    )
    if local_work_slug:
        link_work_to_universe(
            db,
            universe_id=universe.mvu_id,
            work_slug=local_work_slug,
            source="tmdb",
        )
    return {
        "id": universe.mvu_id,
        "name": universe.mvu_name,
        "slug": universe.mvu_slug,
        "tmdb_collection_id": universe.mvu_tmdb_collection_id,
        "overview": universe.mvu_overview,
        "poster_url": universe.mvu_poster_url,
        "parts": [
            {
                "tmdb_id": p.get("id"),
                "title": p.get("title") or p.get("original_title"),
                "date_iso": p.get("release_date"),
                "poster_url": tmdb.image_url(p.get("poster_path"), "w342"),
            }
            for p in (data.get("parts") or [])
            if isinstance(p, dict)
        ],
    }
