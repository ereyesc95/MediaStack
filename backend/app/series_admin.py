"""Admin mutations for Series franchise about + cast + links."""
from __future__ import annotations

import hashlib
import json
import uuid

from sqlalchemy.orm import Session

from app.models import Country, Series
from app.series_languages import normalize_lang_code
from app.series_refresh import ensure_series_row, find_series_row


def stable_cast_member_id(name: str, *, prefix: str = "staff") -> str:
    key = (name or "member").strip().casefold().encode("utf-8")
    return f"{prefix}-{hashlib.sha1(key).hexdigest()[:12]}"


def ensure_cast_member_id(member: dict, *, character_centered: bool = False) -> str:
    """Return a stable id, assigning one onto the member dict when missing."""
    mid = member.get("id")
    if mid is not None and str(mid).strip() != "":
        return str(mid)
    prefix = "char" if character_centered else "staff"
    label = (member.get("character") or member.get("name") or "member").strip()
    assigned = stable_cast_member_id(label, prefix=prefix)
    member["id"] = assigned
    return assigned


def _ensure_unique_cast_ids(
    members: list, *, character_centered: bool = False
) -> None:
    """Assign unique character-based ids; rewrite actor-based char-{digits} collisions."""
    import re

    seen: set[str] = set()
    prefix = "char" if character_centered else "staff"
    actor_id_re = re.compile(r"^char-\d+$")
    for m in members:
        if not isinstance(m, dict):
            continue
        label = (m.get("character") or m.get("name") or "member").strip()
        preferred = stable_cast_member_id(label, prefix=prefix)
        mid = m.get("id")
        mid_s = str(mid).strip() if mid is not None else ""
        needs_reassign = (
            not mid_s
            or mid_s in seen
            or (character_centered and actor_id_re.match(mid_s) is not None)
        )
        if needs_reassign:
            mid_s = preferred if preferred not in seen else f"{preferred}-{uuid.uuid4().hex[:6]}"
            m["id"] = mid_s
        else:
            m["id"] = mid_s
        seen.add(str(m["id"]))


def _member_id_matches(member: dict, want: str, *, character_centered: bool) -> bool:
    mid = member.get("id")
    if mid is not None and str(mid) == want:
        return True
    if mid is None or str(mid).strip() == "":
        prefix = "char" if character_centered else "staff"
        label = (member.get("character") or member.get("name") or "").strip()
        if stable_cast_member_id(label, prefix=prefix) == want:
            member["id"] = want
            return True
    return False


def _member_name_matches(member: dict, want_name: str | None) -> bool:
    if not want_name or not str(want_name).strip():
        return True
    want = str(want_name).strip().casefold()
    for key in ("character", "name"):
        val = (member.get(key) or "").strip().casefold()
        if val and val == want:
            return True
    return False


def _load_images(row: Series) -> dict:
    try:
        images = json.loads(row.ser_images_json or "{}")
    except (json.JSONDecodeError, TypeError):
        images = {}
    return images if isinstance(images, dict) else {}


def _save_images(db: Session, row: Series, images: dict) -> None:
    row.ser_images_json = json.dumps(images, ensure_ascii=False)
    db.commit()


def _clean_genres(genres: list[dict] | list[str] | None) -> list[dict]:
    cleaned_genres: list[dict] = []
    seen_g: set[str] = set()
    for g in genres or []:
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
    return cleaned_genres


def _clean_languages(languages: list[str] | None) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in languages or []:
        code = normalize_lang_code(raw) or (raw or "").strip()
        if not code or code in seen:
            continue
        seen.add(code)
        cleaned.append(code)
    return cleaned


