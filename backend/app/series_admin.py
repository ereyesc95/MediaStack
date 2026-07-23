"""Admin mutations for Series franchise about + cast + links."""
from __future__ import annotations

import json
import uuid

from sqlalchemy.orm import Session

from app.models import Country, Series
from app.series_refresh import ensure_series_row, find_series_row


def patch_series_about(
    db: Session,
    franchise_name: str,
    *,
    bio: str | None = None,
    writers: str | None = None,
    origin_city: str | None = None,
    country_id: int | None = None,
    activity_start: str | None = None,
    activity_end: str | None = None,
    publishers: str | None = None,
) -> Series:
    row = ensure_series_row(db, franchise_name)
    if bio is not None:
        row.ser_bio = bio.strip()
        row.ser_bio_manual = 1
        row.ser_bio_source = "manual"
    if writers is not None:
        row.ser_writers = writers.strip().replace(",", ";") or None
    if origin_city is not None:
        row.ser_origin_place = origin_city.strip() or None
    if country_id is not None:
        if country_id:
            crow = db.get(Country, country_id)
            if crow and crow.cou_iso:
                row.ser_country_iso = crow.cou_iso.lower()
            else:
                row.ser_country_iso = str(country_id)
        else:
            row.ser_country_iso = None
    if activity_start is not None:
        # Keep first period start as ser_starting_date for display
        first = (activity_start.split(";")[0] or "").strip()
        row.ser_starting_date = first or None
        # Store full multi-period in JSON-ish via genres? Use ser_images unused — store periods in other_names no
        # Persist as starting; ends separately
    if activity_end is not None:
        first_end = (activity_end.split(";")[0] or "").strip()
        row.ser_ending_date = first_end or None
    if publishers is not None:
        row.ser_publishers = publishers.strip().replace(",", ";") or None
        pubs = [p for p in (row.ser_publishers or "").split(";") if p.strip()]
        if pubs:
            row.ser_studio = pubs[0]
    # Persist multi activity as JSON in ser_genres_json? Better add field — use cast_json sibling
    # Store activity periods JSON alongside via ser_links style — put in ser_other_names no
    # Quick: store in ser_genres_json wrapper — DON'T. Use writers field only for writers.
    # Store activity periods as JSON string in a dedicated approach: append to ser_images_json
    images = {}
    try:
        images = json.loads(row.ser_images_json or "{}")
        if not isinstance(images, dict):
            images = {}
    except (json.JSONDecodeError, TypeError):
        images = {}
    if activity_start is not None or activity_end is not None:
        starts = (activity_start or "").split(";")
        ends = (activity_end or "").split(";")
        periods = []
        for i, s in enumerate(starts):
            s = s.strip()
            e = ends[i].strip() if i < len(ends) else ""
            if s or e:
                periods.append({"start": s or None, "end": e or None})
        images["activity_periods"] = periods
        row.ser_images_json = json.dumps(images, ensure_ascii=False)
    db.commit()
    db.refresh(row)
    return row


