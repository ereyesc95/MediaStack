"""CRUD, legacy import, and MusicBrainz merge for band/artist links."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.gallery import _media_url
from app.link_catalog import (
    ADMIN_ONLY_CATEGORIES,
    CATEGORY_LABELS,
    LINK_CATALOG,
    LINK_CATEGORIES,
    clean_label,
    default_label,
    is_famous,
    normalize_url,
    resolve_category,
    resolve_logo_key,
    sort_tier,
)
from app.models import Band, EntityLink

ALLOWED_LOGO_EXT = {".png", ".jpg", ".jpeg", ".webp", ".svg"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _next_link_id(db: Session) -> int:
    return (db.scalar(select(func.max(EntityLink.lnk_id))) or 0) + 1


def _parse_legacy_websites(raw: str | None) -> list[dict[str, str]]:
    if not raw:
        return []
    out: list[dict[str, str]] = []
    for chunk in raw.split("];"):
        chunk = chunk.strip().strip("]")
        if not chunk.startswith("["):
            continue
        chunk = chunk[1:]
        if "■" not in chunk:
            continue
        typ, url = chunk.split("■", 1)
        out.append({"type": typ.strip(), "url": url.strip()})
    return out


def _logo_asset_url(logo_key: str | None, logo_path: str | None, media_root: Path | None) -> str:
    if logo_path and media_root and media_root.is_dir():
        full = media_root / logo_path
        if full.is_file():
            return _media_url(full, media_root)
    if logo_key:
        return f"/assets/links/{logo_key}.svg"
    return "/assets/links/link.svg"


def _serialize_link(
    row: EntityLink,
    *,
    media_root: Path | None,
) -> dict:
    logo_key = row.lnk_logo_key
    label = row.lnk_label or "Link"
    famous = is_famous(logo_key, label)
    return {
        "id": row.lnk_id,
        "label": label,
        "url": row.lnk_url,
        "category": row.lnk_category,
        "logo_key": logo_key,
        "logo_url": _logo_asset_url(logo_key, row.lnk_logo_path, media_root),
        "show_label": False,
        "famous": famous,
        "sort_tier": sort_tier(logo_key, label),
        "source": row.lnk_source,
        "manual": bool(row.lnk_manual),
    }


def _sort_rows(rows: list[EntityLink]) -> list[EntityLink]:
    return sorted(
        rows,
        key=lambda r: (
            sort_tier(r.lnk_logo_key, r.lnk_label or ""),
            (r.lnk_label or "").lower(),
        ),
    )


def _entity_query(
    *,
    band_id: int | None = None,
    artist_id: int | None = None,
):
    q = select(EntityLink).where(EntityLink.lnk_hidden == 0)
    if band_id is not None:
        q = q.where(EntityLink.lnk_fk_bands == band_id)
    if artist_id is not None:
        q = q.where(EntityLink.lnk_fk_artists == artist_id)
    return q


def list_entity_links(
    db: Session,
    *,
    band_id: int | None = None,
    artist_id: int | None = None,
    is_admin: bool = False,
) -> dict:
    media_root = Path(settings.media_root) if settings.media_root else None
    root = media_root if media_root and media_root.is_dir() else None

    rows = list(
        db.scalars(
            _entity_query(band_id=band_id, artist_id=artist_id)
        ).all()
    )
    rows = _sort_rows(rows)

    groups: dict[str, list[dict]] = {c: [] for c in LINK_CATEGORIES}
    for row in rows:
        cat = row.lnk_category or "databases"
        if cat not in groups:
            continue
        if cat in ADMIN_ONLY_CATEGORIES and not is_admin:
            continue
        groups[cat].append(_serialize_link(row, media_root=root))

    visible = {
        k: v for k, v in groups.items() if v and (is_admin or k not in ADMIN_ONLY_CATEGORIES)
    }
    entity_type = "artist" if artist_id is not None else "band"
    entity_id = artist_id if artist_id is not None else band_id
    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "groups": visible,
        "categories": [
            {"id": c, "label": CATEGORY_LABELS[c], "count": len(visible.get(c, []))}
            for c in LINK_CATEGORIES
            if visible.get(c) and (is_admin or c not in ADMIN_ONLY_CATEGORIES)
        ],
    }


def ensure_band_links_migrated(db: Session, band: Band) -> None:
    existing = db.scalar(
        select(func.count(EntityLink.lnk_id)).where(EntityLink.lnk_fk_bands == band.bnd_id)
    )
    if existing:
        return
    legacy = _parse_legacy_websites(band.bnd_websites)
    if not legacy:
        return
    seen: set[str] = set()
    next_id = _next_link_id(db)
    for item in legacy:
        url = normalize_url(item["url"])
        if not url or url in seen:
            continue
        seen.add(url)
        typ = item["type"]
        logo_key = resolve_logo_key(typ, url)
        label = default_label(typ, logo_key)
        cat = resolve_category(typ, url, logo_key)
        db.add(
            EntityLink(
                lnk_id=next_id,
                lnk_fk_bands=band.bnd_id,
                lnk_category=cat,
                lnk_label=label,
                lnk_url=url,
                lnk_logo_key=logo_key,
                lnk_source="legacy",
                lnk_manual=0,
                lnk_hidden=0,
                lnk_mb_type=typ,
            )
        )
        next_id += 1
    db.commit()


def _url_exists(
    db: Session,
    url: str,
    *,
    band_id: int | None,
    artist_id: int | None,
    exclude_id: int | None = None,
) -> bool:
    norm = normalize_url(url)
    q = select(EntityLink).where(EntityLink.lnk_hidden == 0)
    if band_id is not None:
        q = q.where(EntityLink.lnk_fk_bands == band_id)
    if artist_id is not None:
        q = q.where(EntityLink.lnk_fk_artists == artist_id)
    for row in db.scalars(q).all():
        if exclude_id and row.lnk_id == exclude_id:
            continue
        if normalize_url(row.lnk_url) == norm:
            return True
    return False


def create_link(
    db: Session,
    *,
    band_id: int | None = None,
    artist_id: int | None = None,
    category: str,
    label: str,
    url: str,
    logo_key: str | None = None,
) -> EntityLink:
    if category not in LINK_CATEGORIES:
        raise ValueError("Invalid category")
    norm = normalize_url(url)
    if not norm:
        raise ValueError("URL required")
    if _url_exists(db, norm, band_id=band_id, artist_id=artist_id):
        raise ValueError("Duplicate URL")
    row = EntityLink(
        lnk_id=_next_link_id(db),
        lnk_fk_bands=band_id,
        lnk_fk_artists=artist_id,
        lnk_category=category,
        lnk_label=(label or "").strip() or default_label("", logo_key),
        lnk_url=norm,
        lnk_logo_key=logo_key,
        lnk_source="manual",
        lnk_manual=1,
        lnk_hidden=0,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def patch_link(
    db: Session,
    link: EntityLink,
    *,
    category: str | None = None,
    label: str | None = None,
    url: str | None = None,
    logo_key: str | None = None,
    clear_logo_path: bool = False,
) -> EntityLink:
    if category is not None:
        if category not in LINK_CATEGORIES:
            raise ValueError("Invalid category")
        link.lnk_category = category
    if label is not None:
        link.lnk_label = label.strip() or link.lnk_label
    if url is not None:
        norm = normalize_url(url)
        if not norm:
            raise ValueError("URL required")
        band_id = link.lnk_fk_bands
        artist_id = link.lnk_fk_artists
        if _url_exists(
            db, norm, band_id=band_id, artist_id=artist_id, exclude_id=link.lnk_id
        ):
            raise ValueError("Duplicate URL")
        link.lnk_url = norm
    if logo_key is not None:
        link.lnk_logo_key = logo_key or None
    if clear_logo_path:
        link.lnk_logo_path = None
    link.lnk_manual = 1
    link.lnk_source = link.lnk_source or "manual"
    db.commit()
    db.refresh(link)
    return link


def hide_link(db: Session, link: EntityLink) -> None:
    link.lnk_hidden = 1
    link.lnk_manual = 1
    db.commit()


def save_link_logo_file(
    link: EntityLink,
    media_root: Path,
    raw: bytes,
    ext: str,
) -> str:
    ext = ext.lower() if ext.lower() in ALLOWED_LOGO_EXT else ".png"
    slug = re.sub(r"[^\w-]+", "-", (link.lnk_label or "link").lower()).strip("-")[:40]
    dest_dir = media_root / "Links"
    dest_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{slug}--{link.lnk_id}"
    dest = dest_dir / f"{stem}{ext}"
    for old in dest_dir.glob(f"{stem}.*"):
        if old.suffix.lower() in ALLOWED_LOGO_EXT:
            old.unlink(missing_ok=True)
    dest.write_bytes(raw)
    rel = dest.relative_to(media_root).as_posix()
    link.lnk_logo_path = rel
    link.lnk_manual = 1
    return rel


def _mb_url_relations(data: dict) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for rel in data.get("relations") or []:
        url = (rel.get("url") or {}).get("resource")
        if not url:
            continue
        rtype = (rel.get("type") or "").strip()
        if not rtype or rtype.lower() == "image":
            continue
        out.append({"type": rtype, "url": url})
    return out


async def refresh_band_links_merge(db: Session, band: Band) -> dict:
    from app.services.musicbrainz import fetch_artist

    if not band.bnd_code:
        return {"ok": False, "error": "No MusicBrainz ID on band"}
    ensure_band_links_migrated(db, band)
    try:
        data = await fetch_artist(band.bnd_code, inc="url-rels")
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    added = 0
    seen = {
        normalize_url(r.lnk_url)
        for r in db.scalars(
            select(EntityLink).where(
                EntityLink.lnk_fk_bands == band.bnd_id,
                EntityLink.lnk_hidden == 0,
            )
        ).all()
    }
    next_id = _next_link_id(db)
    for item in _mb_url_relations(data):
        url = normalize_url(item["url"])
        if not url or url in seen:
            continue
        typ = item["type"]
        logo_key = resolve_logo_key(typ, url)
        label = default_label(typ, logo_key)
        cat = resolve_category(typ, url, logo_key)
        db.add(
            EntityLink(
                lnk_id=next_id,
                lnk_fk_bands=band.bnd_id,
                lnk_category=cat,
                lnk_label=label,
                lnk_url=url,
                lnk_logo_key=logo_key,
                lnk_source="musicbrainz",
                lnk_manual=0,
                lnk_hidden=0,
                lnk_mb_type=typ,
            )
        )
        seen.add(url)
        added += 1
        next_id += 1
    db.commit()
    return {"ok": True, "added": added}


async def refresh_artist_links_merge(db: Session, artist_id: int, mbid: str | None) -> dict:
    from app.models import Artist
    from app.services.musicbrainz import fetch_artist

    artist = db.get(Artist, artist_id)
    if not artist:
        return {"ok": False, "error": "Artist not found"}
    code = mbid or artist.art_code
    if not code:
        return {"ok": False, "error": "No MusicBrainz ID on artist"}
    try:
        data = await fetch_artist(code, inc="url-rels")
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    added = 0
    seen = {
        normalize_url(r.lnk_url)
        for r in db.scalars(
            select(EntityLink).where(
                EntityLink.lnk_fk_artists == artist_id,
                EntityLink.lnk_hidden == 0,
            )
        ).all()
    }
    next_id = _next_link_id(db)
    for item in _mb_url_relations(data):
        url = normalize_url(item["url"])
        if not url or url in seen:
            continue
        typ = item["type"]
        logo_key = resolve_logo_key(typ, url)
        label = default_label(typ, logo_key)
        cat = resolve_category(typ, url, logo_key)
        db.add(
            EntityLink(
                lnk_id=next_id,
                lnk_fk_artists=artist_id,
                lnk_category=cat,
                lnk_label=label,
                lnk_url=url,
                lnk_logo_key=logo_key,
                lnk_source="musicbrainz",
                lnk_manual=0,
                lnk_hidden=0,
                lnk_mb_type=typ,
            )
        )
        seen.add(url)
        added += 1
        next_id += 1
    db.commit()
    return {"ok": True, "added": added}


def links_payload_for_band(
    db: Session,
    band: Band,
    *,
    is_admin: bool = False,
    solo_artist_id: int | None = None,
) -> dict:
    ensure_band_links_migrated(db, band)
    if solo_artist_id:
        return list_entity_links(db, artist_id=solo_artist_id, is_admin=is_admin)
    return list_entity_links(db, band_id=band.bnd_id, is_admin=is_admin)