def _periods_from_activity(
    activity_start: str | None, activity_end: str | None
) -> list[dict]:
    starts = (activity_start or "").split(";")
    ends = (activity_end or "").split(";")
    periods = []
    for i, s in enumerate(starts):
        s = s.strip()
        e = ends[i].strip() if i < len(ends) else ""
        if s or e:
            periods.append({"start": s or None, "end": e or None})
    return periods


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
    subseries_id: str | None = None,
) -> Series:
    row = ensure_series_row(db, franchise_name)
    images = _load_images(row)

    # Per-subseries about overrides (writers/genres/country/langs/publishers/air dates/bio)
    if subseries_id and str(subseries_id).strip():
        sid = str(subseries_id).strip()
        subs = images.get("subseries")
        if not isinstance(subs, dict):
            subs = {}
        entry = dict(subs.get(sid) or {}) if isinstance(subs.get(sid), dict) else {}
        if bio is not None:
            entry["bio"] = bio.strip()
        if writers is not None:
            entry["writers"] = writers.strip().replace(",", ";") or ""
        if publishers is not None:
            entry["publishers"] = publishers.strip().replace(",", ";") or ""
        if genres is not None:
            entry["genres"] = _clean_genres(genres)
        if languages is not None:
            entry["languages"] = _clean_languages(languages)
        if country_id is not None:
            if country_id:
                crow = db.get(Country, country_id)
                entry["country_id"] = int(country_id)
                entry["country_iso"] = (
                    crow.cou_iso.lower() if crow and crow.cou_iso else None
                )
                entry["country_name"] = crow.cou_name if crow else None
            else:
                entry["country_id"] = None
                entry["country_iso"] = None
                entry["country_name"] = None
        if activity_start is not None or activity_end is not None:
            entry["activity_periods"] = _periods_from_activity(
                activity_start, activity_end
            )
        subs[sid] = entry
        images["subseries"] = subs
        row.ser_images_json = json.dumps(images, ensure_ascii=False)
        db.commit()
        db.refresh(row)
        return row

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
        row.ser_genres_json = json.dumps(_clean_genres(genres), ensure_ascii=False)
    if activity_start is not None or activity_end is not None:
        images["activity_periods"] = _periods_from_activity(
            activity_start, activity_end
        )
    if languages is not None:
        images["languages"] = _clean_languages(languages)
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
    chars = [m for m in (data.get("characters") or []) if isinstance(m, dict)]
    staff = [m for m in (data.get("staff") or []) if isinstance(m, dict)]
    _ensure_unique_cast_ids(chars, character_centered=True)
    _ensure_unique_cast_ids(staff, character_centered=False)
    data["characters"] = chars
    data["staff"] = staff
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
    subseries_ids: list[str] | None = None,
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
        role_names = [r.strip() for r in (roles or []) if r and str(r).strip()]
        actor_name = (
            name.strip()
            if character and name.strip() and name.strip() != char_name
            else (role_names[0] if role_names else None)
        )
        if actor_name and actor_name not in role_names:
            role_names = [actor_name, *role_names]
        member["name"] = char_name
        member["character"] = char_name
        member["photo_url"] = character_photo_url or photo_url
        if role_names:
            actor_photo = (
                photo_url if photo_url and photo_url != member["photo_url"] else None
            )
            performance = {
                "language": lang,
                "actor_name": role_names[0],
                "actor_names": role_names,
                "photo_url": actor_photo,
            }
            member["performances"] = [performance]
            member["actors"] = [
                {
                    "name": an,
                    "photo_url": actor_photo if i == 0 else None,
                    "language": lang,
                }
                for i, an in enumerate(role_names)
            ]
            member["roles"] = role_names
            member["actor_photo_url"] = actor_photo
            member["character_photo_url"] = actor_photo
    if subseries_ids is not None:
        member["subseries_ids"] = [
            str(s).strip() for s in subseries_ids if s and str(s).strip()
        ]
    cast.setdefault(key, []).append(member)
    _save_cast(db, row, cast)
    return member


