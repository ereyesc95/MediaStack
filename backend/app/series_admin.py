"""Admin mutations for Series franchise about + cast + links."""
from __future__ import annotations

import json
import uuid

from sqlalchemy.orm import Session

from app.models import Country, Series
from app.series_languages import normalize_lang_code
from app.series_refresh import ensure_series_row, find_series_row


def _load_images(row: Series) -> dict:
    try:
        images = json.loads(row.ser_images_json or "{}")
    except (json.JSONDecodeError, TypeError):
        images = {}
    return images if isinstance(images, dict) else {}


def _save_images(db: Session, row: Series, images: dict) -> None:
    row.ser_images_json = json.dumps(images, ensure_ascii=False)
    db.commit()


def patch_series_about(
    db: Session,
    franchise_name: str,
    *,
    bio: str | None = None,
    writers: str | None = None,
    country_id: int | None = None,
    activity_start: str | None = None,
    activity_end: str | None = None,
    publishers: str | None = None,
    languages: list[str] | None = None,
    genres: list[dict] | list[str] | None = None,
    clear_origin_city: bool = True,
) -> Series:
    row = ensure_series_row(db, franchise_name)
    if bio is not None:
        row.ser_bio = bio.strip()
        row.ser_bio_manual = 1
        row.ser_bio_source = "manual"
    if writers is not None:
        row.ser_writers = writers.strip().replace(",", ";") or None
    # City field removed from UI — clear legacy values so Origin isn't duplicated
    if clear_origin_city:
        row.ser_origin_place = None
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
    if activity_end is not None:
        first_end = (activity_end.split(";")[0] or "").strip()
        row.ser_ending_date = first_end or None
    if publishers is not None:
        row.ser_publishers = publishers.strip().replace(",", ";") or None
        pubs = [p for p in (row.ser_publishers or "").split(";") if p.strip()]
        if pubs:
            row.ser_studio = pubs[0]
    if genres is not None:
        cleaned_genres: list[dict] = []
        seen_g: set[str] = set()
        for g in genres:
            if isinstance(g, dict):
                name = (g.get("name") or "").strip()
                gid = g.get("id")
            else:
                name = str(g).strip()
                gid = None
            if not name:
                continue
            key = name.casefold()
            if key in seen_g:
                continue
            seen_g.add(key)
            cleaned_genres.append({"id": gid or name, "name": name})
        row.ser_genres_json = json.dumps(cleaned_genres, ensure_ascii=False)
    images = _load_images(row)
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
    if languages is not None:
        cleaned: list[str] = []
        seen: set[str] = set()
        for raw in languages:
            code = normalize_lang_code(raw) or (raw or "").strip()
            if not code or code in seen:
                continue
            seen.add(code)
            cleaned.append(code)
        images["languages"] = cleaned
    if activity_start is not None or activity_end is not None or languages is not None:
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
    language: str | None = None,
) -> dict:
    row = ensure_series_row(db, franchise_name)
    cast = _load_cast(row)
    key = "characters" if bucket in ("characters", "animated") else "staff"
    lang = normalize_lang_code(language) or language or "en"
    member = {
        "id": f"manual-{uuid.uuid4().hex[:10]}",
        "name": (character or name).strip()
        if bucket in ("characters", "animated")
        else name.strip(),
        "character": (character or name).strip()
        if bucket in ("characters", "animated")
        else (character or "").strip() or None,
        "photo_url": photo_url or character_photo_url,
        "actor_photo_url": None,
        "character_photo_url": None,
        "performances": [],
        "actors": [],
        "roles": roles or [],
        "is_deceased": False,
        "manual": True,
    }
    if bucket in ("characters", "animated"):
        char_name = (character or name).strip()
        actor_name = (
            name.strip()
            if character and name.strip() and name.strip() != char_name
            else (roles[0] if roles else None)
        )
        member["name"] = char_name
        member["character"] = char_name
        member["photo_url"] = character_photo_url or photo_url
        if actor_name:
            performance = {
                "language": lang,
                "actor_name": actor_name,
                "photo_url": photo_url if photo_url and photo_url != member["photo_url"] else None,
            }
            member["performances"] = [performance]
            member["actors"] = [
                {
                    "name": actor_name,
                    "photo_url": performance["photo_url"],
                    "language": lang,
                }
            ]
            member["roles"] = [actor_name]
            member["actor_photo_url"] = performance["photo_url"]
            member["character_photo_url"] = performance["photo_url"]
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
    language: str | None = None,
    performances: list[dict] | None = None,
) -> dict | None:
    row = find_series_row(db, franchise_name)
    if not row:
        return None
    cast = _load_cast(row)
    key = "characters" if bucket in ("characters", "animated") else "staff"
    want = str(member_id)
    lang = normalize_lang_code(language) or language
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
        if performances is not None:
            member["performances"] = performances
            actors_out = []
            for p in performances:
                an = (p.get("actor_name") or "").strip()
                if an:
                    actors_out.append(
                        {
                            "name": an,
                            "photo_url": p.get("photo_url"),
                            "language": p.get("language"),
                        }
                    )
            member["actors"] = actors_out
            member["roles"] = [a["name"] for a in actors_out]
        elif actors is not None:
            cleaned = [a.strip() for a in actors if a and a.strip()]
            use_lang = lang or "en"
            member["actors"] = [
                {"name": a, "photo_url": None, "language": use_lang} for a in cleaned
            ]
            member["roles"] = cleaned
            # Update / create performance for this language
            perfs = [
                p
                for p in (member.get("performances") or [])
                if isinstance(p, dict)
                and (p.get("language") or "").casefold() != use_lang.casefold()
            ]
            if cleaned:
                perfs.insert(
                    0,
                    {
                        "language": use_lang,
                        "actor_name": cleaned[0],
                        "photo_url": member.get("actor_photo_url"),
                    },
                )
            member["performances"] = perfs
        elif roles is not None:
            member["roles"] = [r for r in roles if r]
        if actor_photo_url is not None and lang and member.get("performances"):
            for p in member["performances"]:
                if (p.get("language") or "").casefold() == lang.casefold():
                    p["photo_url"] = actor_photo_url.strip() or None
                    break
        member["manual"] = True
        _save_cast(db, row, cast)
        return member
    return None


