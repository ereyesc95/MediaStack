"""Shared universes across Movies and Series franchises."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from urllib.request import urlopen

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.franchise_index import normalize_franchise_slug
from app.gallery import IMAGE_EXTS, _media_url
from app.models import Universe, UniverseMember

ModuleKind = Literal["movies", "series"]
ART_KINDS = ("Portrait", "Landscape", "Banner", "Logo")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(name: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", (name or "").casefold()).strip("-")
    return text or "universe"


def _norm_slug(slug: str) -> str:
    return normalize_franchise_slug(slug) or (slug or "").casefold().strip()


def _media_root() -> Path | None:
    root = Path(settings.media_root) if settings.media_root else None
    return root if root and root.is_dir() else None


def universes_dir(media_root: Path | None = None) -> Path | None:
    root = media_root or _media_root()
    if not root:
        return None
    return root / "Universes"


def _art_file(universe_name: str, kind: str, media_root: Path) -> Path | None:
    folder = universes_dir(media_root)
    if not folder or not folder.is_dir():
        return None
    stem = f"{universe_name} - {kind}".casefold()
    try:
        for p in folder.iterdir():
            if (
                p.is_file()
                and p.suffix.lower() in IMAGE_EXTS
                and p.stem.casefold() == stem
            ):
                return p
    except OSError:
        return None
    return None


def resolve_universe_art(universe: Universe, media_root: Path | None = None) -> dict:
    root = media_root or _media_root()
    out = {
        "portrait_url": None,
        "landscape_url": None,
        "banner_url": None,
        "logo_url": None,
        "cover_url": None,
    }
    if not root:
        return out
    name = universe.uni_name
    for kind, key in (
        ("Portrait", "portrait_url"),
        ("Landscape", "landscape_url"),
        ("Banner", "banner_url"),
        ("Logo", "logo_url"),
    ):
        f = _art_file(name, kind, root)
        if f:
            out[key] = _media_url(f, root)
    out["cover_url"] = (
        out["portrait_url"] or out["landscape_url"] or out["banner_url"] or out["logo_url"]
    )
    return out


def _member_rows(db: Session, universe_id: int) -> list[UniverseMember]:
    return list(
        db.scalars(
            select(UniverseMember).where(UniverseMember.ume_universe_id == universe_id)
        ).all()
    )


def _serialize_universe(
    db: Session,
    u: Universe,
    *,
    include_members: bool = True,
    cover_fallback: str | None = None,
) -> dict:
    art = resolve_universe_art(u)
    members = _member_rows(db, u.uni_id) if include_members else []
    cover = art.get("cover_url") or cover_fallback
    if not cover and include_members:
        cards = expand_universe_cards(db, u.uni_id)
        for c in cards:
            cover = (
                c.get("portrait_url")
                or c.get("cover_url")
                or c.get("banner_url")
                or c.get("landscape_url")
            )
            if cover:
                break
    return {
        "id": u.uni_id,
        "name": u.uni_name,
        "slug": u.uni_slug,
        "overview": u.uni_overview,
        "portrait_url": art.get("portrait_url"),
        "landscape_url": art.get("landscape_url"),
        "banner_url": art.get("banner_url"),
        "logo_url": art.get("logo_url"),
        "cover_url": cover,
        "member_count": len(members),
        "members": [
            {"module": m.ume_module, "slug": m.ume_slug, "source": m.ume_source}
            for m in members
        ]
        if include_members
        else None,
    }


def list_universes(db: Session) -> list[dict]:
    rows = db.scalars(select(Universe).order_by(Universe.uni_name)).all()
    return [_serialize_universe(db, u) for u in rows]


def get_universe(db: Session, universe_id: int) -> dict | None:
    u = db.get(Universe, universe_id)
    if not u:
        return None
    return _serialize_universe(db, u)


def universe_for_franchise(
    db: Session, module: ModuleKind, slug: str
) -> dict | None:
    norm = _norm_slug(slug)
    member = db.scalar(
        select(UniverseMember).where(
            UniverseMember.ume_module == module,
            UniverseMember.ume_slug == norm,
        )
    )
    if not member:
        # Also try raw slug if normalize differed
        if slug and slug != norm:
            member = db.scalar(
                select(UniverseMember).where(
                    UniverseMember.ume_module == module,
                    UniverseMember.ume_slug == slug.casefold().strip(),
                )
            )
    if not member:
        return None
    u = db.get(Universe, member.ume_universe_id)
    if not u:
        return None
    data = _serialize_universe(db, u)
    data["parent_module"] = module
    data["parent_slug"] = member.ume_slug
    return data


def create_universe(
    db: Session,
    *,
    name: str,
    overview: str | None = None,
) -> Universe:
    clean = (name or "").strip()
    if not clean:
        raise ValueError("Universe name is required")
    slug = _slugify(clean)
    existing = db.scalar(select(Universe).where(Universe.uni_slug == slug))
    if existing:
        raise ValueError(f"Universe already exists: {existing.uni_name}")
    row = Universe(
        uni_name=clean,
        uni_slug=slug,
        uni_overview=(overview or "").strip() or None,
        uni_created_at=_now(),
        uni_updated_at=_now(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_universe_overview(
    db: Session, universe_id: int, overview: str | None
) -> Universe | None:
    u = db.get(Universe, universe_id)
    if not u:
        return None
    u.uni_overview = (overview or "").strip() or None
    u.uni_updated_at = _now()
    db.commit()
    db.refresh(u)
    return u


def link_franchise(
    db: Session,
    *,
    universe_id: int,
    module: ModuleKind,
    slug: str,
    source: str = "manual",
) -> dict:
    if module not in ("movies", "series"):
        raise ValueError("module must be movies or series")
    u = db.get(Universe, universe_id)
    if not u:
        raise ValueError("Universe not found")
    norm = _norm_slug(slug)
    # One universe per franchise: drop any prior membership
    prior = list(
        db.scalars(
            select(UniverseMember).where(
                UniverseMember.ume_module == module,
                UniverseMember.ume_slug == norm,
            )
        ).all()
    )
    for row in prior:
        db.delete(row)
    db.add(
        UniverseMember(
            ume_universe_id=universe_id,
            ume_module=module,
            ume_slug=norm,
            ume_source=source,
        )
    )
    db.commit()
    return _serialize_universe(db, u)


def unlink_franchise(
    db: Session,
    *,
    module: ModuleKind,
    slug: str,
    universe_id: int | None = None,
) -> None:
    norm = _norm_slug(slug)
    q = select(UniverseMember).where(
        UniverseMember.ume_module == module,
        UniverseMember.ume_slug == norm,
    )
    if universe_id is not None:
        q = q.where(UniverseMember.ume_universe_id == universe_id)
    rows = list(db.scalars(q).all())
    for row in rows:
        db.delete(row)
    db.commit()


def save_universe_art_bytes(
    universe: Universe,
    kind: str,
    data: bytes,
    suffix: str = ".png",
) -> str | None:
    """Write `{Name} - {Kind}.png` under Media/Universes/. Returns media URL."""
    if kind not in ART_KINDS:
        raise ValueError(f"kind must be one of {ART_KINDS}")
    root = _media_root()
    if not root:
        raise ValueError("Media root not configured")
    folder = universes_dir(root)
    assert folder is not None
    folder.mkdir(parents=True, exist_ok=True)
    # Remove prior stems for this kind
    stem = f"{universe.uni_name} - {kind}"
    for p in list(folder.iterdir()) if folder.is_dir() else []:
        if p.is_file() and p.stem.casefold() == stem.casefold():
            try:
                p.unlink()
            except OSError:
                pass
    ext = suffix if suffix.startswith(".") else f".{suffix}"
    if ext.lower() not in IMAGE_EXTS:
        ext = ".png"
    dest = folder / f"{stem}{ext}"
    dest.write_bytes(data)
    return _media_url(dest, root)


def _franchise_earliest_date(module: ModuleKind, slug: str) -> str:
    cards = _leaf_cards_for_member(module, slug)
    dates = [c.get("date_iso") for c in cards if c.get("date_iso")]
    return min(dates) if dates else "9999"


def _leaf_cards_for_member(module: ModuleKind, slug: str) -> list[dict]:
    if module == "movies":
        from app.movies_index import build_work_detail

        detail = build_work_detail(slug)
        if not detail:
            return []
        work_id = detail.get("id") or detail.get("slug") or slug
        films = detail.get("films") or []
        out: list[dict] = []
        for f in films:
            out.append(
                {
                    **f,
                    "module": "movies",
                    "franchise_id": work_id,
                    "leaf_id": f.get("id"),
                    "kind": "film",
                }
            )
        return out

    from app.series_index import build_franchise_detail

    detail = build_franchise_detail(slug)
    if not detail:
        return []
    franchise_id = detail.get("id") or slug
    subseries = detail.get("subseries") or []
    out = []
    if subseries:
        for s in subseries:
            out.append(
                {
                    **s,
                    "module": "series",
                    "franchise_id": franchise_id,
                    "leaf_id": s.get("id"),
                    "kind": "subseries",
                    "title": s.get("title") or s.get("name"),
                }
            )
        return out
    # No subseries: treat franchise itself as one card when it has seasons/episodes
    seasons = detail.get("seasons") or []
    if seasons or detail.get("episode_count"):
        out.append(
            {
                "id": franchise_id,
                "title": detail.get("name") or franchise_id,
                "name": detail.get("name"),
                "date_iso": detail.get("date_iso")
                or detail.get("starting_date")
                or None,
                "display_date": detail.get("display_date"),
                "cover_url": detail.get("cover_url"),
                "portrait_url": detail.get("portrait_url") or detail.get("cover_url"),
                "landscape_url": detail.get("landscape_url"),
                "banner_url": detail.get("banner_url"),
                "logo_url": detail.get("logo_url"),
                "folder_path": detail.get("folder_path"),
                "module": "series",
                "franchise_id": franchise_id,
                "leaf_id": franchise_id,
                "kind": "franchise",
            }
        )
    return out


def expand_universe_cards(db: Session, universe_id: int) -> list[dict]:
    members = _member_rows(db, universe_id)
    cards: list[dict] = []
    for m in members:
        if m.ume_module not in ("movies", "series"):
            continue
        cards.extend(_leaf_cards_for_member(m.ume_module, m.ume_slug))  # type: ignore[arg-type]
    cards.sort(
        key=lambda c: (
            c.get("date_iso") or "9999",
            (c.get("title") or c.get("name") or "").casefold(),
        )
    )
    return cards


def landing_franchise(
    db: Session, universe_id: int, prefer_module: ModuleKind
) -> dict | None:
    """Prefer current module, else other; within module earliest release."""
    members = _member_rows(db, universe_id)
    if not members:
        return None

    def pick(module: ModuleKind) -> UniverseMember | None:
        pool = [m for m in members if m.ume_module == module]
        if not pool:
            return None
        pool.sort(key=lambda m: _franchise_earliest_date(module, m.ume_slug))
        return pool[0]

    chosen = pick(prefer_module) or pick(
        "series" if prefer_module == "movies" else "movies"
    )
    if not chosen:
        return None
    return {
        "module": chosen.ume_module,
        "franchise_id": chosen.ume_slug,
        "universe_id": universe_id,
    }


def universe_member_slugs(db: Session, universe_id: int) -> set[tuple[str, str]]:
    return {
        (m.ume_module, m.ume_slug)
        for m in _member_rows(db, universe_id)
    }


def filter_similar_against_universe(
    db: Session,
    module: ModuleKind,
    franchise_slug: str,
    similar: list[dict],
) -> list[dict]:
    """Drop similar entries that match any franchise in the same universe."""
    uni = universe_for_franchise(db, module, franchise_slug)
    if not uni:
        return similar
    member_slugs = {
        m["slug"].casefold()
        for m in (uni.get("members") or [])
        if m.get("slug")
    }
    member_names = {uni.get("name", "").casefold()} if uni.get("name") else set()

    # Also collect leaf titles for loose matching against TMDb similar titles
    leaf_titles: set[str] = set()
    for c in expand_universe_cards(db, uni["id"]):
        t = (c.get("title") or c.get("name") or "").casefold().strip()
        if t:
            leaf_titles.add(t)
        fid = (c.get("franchise_id") or "").casefold()
        if fid:
            member_slugs.add(fid)

    out = []
    for item in similar:
        title = (item.get("title") or item.get("name") or "").casefold().strip()
        sid = str(item.get("id") or item.get("slug") or "").casefold()
        if title and title in leaf_titles:
            continue
        if sid and sid in member_slugs:
            continue
        if title and title in member_names:
            continue
        # Match by slug-ish id fields
        local_id = (item.get("local_id") or item.get("franchise_id") or "").casefold()
        if local_id and local_id in member_slugs:
            continue
        out.append(item)
    return out


async def pull_tmdb_portrait(db: Session, universe_id: int, api_key: str) -> dict:
    """Search TMDb collection by universe name; save Portrait.png only (no collection id)."""
    from app.services import tmdb

    u = db.get(Universe, universe_id)
    if not u:
        raise ValueError("Universe not found")
    collection_id, _ = await tmdb.search_collection_id(u.uni_name, api_key)
    if not collection_id:
        raise ValueError(f"No TMDb collection found for {u.uni_name!r}")
    data = await tmdb.fetch_collection(collection_id, api_key)
    poster_path = data.get("poster_path")
    url = tmdb.image_url(poster_path, "w500")
    if not url:
        raise ValueError("Collection has no poster")
    with urlopen(url, timeout=30) as resp:
        raw = resp.read()
    art_url = save_universe_art_bytes(u, "Portrait", raw, suffix=".png")
    overview = (data.get("overview") or "").strip()
    if overview and not u.uni_overview:
        u.uni_overview = overview
        u.uni_updated_at = _now()
        db.commit()
        db.refresh(u)
    return _serialize_universe(db, u) | {"portrait_url": art_url}