def remove_series_cast_member(
    db: Session,
    franchise_name: str,
    *,
    member_id: str | int,
    bucket: str | None = None,
    member_name: str | None = None,
    subseries_id: str | None = None,
    from_franchise: bool = False,
    retain_subseries_ids: list[str] | None = None,
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
    scope = (subseries_id or "").strip()
    scoped = bool(scope) and scope != "all" and not from_franchise

    for key in keys:
        before = cast.get(key) or []
        character_centered = key == "characters"
        matches = [
            m
            for m in before
            if isinstance(m, dict)
            and _member_id_matches(
                m, want, character_centered=character_centered
            )
            and _member_name_matches(m, member_name)
        ]
        if not matches and member_name:
            matches = [
                m
                for m in before
                if isinstance(m, dict)
                and _member_id_matches(
                    m, want, character_centered=character_centered
                )
            ]
            if len(matches) > 1:
                matches = [
                    m for m in matches if _member_name_matches(m, member_name)
                ]
        if not matches:
            continue

        target = matches[0]
        if scoped:
            ids = [
                str(s).strip()
                for s in (target.get("subseries_ids") or [])
                if s and str(s).strip()
            ]
            if not ids:
                # Franchise-wide member: keep on every other subseries
                keep = [
                    str(s).strip()
                    for s in (retain_subseries_ids or [])
                    if s and str(s).strip() and str(s).strip() != scope
                ]
                target["subseries_ids"] = keep
            else:
                target["subseries_ids"] = [s for s in ids if s != scope]

            perfs = target.get("performances") or []
            if isinstance(perfs, list):
                new_perfs = []
                for p in perfs:
                    if not isinstance(p, dict):
                        continue
                    pids = [
                        str(s).strip()
                        for s in (p.get("subseries_ids") or [])
                        if s and str(s).strip()
                    ]
                    if not pids:
                        new_perfs.append(p)
                        continue
                    if scope not in pids:
                        new_perfs.append(p)
                        continue
                    remaining = [s for s in pids if s != scope]
                    if remaining:
                        p = {**p, "subseries_ids": remaining}
                        new_perfs.append(p)
                target["performances"] = new_perfs

            # No remaining subseries → delete the member
            if not (target.get("subseries_ids") or []):
                drop_id = id(target)
                cast[key] = [m for m in before if id(m) != drop_id]
            removed = True
            break

        # Full delete (franchise-wide / explicit)
        drop_id = id(target)
        after = [m for m in before if id(m) != drop_id]
        if len(after) != len(before):
            cast[key] = after
            removed = True
            break
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
    subseries_ids: list[str] | None = None,
    actor_subseries_ids: list[str] | None = None,
) -> dict | None:
    row = find_series_row(db, franchise_name)
    if not row:
        return None
    cast = _load_cast(row)
    key = "characters" if bucket in ("characters", "animated") else "staff"
    want = str(member_id)
    lang = normalize_lang_code(language) or language
    character_centered = key == "characters"
    for member in cast.get(key) or []:
        if not _member_id_matches(
            member, want, character_centered=character_centered
        ):
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
            normalized: list[dict] = []
            actors_out: list[dict] = []
            for p in performances:
                if not isinstance(p, dict):
                    continue
                plang = p.get("language") or "en"
                # Prefer nested per-actor photos when present
                nested = p.get("actors") if isinstance(p.get("actors"), list) else []
                names = [
                    str(n).strip()
                    for n in (p.get("actor_names") or [])
                    if n and str(n).strip()
                ]
                if not names:
                    an = (p.get("actor_name") or "").strip()
                    if an:
                        names = [an]
                if not names and nested:
                    names = [
                        str(a.get("name") or "").strip()
                        for a in nested
                        if isinstance(a, dict) and (a.get("name") or "").strip()
                    ]
                entry = {
                    **p,
                    "language": plang,
                    "actor_name": names[0] if names else None,
                    "actor_names": names,
                }
                normalized.append(entry)
                photo_by_name = {
                    str(a.get("name") or "").strip().casefold(): (
                        (a.get("photo_url") or "").strip() or None
                        if isinstance(a.get("photo_url"), str)
                        else a.get("photo_url")
                    )
                    for a in nested
                    if isinstance(a, dict) and (a.get("name") or "").strip()
                }
                for i, an in enumerate(names):
                    actors_out.append(
                        {
                            "name": an,
                            "photo_url": photo_by_name.get(an.casefold())
                            or (p.get("photo_url") if i == 0 else None),
                            "language": plang,
                        }
                    )
            member["performances"] = normalized
            member["actors"] = actors_out
            member["roles"] = [a["name"] for a in actors_out]
        elif actors is not None:
            use_lang = lang or "en"
            cleaned: list[dict] = []
            for a in actors:
                if isinstance(a, dict):
                    n = (a.get("name") or "").strip()
                    if not n:
                        continue
                    photo = a.get("photo_url")
                    if isinstance(photo, str):
                        photo = photo.strip() or None
                    else:
                        photo = None
                    cleaned.append(
                        {"name": n, "photo_url": photo, "language": use_lang}
                    )
                elif isinstance(a, str) and a.strip():
                    cleaned.append(
                        {
                            "name": a.strip(),
                            "photo_url": None,
                            "language": use_lang,
                        }
                    )
            # Scope this VA edit to a subseries (empty = franchise-wide default)
            scope = [
                str(s).strip()
                for s in (actor_subseries_ids or [])
                if s and str(s).strip()
            ]

            def _same_actor_scope(p: dict) -> bool:
                p_subs = [
                    str(x).strip()
                    for x in (p.get("subseries_ids") or [])
                    if x and str(x).strip()
                ]
                return sorted(p_subs) == sorted(scope)

            if (
                cleaned
                and not cleaned[0].get("photo_url")
                and member.get("actor_photo_url")
            ):
                cleaned[0]["photo_url"] = member.get("actor_photo_url")

            # Keep performances for other languages / other subseries scopes
            perfs = [
                p
                for p in (member.get("performances") or [])
                if isinstance(p, dict)
                and not (
                    (p.get("language") or "").casefold() == use_lang.casefold()
                    and _same_actor_scope(p)
                )
            ]
            if cleaned:
                entry: dict = {
                    "language": use_lang,
                    "actor_name": cleaned[0]["name"],
                    "actor_names": [c["name"] for c in cleaned],
                    "photo_url": cleaned[0].get("photo_url"),
                    "actors": [
                        {"name": c["name"], "photo_url": c.get("photo_url")}
                        for c in cleaned
                    ],
                }
                if scope:
                    entry["subseries_ids"] = scope
                perfs.insert(0, entry)
            member["performances"] = perfs

            # Rebuild flat actors[] as union across all performances (display helper)
            flat: list[dict] = []
            seen: set[str] = set()
            for p in perfs:
                if not isinstance(p, dict):
                    continue
                p_lang = p.get("language") or use_lang
                nested = p.get("actors") if isinstance(p.get("actors"), list) else []
                names = [
                    str(a.get("name") or "").strip()
                    for a in nested
                    if isinstance(a, dict) and str(a.get("name") or "").strip()
                ]
                if not names:
                    names = [
                        str(n).strip()
                        for n in (p.get("actor_names") or [])
                        if n and str(n).strip()
                    ]
                if not names and p.get("actor_name"):
                    names = [str(p["actor_name"]).strip()]
                for i, n in enumerate(names):
                    key = f"{p_lang.casefold()}::{n.casefold()}"
                    if key in seen:
                        continue
                    seen.add(key)
                    photo = None
                    if nested and i < len(nested) and isinstance(nested[i], dict):
                        photo = nested[i].get("photo_url")
                    if i == 0 and not photo:
                        photo = p.get("photo_url")
                    flat.append(
                        {"name": n, "photo_url": photo, "language": p_lang}
                    )
            member["actors"] = flat
            member["roles"] = [a["name"] for a in flat if a.get("name")]
            if cleaned and cleaned[0].get("photo_url"):
                member["actor_photo_url"] = cleaned[0]["photo_url"]
                member["character_photo_url"] = cleaned[0]["photo_url"]
        elif roles is not None:
            member["roles"] = [r for r in roles if r]
        if actor_photo_url is not None and lang and member.get("performances"):
            for p in member["performances"]:
                if (p.get("language") or "").casefold() == lang.casefold():
                    if not p.get("photo_url"):
                        p["photo_url"] = actor_photo_url.strip() or None
                    # Also stamp first nested actor if missing photo
                    nested = p.get("actors")
                    if isinstance(nested, list) and nested and isinstance(nested[0], dict):
                        if not nested[0].get("photo_url"):
                            nested[0]["photo_url"] = actor_photo_url.strip() or None
                    break
        if subseries_ids is not None:
            cleaned_subs = [
                str(s).strip() for s in subseries_ids if s and str(s).strip()
            ]
            member["subseries_ids"] = cleaned_subs
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
