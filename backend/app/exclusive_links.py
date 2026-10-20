"""DB-backed Exclusive external links (Photos hub + entity Gallery Exclusive)."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Band, ExclusiveLink

MEDIA_TYPES = ("photos", "music", "movies", "series", "books", "games")
CONTENT_TYPES = ("photo", "video")

_WS_RE = re.compile(r"\s+")


def normalize_entity_key(name: str) -> str:
    return _WS_RE.sub(" ", (name or "").strip()).casefold()


def normalize_url(raw: str) -> str:
    url = (raw or "").strip()
    if not url:
        return ""
    parsed = urlparse(url)
    if not parsed.scheme:
        url = f"https://{url.lstrip('/')}"
    return url


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _media_root() -> Path | None:
    root = Path(settings.media_root or "")
    return root if root.is_dir() else None


def suggest_title(db: Session, *, media_type: str, content_type: str) -> str:
    mt = media_type if media_type in MEDIA_TYPES else "photos"
    ct = content_type if content_type in CONTENT_TYPES else "photo"
    prefix = "Photo" if ct == "photo" else "Video"
    n = (
        db.query(ExclusiveLink)
        .filter(
            ExclusiveLink.exl_media_type == mt,
            ExclusiveLink.exl_content_type == ct,
        )
        .count()
    )
    return f"{prefix} {n + 1:02d}"


def link_to_dict(row: ExclusiveLink) -> dict:
    return {
        "id": row.exl_id,
        "media_type": row.exl_media_type,
        "content_type": row.exl_content_type,
        "title": row.exl_title,
        "url": row.exl_url,
        "entity_key": row.exl_entity_key,
        "entity_name": row.exl_entity_name,
        "entity_id": row.exl_entity_id,
        "franchise_key": row.exl_franchise_key,
        "franchise_name": row.exl_franchise_name,
        "created_at": row.exl_created_at,
        "updated_at": row.exl_updated_at,
    }


def list_links(
    db: Session,
    *,
    media_type: str | None = None,
    entity_key: str | None = None,
    entity_name: str | None = None,
) -> list[dict]:
    q = db.query(ExclusiveLink)
    if media_type:
        q = q.filter(ExclusiveLink.exl_media_type == media_type)
    key = normalize_entity_key(entity_key or entity_name or "")
    if key:
        q = q.filter(ExclusiveLink.exl_entity_key == key)
    rows = q.order_by(
        ExclusiveLink.exl_content_type.asc(),
        ExclusiveLink.exl_title.asc(),
        ExclusiveLink.exl_id.asc(),
    ).all()
    return [link_to_dict(r) for r in rows]


def create_link(db: Session, body: dict) -> dict:
    media_type = (body.get("media_type") or "photos").strip().lower()
    content_type = (body.get("content_type") or "photo").strip().lower()
    if media_type not in MEDIA_TYPES:
        raise ValueError("Invalid media_type")
    if content_type not in CONTENT_TYPES:
        raise ValueError("Invalid content_type")
    entity_name = (body.get("entity_name") or "").strip()
    if not entity_name:
        raise ValueError("entity_name is required")
    url = normalize_url(body.get("url") or "")
    if not url:
        raise ValueError("url is required")
    title = (body.get("title") or "").strip() or suggest_title(
        db, media_type=media_type, content_type=content_type
    )
    entity_key = normalize_entity_key(entity_name)
    franchise_name = (body.get("franchise_name") or "").strip() or None
    franchise_key = (
        normalize_entity_key(franchise_name) if franchise_name else None
    )
    entity_id = body.get("entity_id")
    if entity_id is not None:
        entity_id = str(entity_id).strip() or None
    # Soft-bind music band id by name when missing
    if media_type == "music" and not entity_id:
        band = (
            db.query(Band)
            .filter(Band.bnd_name.isnot(None))
            .all()
        )
        for b in band:
            if normalize_entity_key(b.bnd_name or "") == entity_key:
                entity_id = str(b.bnd_id)
                break

    now = _now()
    row = ExclusiveLink(
        exl_media_type=media_type,
        exl_content_type=content_type,
        exl_title=title,
        exl_url=url,
        exl_entity_key=entity_key,
        exl_entity_name=entity_name,
        exl_entity_id=entity_id,
        exl_franchise_key=franchise_key,
        exl_franchise_name=franchise_name,
        exl_created_at=now,
        exl_updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return link_to_dict(row)


def update_link(db: Session, link_id: int, body: dict) -> dict:
    row = db.get(ExclusiveLink, link_id)
    if not row:
        raise LookupError("Link not found")
    if "media_type" in body:
        mt = (body.get("media_type") or "").strip().lower()
        if mt not in MEDIA_TYPES:
            raise ValueError("Invalid media_type")
        row.exl_media_type = mt
    if "content_type" in body:
        ct = (body.get("content_type") or "").strip().lower()
        if ct not in CONTENT_TYPES:
            raise ValueError("Invalid content_type")
        row.exl_content_type = ct
    if "title" in body:
        title = (body.get("title") or "").strip()
        if title:
            row.exl_title = title
    if "url" in body:
        url = normalize_url(body.get("url") or "")
        if not url:
            raise ValueError("url is required")
        row.exl_url = url
    if "entity_name" in body:
        entity_name = (body.get("entity_name") or "").strip()
        if not entity_name:
            raise ValueError("entity_name is required")
        row.exl_entity_name = entity_name
        row.exl_entity_key = normalize_entity_key(entity_name)
    if "entity_id" in body:
        eid = body.get("entity_id")
        row.exl_entity_id = str(eid).strip() if eid else None
    if "franchise_name" in body:
        fn = (body.get("franchise_name") or "").strip() or None
        row.exl_franchise_name = fn
        row.exl_franchise_key = normalize_entity_key(fn) if fn else None
    row.exl_updated_at = _now()
    db.commit()
    db.refresh(row)
    return link_to_dict(row)


def delete_link(db: Session, link_id: int) -> None:
    row = db.get(ExclusiveLink, link_id)
    if not row:
        raise LookupError("Link not found")
    db.delete(row)
    db.commit()


def _photos_people() -> list[dict]:
    root = _media_root()
    if not root:
        return []
    exclusive = root / "Photos" / "Exclusive"
    if not exclusive.is_dir():
        return []
    out: list[dict] = []
    try:
        for p in sorted(exclusive.iterdir(), key=lambda x: x.name.casefold()):
            if p.is_dir() and not p.name.startswith("."):
                out.append({"name": p.name, "id": None, "key": normalize_entity_key(p.name)})
    except OSError:
        pass
    return out


def _music_artists(db: Session) -> list[dict]:
    rows = (
        db.query(Band)
        .filter(Band.bnd_name.isnot(None))
        .order_by(Band.bnd_name.asc())
        .all()
    )
    return [
        {
            "name": b.bnd_name,
            "id": str(b.bnd_id),
            "key": normalize_entity_key(b.bnd_name or ""),
        }
        for b in rows
        if (b.bnd_name or "").strip()
    ]


def _catalog_leaves(module_dir: str) -> list[dict]:
    """Letter-tier leaves under Movies/Series/Books; Games platforms."""
    root = _media_root()
    if not root:
        return []
    base = root / module_dir
    if not base.is_dir():
        return []
    found: dict[str, dict] = {}

    def add(name: str, franchise: str | None = None) -> None:
        key = normalize_entity_key(name)
        if not key or key in found:
            return
        found[key] = {
            "name": name,
            "id": None,
            "key": key,
            "franchise": franchise,
        }

    skip = {
        "[artwork]",
        "artwork",
        "gallery",
        "audio",
        "extras",
        "episodes",
        "specials",
        "rom",
        "disc",
    }

    try:
        if module_dir == "Games":
            for platform in base.iterdir():
                if not platform.is_dir():
                    continue
                for letter in platform.iterdir():
                    if not letter.is_dir():
                        continue
                    for franchise in letter.iterdir():
                        if not franchise.is_dir():
                            continue
                        has_leaf = False
                        for child in franchise.iterdir():
                            if not child.is_dir():
                                continue
                            if child.name.casefold() in skip:
                                continue
                            add(_strip_date(child.name), franchise.name)
                            has_leaf = True
                        if not has_leaf:
                            add(franchise.name, None)
        else:
            for letter in base.iterdir():
                if not letter.is_dir():
                    continue
                for franchise in letter.iterdir():
                    if not franchise.is_dir():
                        continue
                    has_leaf = False
                    for child in franchise.iterdir():
                        if not child.is_dir():
                            continue
                        if child.name.casefold() in skip:
                            continue
                        add(_strip_date(child.name), franchise.name)
                        has_leaf = True
                    if not has_leaf:
                        add(franchise.name, None)
    except OSError:
        pass
    return sorted(found.values(), key=lambda x: x["name"].casefold())


_DATE_RE = re.compile(r"^(\d{4}(?:\.\d{2}(?:\.\d{2})?)?)\.\s+(.+)$")


def _strip_date(name: str) -> str:
    m = _DATE_RE.match(name.strip())
    return (m.group(2) if m else name).strip() or name


def list_entities(db: Session, media_type: str) -> list[dict]:
    mt = media_type if media_type in MEDIA_TYPES else "photos"
    if mt == "photos":
        items = _photos_people()
    elif mt == "music":
        items = _music_artists(db)
    elif mt == "movies":
        items = _catalog_leaves("Movies")
    elif mt == "series":
        items = _catalog_leaves("Series")
    elif mt == "books":
        items = _catalog_leaves("Books")
    else:
        items = _catalog_leaves("Games")

    # Include free-typed entities that only exist as links
    existing_keys = {i["key"] for i in items}
    for row in (
        db.query(ExclusiveLink)
        .filter(ExclusiveLink.exl_media_type == mt)
        .all()
    ):
        if row.exl_entity_key not in existing_keys:
            items.append(
                {
                    "name": row.exl_entity_name,
                    "id": row.exl_entity_id,
                    "key": row.exl_entity_key,
                    "franchise": row.exl_franchise_name,
                }
            )
            existing_keys.add(row.exl_entity_key)
    items.sort(key=lambda x: (x.get("name") or "").casefold())
    return items


def gallery_link_items(
    db: Session,
    *,
    media_type: str,
    entity_name: str | None = None,
    entity_key: str | None = None,
    entity_id: str | None = None,
) -> list[dict]:
    """Shape Exclusive links like gallery Exclusive tiles for entity pages."""
    key = normalize_entity_key(entity_key or entity_name or "")
    q = db.query(ExclusiveLink).filter(ExclusiveLink.exl_media_type == media_type)
    if key:
        q = q.filter(ExclusiveLink.exl_entity_key == key)
    elif entity_id:
        q = q.filter(ExclusiveLink.exl_entity_id == str(entity_id))
    else:
        return []
    out: list[dict] = []
    for row in q.order_by(ExclusiveLink.exl_title.asc()).all():
        out.append(
            {
                "id": f"exlink_{row.exl_id}",
                "link_id": row.exl_id,
                "url": row.exl_url,
                "thumb_url": None,
                "title": row.exl_title,
                "kind": "link",
                "content_type": row.exl_content_type,
                "is_external_link": True,
            }
        )
    return out


def entity_name_from_folder_path(rel_path: str) -> str:
    leaf = Path((rel_path or "").replace("\\", "/")).name
    return _strip_date(leaf)


def merge_exclusive_links_into_sections_gallery(
    payload: dict,
    db: Session,
    *,
    media_type: str,
    entity_name: str | None = None,
    entity_id: str | None = None,
) -> None:
    """Mutate Series/Movies/Books/Games gallery {sections, items} payloads."""
    name = entity_name or entity_name_from_folder_path(
        str(payload.get("folder_path") or "")
    )
    items = gallery_link_items(
        db,
        media_type=media_type,
        entity_name=name,
        entity_id=entity_id,
    )
    if not items:
        return
    shaped = [
        {
            "id": it["id"],
            "url": it["url"],
            "title": it["title"],
            "folder_path": None,
            "section": "exclusive",
            "subsection": "links",
            "media_kind": "link",
            "is_external_link": True,
            "link_id": it["link_id"],
            "content_type": it.get("content_type"),
        }
        for it in items
    ]
    sections = list(payload.get("sections") or [])
    ex = next((s for s in sections if s.get("key") == "exclusive"), None)
    if not ex:
        sections.append(
            {
                "key": "exclusive",
                "label": "Exclusive",
                "items": shaped,
            }
        )
    else:
        subs = list(ex.get("subsections") or [])
        if subs:
            existing = next((s for s in subs if s.get("key") == "links"), None)
            if existing:
                existing["items"] = list(existing.get("items") or []) + shaped
            else:
                subs.append({"key": "links", "label": "Links", "items": shaped})
            ex["subsections"] = subs
            ex["items"] = []
        else:
            ex["items"] = list(ex.get("items") or []) + shaped
    all_items: list[dict] = []
    for sec in sections:
        all_items.extend(sec.get("items") or [])
        for sub in sec.get("subsections") or []:
            all_items.extend(sub.get("items") or [])
    payload["sections"] = sections
    payload["items"] = all_items


def merge_exclusive_links_into_gallery(
    payload: dict,
    db: Session,
    *,
    media_type: str,
    entity_name: str | None,
    entity_id: str | None = None,
) -> None:
    """Mutate a gallery index payload to include Exclusive DB links."""
    items = gallery_link_items(
        db,
        media_type=media_type,
        entity_name=entity_name,
        entity_id=entity_id,
    )
    if not items:
        return
    shaped = [
        {
            "id": it["id"],
            "url": it["url"],
            "title": it["title"],
            "folder_path": None,
            "section": "exclusive",
            "subsection": "links",
            "media_kind": "link",
            "is_external_link": True,
            "link_id": it["link_id"],
            "content_type": it.get("content_type"),
        }
        for it in items
    ]
    payload["has_exclusive_gallery"] = True
    ex = payload.get("exclusive")
    if not ex:
        payload["exclusive"] = {
            "key": "exclusive",
            "label": "Exclusive",
            "items": shaped,
        }
        return
    subs = list(ex.get("subsections") or [])
    root_items = list(ex.get("items") or [])
    if subs:
        # Prefer a dedicated Links subsection when folders already exist
        existing = next((s for s in subs if s.get("key") == "links"), None)
        if existing:
            existing["items"] = list(existing.get("items") or []) + shaped
        else:
            subs.append({"key": "links", "label": "Links", "items": shaped})
        ex["subsections"] = subs
        ex["items"] = []
    else:
        ex["items"] = root_items + shaped
    payload["exclusive"] = ex


def try_bind_new_band(db: Session, band: Band) -> int:
    """When a band is created/imported, attach orphan music links by name."""
    key = normalize_entity_key(band.bnd_name or "")
    if not key:
        return 0
    rows = (
        db.query(ExclusiveLink)
        .filter(
            ExclusiveLink.exl_media_type == "music",
            ExclusiveLink.exl_entity_key == key,
            ExclusiveLink.exl_entity_id.is_(None),
        )
        .all()
    )
    for row in rows:
        row.exl_entity_id = str(band.bnd_id)
        row.exl_updated_at = _now()
    if rows:
        db.commit()
    return len(rows)