def _related_bucket(images: dict, bucket: str) -> list[dict]:
    related = images.get("related")
    if not isinstance(related, dict):
        related = {}
        images["related"] = related
    items = related.get(bucket)
    if not isinstance(items, list):
        items = []
        related[bucket] = items
    return items


def add_series_related(
    db: Session,
    franchise_name: str,
    *,
    bucket: str,
    title: str,
    tmdb_id: int | str | None = None,
    date_iso: str | None = None,
    poster_url: str | None = None,
    overview: str | None = None,
) -> dict:
    row = ensure_series_row(db, franchise_name)
    images = _load_images(row)
    key = "creator" if bucket == "creator" else "similar"
    items = _related_bucket(images, key)
    # Un-hide if already present
    want = str(tmdb_id) if tmdb_id is not None else None
    for item in items:
        if want and str(item.get("tmdb_id") or "") == want:
            item["hidden"] = False
            item["manual"] = True
            item["title"] = title.strip() or item.get("title")
            if date_iso is not None:
                item["date_iso"] = date_iso
            if poster_url is not None:
                item["poster_url"] = poster_url
                item["cover_url"] = poster_url
            if overview is not None:
                item["overview"] = overview
            _save_images(db, row, images)
            return item
    card = {
        "id": f"manual-{uuid.uuid4().hex[:10]}",
        "tmdb_id": int(tmdb_id) if str(tmdb_id or "").isdigit() else tmdb_id,
        "title": title.strip(),
        "name": title.strip(),
        "date_iso": date_iso,
        "poster_url": poster_url,
        "cover_url": poster_url,
        "overview": overview,
        "manual": True,
        "hidden": False,
    }
    items.append(card)
    _save_images(db, row, images)
    return card


def remove_series_related(
    db: Session,
    franchise_name: str,
    *,
    bucket: str,
    item_id: str | int,
) -> bool:
    row = find_series_row(db, franchise_name)
    if not row:
        return False
    images = _load_images(row)
    key = "creator" if bucket == "creator" else "similar"
    items = _related_bucket(images, key)
    want = str(item_id)
    changed = False
    for item in items:
        ids = {str(item.get("id") or ""), str(item.get("tmdb_id") or "")}
        if want not in ids:
            continue
        if item.get("manual") and not item.get("tmdb_id"):
            items.remove(item)
        else:
            item["hidden"] = True
        changed = True
        break
    if changed:
        images["related"][key] = items
        _save_images(db, row, images)
    return changed


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