def _load_cast(row: Series) -> dict:
    try:
        data = json.loads(row.ser_cast_json or "{}")
    except (json.JSONDecodeError, TypeError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    data.setdefault("characters", data.get("animated") or [])
    data.setdefault("staff", data.get("people") or [])
    # Keep legacy keys in sync
    data["animated"] = data["characters"]
    data["people"] = data["staff"]
    return data


def _save_cast(db: Session, row: Series, cast: dict) -> dict:
    cast["animated"] = cast.get("characters") or []
    cast["people"] = cast.get("staff") or []
    row.ser_cast_json = json.dumps(cast, ensure_ascii=False)
    db.commit()
    return cast


def add_series_cast_member(
    db: Session,
    franchise_name: str,
    *,
    bucket: str,
    name: str,
    character: str | None = None,
    photo_url: str | None = None,
    character_photo_url: str | None = None,
    roles: list[str] | None = None,
) -> dict:
    row = ensure_series_row(db, franchise_name)
    cast = _load_cast(row)
    key = "characters" if bucket in ("characters", "animated") else "staff"
    member = {
        "id": f"manual-{uuid.uuid4().hex[:10]}",
        "name": (character or name).strip() if bucket in ("characters", "animated") else name.strip(),
        "character": (character or name).strip() if bucket in ("characters", "animated") else (character or "").strip() or None,
        "photo_url": photo_url or character_photo_url,
        "actor_photo_url": None,
        "character_photo_url": None,
        "actors": [{"name": name.strip(), "photo_url": None}] if name.strip() and bucket in ("characters", "animated") and character else [],
        "roles": roles
        or (
            [name.strip()]
            if bucket in ("characters", "animated") and name.strip()
            else ([character] if character else [])
        ),
        "is_deceased": False,
        "manual": True,
    }
    if bucket in ("characters", "animated"):
        # Character-centered: name = character; optional actor in roles
        char_name = (character or name).strip()
        actor_name = name.strip() if character and name.strip() and name.strip() != char_name else (
            (roles[0] if roles else None)
        )
        member["name"] = char_name
        member["character"] = char_name
        member["photo_url"] = character_photo_url or photo_url
        if actor_name:
            member["actors"] = [{"name": actor_name, "photo_url": None}]
            member["roles"] = [actor_name]
            member["actor_photo_url"] = photo_url if photo_url and photo_url != member["photo_url"] else None
            member["character_photo_url"] = member["actor_photo_url"]
    cast.setdefault(key, []).append(member)
    _save_cast(db, row, cast)
    return member


def remove_series_cast_member(
    db: Session,
    franchise_name: str,
    *,
    member_id: str | int,
    bucket: str | None = None,
) -> bool:
    row = find_series_row(db, franchise_name)
    if not row:
        return False
    cast = _load_cast(row)
    want = str(member_id)
    removed = False
    keys = (
        ["characters", "staff"]
        if not bucket
        else (
            ["characters"]
            if bucket in ("characters", "animated")
            else ["staff"]
        )
    )
    for key in keys:
        before = cast.get(key) or []
        after = [m for m in before if str(m.get("id")) != want]
        if len(after) != len(before):
            cast[key] = after
            removed = True
    if removed:
        _save_cast(db, row, cast)
    return removed


def patch_series_cast_member(
    db: Session,
    franchise_name: str,
    member_id: str | int,
    *,
    bucket: str = "characters",
    name: str | None = None,
    character: str | None = None,
    photo_url: str | None = None,
    actor_photo_url: str | None = None,
    actors: list[str] | None = None,
    roles: list[str] | None = None,
) -> dict | None:
    row = find_series_row(db, franchise_name)
    if not row:
        return None
    cast = _load_cast(row)
    key = "characters" if bucket in ("characters", "animated") else "staff"
    want = str(member_id)
    for member in cast.get(key) or []:
        if str(member.get("id")) != want:
            continue
        if name is not None:
            member["name"] = name.strip()
        if character is not None:
            member["character"] = character.strip() or None
            if bucket in ("characters", "animated") and character.strip():
                member["name"] = character.strip()
        if photo_url is not None:
            member["photo_url"] = photo_url.strip() or None
        if actor_photo_url is not None:
            member["actor_photo_url"] = actor_photo_url.strip() or None
            member["character_photo_url"] = member["actor_photo_url"]
        if actors is not None:
            cleaned = [a.strip() for a in actors if a and a.strip()]
            member["actors"] = [{"name": a, "photo_url": None} for a in cleaned]
            member["roles"] = cleaned
        elif roles is not None:
            member["roles"] = [r for r in roles if r]
        member["manual"] = True
        _save_cast(db, row, cast)
        return member
    return None


def _load_links(row: Series) -> list[dict]:
    try:
        data = json.loads(row.ser_links_json or "[]")
    except (json.JSONDecodeError, TypeError):
        data = []
    if not isinstance(data, list):
        return []
    return [x for x in data if isinstance(x, dict)]


def _save_links(db: Session, row: Series, links: list[dict]) -> None:
    row.ser_links_json = json.dumps(links, ensure_ascii=False)
    db.commit()


def add_series_link(
    db: Session,
    franchise_name: str,
    *,
    category: str,
    label: str,
    url: str,
    logo_key: str | None = None,
    logo_url: str | None = None,
) -> dict:
    row = ensure_series_row(db, franchise_name)
    links = _load_links(row)
    item = {
        "id": f"lnk-{uuid.uuid4().hex[:10]}",
        "category": category or "databases",
        "label": (label or "").strip() or "Link",
        "url": (url or "").strip(),
        "logo_key": logo_key,
        "logo_url": logo_url
        or (f"/assets/links/{logo_key}.svg" if logo_key else "/assets/links/link.svg"),
    }
    links.append(item)
    _save_links(db, row, links)
    return item


def patch_series_link(
    db: Session,
    franchise_name: str,
    link_id: str,
    *,
    category: str | None = None,
    label: str | None = None,
    url: str | None = None,
    logo_key: str | None = None,
    logo_url: str | None = None,
    clear_logo_key: bool = False,
) -> dict | None:
    row = find_series_row(db, franchise_name)
    if not row:
        return None
    links = _load_links(row)
    want = str(link_id)
    for item in links:
        if str(item.get("id")) != want:
            continue
        if category is not None:
            item["category"] = category
        if label is not None:
            item["label"] = label.strip() or item.get("label") or "Link"
        if url is not None:
            item["url"] = url.strip()
        if clear_logo_key:
            item["logo_key"] = None
        elif logo_key is not None:
            item["logo_key"] = logo_key or None
        if logo_url is not None:
            item["logo_url"] = logo_url
        elif item.get("logo_key"):
            item["logo_url"] = f"/assets/links/{item['logo_key']}.svg"
        _save_links(db, row, links)
        return item
    return None


def remove_series_link(
    db: Session, franchise_name: str, link_id: str
) -> bool:
    row = find_series_row(db, franchise_name)
    if not row:
        return False
    links = _load_links(row)
    want = str(link_id)
    after = [x for x in links if str(x.get("id")) != want]
    if len(after) == len(links):
        return False
    _save_links(db, row, after)
    return True
