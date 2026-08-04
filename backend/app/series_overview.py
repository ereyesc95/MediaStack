"""Build Series franchise overview payload (disk + TMDb-enriched DB)."""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.franchise_index import (
    build_franchise_index,
    load_franchise_index,
    normalize_franchise_slug,
    related_for_path,
    save_franchise_index,
)
from app.gallery import IMAGE_EXTS, _media_url
from app.media_index import format_display_date
from app.media_tabs_index import _folder_cover
from app.models import Band, Country, Series
from app.series_artwork import (
    build_local_eras,
    ensure_artwork_cached,
    find_character_photo,
    find_person_photo,
)
from app.series_index import (
    build_franchise_detail,
    build_series_gallery,
    find_franchise_dir,
)
from app.series_admin import ensure_cast_member_id
from app.series_refresh import ensure_series_row, find_series_row


def _parse_json(raw: str | None, default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return default


def _split_semi(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [p.strip() for p in raw.replace("■", ",").split(";") if p.strip()]



def _activity_periods(
    start: str | None,
    end: str | None,
    status: str | None,
    images: dict | None = None,
) -> list[dict]:
    stored = (images or {}).get("activity_periods") if images else None
    if isinstance(stored, list) and stored:
        out = []
        for p in stored:
            if not isinstance(p, dict):
                continue
            s, e = p.get("start"), p.get("end")

            def year(iso: str | None) -> str | None:
                if not iso:
                    return None
                return iso[:4] if len(iso) >= 4 else iso

            ys, ye = year(s), year(e)
            if ys and ye and ys != ye:
                label = f"{ys}–{ye}"
            elif ys and not ye:
                label = f"{ys}–present"
            else:
                label = ys or ye or ""
            if label:
                out.append({"label": label, "start": s, "end": e})
        if out:
            return out

    def year(iso: str | None) -> str | None:
        if not iso:
            return None
        return iso[:4] if len(iso) >= 4 else iso

    ys, ye = year(start), year(end)
    if not ys and not ye:
        if status:
            return [{"label": status, "start": None, "end": None}]
        return []
    if ys and ye and ys != ye:
        label = f"{ys}–{ye}"
    elif ys and (status or "").casefold() in {"returning series", "in production"}:
        label = f"{ys}–present"
    elif ys:
        label = ys if not ye else f"{ys}–{ye}"
    else:
        label = ye or ""
    periods = [{"label": label, "start": start, "end": end}]
    if status and status.casefold() not in {label.casefold()}:
        periods.append({"label": status, "start": None, "end": None})
    return periods


def _list_brand_assets(franchise_dir: Path, media_root: Path) -> tuple[str | None, str | None]:
    from app.series_paths import find_logo_file

    return find_logo_file(franchise_dir, media_root)


def _enrich_cast_member(
    m: dict,
    *,
    franchise_dir: Path,
    media_root: Path,
    character_centered: bool = True,
    default_language: str | None = None,
) -> dict:
    name = m.get("name") or ""
    character = m.get("character") or (name if character_centered else None)
    tid = m.get("id") if isinstance(m.get("id"), int) else None
    actors = m.get("actors") if isinstance(m.get("actors"), list) else []
    performances = m.get("performances") if isinstance(m.get("performances"), list) else []
    # Legacy → performances
    if character_centered and not performances:
        if actors:
            # Group same-language actors into one performance with actor_names
            by_lang: dict[str, list[dict]] = {}
            for a in actors:
                if not isinstance(a, dict) or not a.get("name"):
                    continue
                lang = (a.get("language") or default_language or "en").casefold()
                by_lang.setdefault(lang, []).append(a)
            for lang_key, group in by_lang.items():
                names = [g["name"] for g in group if g.get("name")]
                performances.append(
                    {
                        "language": group[0].get("language") or default_language or "en",
                        "actor_name": names[0] if names else None,
                        "actor_names": names,
                        "actor_id": group[0].get("id"),
                        "photo_url": next(
                            (g.get("photo_url") for g in group if g.get("photo_url")),
                            None,
                        ),
                    }
                )
        elif m.get("roles"):
            for role in m["roles"]:
                if not role:
                    continue
                performances.append(
                    {
                        "language": default_language or "en",
                        "actor_name": role,
                        "actor_names": [role],
                        "photo_url": m.get("actor_photo_url")
                        or m.get("character_photo_url"),
                    }
                )
    # Normalize actor_names; merge only when language AND subseries scope match
    if character_centered and performances:
        merged: dict[str, dict] = {}
        order: list[str] = []
        for p in performances:
            if not isinstance(p, dict):
                continue
            lang = (p.get("language") or default_language or "en").casefold()
            scope = tuple(
                sorted(
                    str(s).strip()
                    for s in (p.get("subseries_ids") or [])
                    if s and str(s).strip()
                )
            )
            key = f"{lang}::{'|'.join(scope)}"
            names = [
                str(n).strip()
                for n in (p.get("actor_names") or [])
                if n and str(n).strip()
            ]
            if not names:
                an = (p.get("actor_name") or "").strip()
                if an:
                    names = [an]
            if key not in merged:
                entry = {
                    **p,
                    "actor_name": names[0] if names else None,
                    "actor_names": list(names),
                }
                if scope:
                    entry["subseries_ids"] = list(scope)
                else:
                    entry.pop("subseries_ids", None)
                merged[key] = entry
                order.append(key)
            else:
                existing = merged[key].setdefault("actor_names", [])
                for n in names:
                    if n not in existing:
                        existing.append(n)
                if not merged[key].get("photo_url") and p.get("photo_url"):
                    merged[key]["photo_url"] = p.get("photo_url")
                # Preserve / merge nested actors
                nested_in = p.get("actors") if isinstance(p.get("actors"), list) else []
                if nested_in:
                    out_nested = merged[key].setdefault("actors", [])
                    if not isinstance(out_nested, list):
                        out_nested = []
                        merged[key]["actors"] = out_nested
                    seen_n = {
                        str(a.get("name") or "").strip().casefold()
                        for a in out_nested
                        if isinstance(a, dict)
                    }
                    for a in nested_in:
                        if not isinstance(a, dict) or not a.get("name"):
                            continue
                        nk = str(a["name"]).strip().casefold()
                        if nk in seen_n:
                            continue
                        seen_n.add(nk)
                        out_nested.append(a)
                merged[key]["actor_name"] = (
                    merged[key]["actor_names"][0]
                    if merged[key]["actor_names"]
                    else None
                )
        performances = [merged[k] for k in order]
    actor_photo = m.get("actor_photo_url") or m.get("character_photo_url")
    if not actor_photo and performances:
        actor_photo = (performances[0] or {}).get("photo_url")
    if not actor_photo and actors:
        actor_photo = (actors[0] or {}).get("photo_url")

    if character_centered:
        char_local = find_character_photo(
            character or name,
            franchise_dir=franchise_dir,
            media_root=media_root,
            actor_name=name,
        )
        # Actor local photo (first performance / actor)
        actor_name = None
        if performances:
            actor_name = (performances[0] or {}).get("actor_name")
        if not actor_name and actors:
            actor_name = (actors[0] or {}).get("name")
        actor_local = None
        if actor_name:
            actor_local = find_person_photo(
                actor_name, franchise_dir=franchise_dir, media_root=media_root
            )
        photo = char_local or m.get("photo_url")
        # Don't keep actor shot as the character front
        if photo and actor_photo and photo == actor_photo and not char_local:
            photo = None
        # Enrich performances with local actor photos when possible
        enriched_perfs = []
        for p in performances:
            if not isinstance(p, dict):
                continue
            p_names = [
                str(n).strip()
                for n in (p.get("actor_names") or [])
                if n and str(n).strip()
            ]
            if not p_names:
                an0 = (p.get("actor_name") or "").strip()
                if an0:
                    p_names = [an0]
            nested_in = p.get("actors") if isinstance(p.get("actors"), list) else []
            nested_photos = {
                str(a.get("name") or "").strip().casefold(): (
                    (a.get("photo_url") or "").strip() or None
                    if isinstance(a.get("photo_url"), str)
                    else a.get("photo_url")
                )
                for a in nested_in
                if isinstance(a, dict) and (a.get("name") or "").strip()
            }
            # Also pull from member.actors for this language
            for a in actors:
                if not isinstance(a, dict) or not a.get("name"):
                    continue
                if (a.get("language") or "").casefold() not in (
                    "",
                    (p.get("language") or "").casefold(),
                ):
                    continue
                key = str(a["name"]).strip().casefold()
                if key and key not in nested_photos and a.get("photo_url"):
                    nested_photos[key] = a.get("photo_url")
            if not p_names and nested_photos:
                p_names = [
                    str(a.get("name") or "").strip()
                    for a in nested_in
                    if isinstance(a, dict) and (a.get("name") or "").strip()
                ]
            p_actor = p_names[0] if p_names else ""
            local = (
                find_person_photo(
                    p_actor, franchise_dir=franchise_dir, media_root=media_root
                )
                if p_actor
                else None
            )
            nested_out = []
            for an in p_names:
                a_local = find_person_photo(
                    an, franchise_dir=franchise_dir, media_root=media_root
                )
                nested_out.append(
                    {
                        "name": an,
                        "photo_url": a_local
                        or nested_photos.get(an.casefold())
                        or (local if an == p_actor else None)
                        or (p.get("photo_url") if an == p_actor else None),
                    }
                )
            enriched_perfs.append(
                {
                    **p,
                    "actor_name": p_names[0] if p_names else None,
                    "actor_names": p_names,
                    "actors": nested_out,
                    "photo_url": (nested_out[0]["photo_url"] if nested_out else None)
                    or local
                    or p.get("photo_url"),
                }
            )
        flat_actors = []
        for p in enriched_perfs:
            nested = p.get("actors") if isinstance(p.get("actors"), list) else []
            if nested:
                for a in nested:
                    if not isinstance(a, dict) or not a.get("name"):
                        continue
                    flat_actors.append(
                        {
                            "name": a["name"],
                            "photo_url": a.get("photo_url"),
                            "language": p.get("language"),
                        }
                    )
                continue
            names = p.get("actor_names") or (
                [p["actor_name"]] if p.get("actor_name") else []
            )
            for i, an in enumerate(names):
                flat_actors.append(
                    {
                        "name": an,
                        "photo_url": p.get("photo_url") if i == 0 else None,
                        "language": p.get("language"),
                    }
                )
        mid = ensure_cast_member_id(
            {**m, "name": character or name, "character": character or name},
            character_centered=True,
        )
        return {
            **m,
            "id": mid,
            "name": character or name,
            "character": character or name,
            "photo_url": photo,
            "actor_photo_url": actor_local or actor_photo,
            "character_photo_url": actor_local or actor_photo,
            "performances": enriched_perfs,
            "actors": actors or flat_actors,
            "roles": m.get("roles") or [a["name"] for a in flat_actors],
            "tmdb_photo_url": actor_photo,
            "subseries_ids": m.get("subseries_ids")
            if isinstance(m.get("subseries_ids"), list)
            else [],
        }

    local = find_person_photo(
        name, franchise_dir=franchise_dir, media_root=media_root, tmdb_id=tid
    )
    mid = ensure_cast_member_id(
        {**m, "name": character or name, "character": character or name},
        character_centered=False,
    )
    return {
        **m,
        "id": mid,
        "photo_url": local or m.get("photo_url"),
        "character_photo_url": m.get("character_photo_url"),
        "actor_photo_url": m.get("actor_photo_url"),
        "tmdb_photo_url": m.get("photo_url"),
        "performances": performances,
    }


def _ensure_franchise_index(media_root: Path):
    from app.franchise_index import FRANCHISE_INDEX_VERSION

    cached = load_franchise_index()
    if (
        cached
        and cached.franchises
        and getattr(cached, "index_version", 0) == FRANCHISE_INDEX_VERSION
    ):
        return cached
    index = build_franchise_index(media_root)
    save_franchise_index(index)
    return index


def _enrich_related_cards(
    entries: list[dict], media_root: Path
) -> list[dict]:
    """Attach cover/banner/logo and a primary open_url for movies/books/games."""
    from app.band_library import _find_artwork_subdir
    from app.media_index import _artwork_file
    from app.media_item_overview import VIDEO_EXTS, _file_url
    from app.artwork_stems import COVER_FRONT_STEM

    BOOK_EXTS = {".pdf", ".epub", ".cbz", ".cbr", ".mobi", ".azw", ".azw3"}
    GAME_EXTS = {
        ".gba",
        ".nds",
        ".3ds",
        ".cia",
        ".nsp",
        ".xci",
        ".iso",
        ".cso",
        ".chd",
        ".rvz",
        ".wud",
        ".wux",
        ".nkit",
        ".psone",
        ".pbp",
        ".vpk",
        ".exe",
        ".bat",
        ".cmd",
        ".lnk",
        ".zip",
        ".7z",
        ".rar",
    }

    def _first_file(folder: Path, exts: set[str]) -> Path | None:
        try:
            files = sorted(folder.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            return None
        for f in files:
            if f.is_file() and f.suffix.lower() in exts:
                return f
        for f in files:
            if f.is_dir() and not f.name.startswith("[") and f.name.casefold() != "artwork":
                nested = _first_file(f, exts)
                if nested:
                    return nested
        return None

    from app.series_index import (
        _series_folder_banner,
        _series_folder_cover,
        _series_folder_landscape,
    )
    from app.series_paths import find_logo_file

    out = []
    for e in entries:
        path = e.get("path") or ""
        folder = media_root / path.replace("\\", "/")
        cover = None
        portrait = None
        landscape = None
        banner = None
        logo = None
        open_url = None
        open_mode = None
        duration = e.get("duration")
        duration_sec = e.get("duration_sec")
        kind = (e.get("kind") or "").casefold()
        if folder.is_dir():
            if kind == "movie":
                portrait = _series_folder_cover(folder, media_root) or _folder_cover(
                    folder, media_root
                )
                landscape = _series_folder_landscape(folder, media_root)
                banner = (
                    _series_folder_banner(folder, media_root)
                    or landscape
                    or portrait
                )
                cover = portrait or landscape or _folder_cover(folder, media_root)
                logo_url, _icon = find_logo_file(folder, media_root)
                logo = logo_url
            else:
                cover = _folder_cover(folder, media_root)
                art = _find_artwork_subdir(folder)
                if art:
                    for stem in (
                        "cover - banner",
                        "wallpaper - landscape",
                        COVER_FRONT_STEM,
                    ):
                        f = _artwork_file(art, stem)
                        if f:
                            banner = _media_url(f, media_root)
                            break
                    logo_f = None
                    try:
                        for f in art.iterdir():
                            if (
                                f.is_file()
                                and f.suffix.lower() in IMAGE_EXTS
                                and "logo" in f.stem.casefold()
                                and "collapsed" not in f.stem.casefold()
                            ):
                                logo_f = f
                                break
                    except OSError:
                        pass
                    if logo_f:
                        logo = _media_url(logo_f, media_root)
            target = None
            if kind == "movie":
                target = _first_file(folder, VIDEO_EXTS)
            elif kind == "book":
                target = _first_file(folder, BOOK_EXTS)
            elif kind == "game":
                target = _first_file(folder, GAME_EXTS)
            if target:
                if kind == "game":
                    rel = target.relative_to(media_root).as_posix()
                    open_url = f"/api/media/open-local?path={quote(rel, safe='/')}"
                    open_mode = "local"
                else:
                    open_url = _file_url(target, media_root) or (
                        f"/api/media/file?path={quote(target.relative_to(media_root).as_posix(), safe='/')}"
                    )
                    open_mode = "tab"
                if kind == "movie":
                    from app.release_tracklist import (
                        _duration_from_file,
                        _format_duration,
                    )

                    duration_sec = _duration_from_file(target)
                    if duration_sec is None and target.suffix.lower() in {
                        ".mp4",
                        ".m4v",
                        ".mov",
                    }:
                        try:
                            from app.media_item_overview import (
                                _mp4_duration_from_mvhd,
                            )

                            duration_sec = _mp4_duration_from_mvhd(target)
                        except Exception:
                            duration_sec = None
                    duration = (
                        _format_duration(duration_sec) if duration_sec else None
                    )
        out.append(
            {
                **e,
                "cover_url": cover,
                "portrait_url": portrait or cover,
                "landscape_url": landscape,
                "banner_url": banner or landscape or cover,
                "logo_url": logo,
                "open_url": open_url,
                "open_mode": open_mode,
                "display_date": format_display_date(e.get("date_iso")),
                "duration": duration,
                "duration_sec": duration_sec,
            }
        )
    return out


def _find_music_band(db: Session, franchise_name: str) -> Band | None:
    want = normalize_franchise_slug(franchise_name)
    for band in db.scalars(select(Band)).all():
        name = band.bnd_name or ""
        if normalize_franchise_slug(name) == want:
            return band
    return None


def build_series_overview(
    db: Session,
    franchise_id: str,
    *,
    orientation: str = "portrait",
) -> dict | None:
    root = Path(settings.media_root) if settings.media_root else None
    if not root or not root.is_dir():
        return None
    found = find_franchise_dir(franchise_id, root)
    if not found:
        return None
    franchise_dir, letter = found
    detail = build_franchise_detail(franchise_id, root)
    if not detail:
        return None

    name = detail["name"]
    folder_path = detail["folder_path"]
    row = find_series_row(db, name) or ensure_series_row(db, name)

    genres_raw = _parse_json(row.ser_genres_json, [])
    genres = [
        {"id": g.get("id") or i, "name": g.get("name") or str(g)}
        for i, g in enumerate(genres_raw)
        if (g.get("name") if isinstance(g, dict) else g)
    ]

    # Normalize + rewrite colliding actor-based character ids, then persist
    from app.series_admin import _load_cast, _save_cast

    loaded_cast = _load_cast(row)
    _save_cast(db, row, loaded_cast)
    characters = [m for m in (loaded_cast.get("characters") or []) if isinstance(m, dict)]
    staff = [m for m in (loaded_cast.get("staff") or []) if isinstance(m, dict)]

    images = _parse_json(row.ser_images_json, {})
    if not isinstance(images, dict):
        images = {}

    from app.series_languages import (
        LANGUAGE_CATALOG,
        language_options_for_franchise,
        normalize_lang_code,
        origin_language_code,
    )

    origin_lang = (
        normalize_lang_code(images.get("origin_language"))
        or origin_language_code(country_iso=row.ser_country_iso)
        or "en"
    )
    selected_langs = images.get("languages")
    if not isinstance(selected_langs, list) or not selected_langs:
        selected_langs = [origin_lang]
    else:
        selected_langs = [
            normalize_lang_code(c) or c for c in selected_langs if c
        ]

    cast = {
        "characters": [
            _enrich_cast_member(
                m,
                franchise_dir=franchise_dir,
                media_root=root,
                character_centered=True,
                default_language=origin_lang,
            )
            for m in characters
        ],
        "staff": [
            _enrich_cast_member(
                m,
                franchise_dir=franchise_dir,
                media_root=root,
                character_centered=False,
            )
            for m in staff
        ],
        # legacy aliases for older clients
        "animated": [],
        "people": [],
    }
    cast["animated"] = cast["characters"]
    cast["people"] = cast["staff"]

    # Languages that currently have at least one character performance
    cast_lang_codes: set[str] = set()
    for m in cast["characters"]:
        for p in m.get("performances") or []:
            code = normalize_lang_code(p.get("language")) or p.get("language")
            if code:
                cast_lang_codes.add(code)

    language_options = language_options_for_franchise(
        selected_langs, origin_code=origin_lang
    )
    # Cast tab pills: enabled langs that have cast (hide empty)
    cast_languages = [
        opt
        for opt in language_options
        if opt.get("selected") and opt["code"] in cast_lang_codes
    ]
    if not cast_languages and cast_lang_codes:
        # Fall back: show any lang that has cast
        for code in sorted(cast_lang_codes):
            cast_languages.append(
                {
                    "code": code,
                    "label": next(
                        (c["label"] for c in LANGUAGE_CATALOG if c["code"] == code),
                        code,
                    ),
                    "is_origin": code == origin_lang,
                    "selected": True,
                }
            )
    links_raw = _parse_json(row.ser_links_json, [])
    # Shape like EntityLinksPayload categories
    by_cat: dict[str, list] = {
        "social": [],
        "streaming": [],
        "shopping": [],
        "downloads": [],
        "databases": [],
        "lyrics": [],
    }
    links_changed = False

    for link in links_raw:
        if not isinstance(link, dict) or not link.get("url"):
            continue
        if not link.get("id"):
            link["id"] = f"lnk-{uuid.uuid4().hex[:10]}"
            links_changed = True
        cat = link.get("category") or "databases"
        if cat not in by_cat:
            cat = "databases"
        logo_key = link.get("logo_key")
        logo_url = link.get("logo_url")
        if logo_key and not logo_url:
            logo_url = f"/assets/links/{logo_key}.svg"
        if not logo_url:
            logo_url = "/assets/links/link.svg"
        by_cat[cat].append(
            {
                "id": link["id"],
                "label": link.get("label") or link["url"],
                "url": link["url"],
                "logo_url": logo_url,
                "logo_key": logo_key,
                "category": cat,
            }
        )
    if links_changed:
        row.ser_links_json = json.dumps(links_raw, ensure_ascii=False)
        db.commit()
    categories = [
        {"id": cid, "label": cid.upper(), "count": len(items)}
        for cid, items in by_cat.items()
        if items
    ]
    links_payload = {
        "entity_type": "series",
        "entity_id": row.ser_id or 0,
        "categories": categories,
        "groups": {c: by_cat[c] for c in by_cat if by_cat[c]},
        "total": sum(len(v) for v in by_cat.values()),
    }

    posters = images.get("posters") or []
    backdrops = images.get("backdrops") or []
    # Ensure local [Artwork] has Portrait/Landscape files (download TMDb if missing)
    if posters or backdrops or row.ser_poster_url or row.ser_backdrop_url:
        ensure_artwork_cached(
            franchise_dir,
            root,
            posters=posters
            or ([row.ser_poster_url] if row.ser_poster_url else []),
            backdrops=backdrops
            or ([row.ser_backdrop_url] if row.ser_backdrop_url else []),
        )
    local_eras = build_local_eras(franchise_dir, root)

    logo_url, icon_url = _list_brand_assets(franchise_dir, root)
    if local_eras and (logo_url or icon_url):
        local_eras[0] = {
            **local_eras[0],
            "logo_url": logo_url or local_eras[0].get("logo_url"),
            "icon_url": icon_url or local_eras[0].get("icon_url"),
        }

    country = None
    if row.ser_country_iso:
        iso = row.ser_country_iso.lower()
        crow = db.scalars(
            select(Country).where(Country.cou_iso == iso)
        ).first()
        if crow:
            country = {
                "id": crow.cou_id,
                "name": crow.cou_name,
                "iso": crow.cou_iso,
            }
        else:
            country = {"id": 0, "name": iso.upper(), "iso": iso}

    # Per-subseries about overrides (edit from subseries page)
    subseries_meta: dict[str, dict] = {}
    raw_subs = images.get("subseries") if isinstance(images, dict) else None
    if isinstance(raw_subs, dict):
        for sid, entry in raw_subs.items():
            if not isinstance(entry, dict):
                continue
            sid_s = str(sid)
            sm_genres = entry.get("genres") if isinstance(entry.get("genres"), list) else None
            sm_langs = entry.get("languages") if isinstance(entry.get("languages"), list) else None
            sm_periods = entry.get("activity_periods")
            sm_country = None
            cid = entry.get("country_id")
            iso = (entry.get("country_iso") or "").lower() or None
            if cid or iso:
                crow = None
                if cid:
                    crow = db.get(Country, int(cid)) if str(cid).isdigit() else None
                if not crow and iso:
                    crow = db.scalars(
                        select(Country).where(Country.cou_iso == iso)
                    ).first()
                if crow:
                    sm_country = {
                        "id": crow.cou_id,
                        "name": crow.cou_name,
                        "iso": crow.cou_iso,
                    }
                else:
                    sm_country = {
                        "id": int(cid) if cid else 0,
                        "name": entry.get("country_name") or (iso.upper() if iso else None),
                        "iso": iso,
                    }
            writers_raw = entry.get("writers")
            pubs_raw = entry.get("publishers")
            subseries_meta[sid_s] = {
                "bio": entry.get("bio"),
                "writers": _split_semi(writers_raw)
                if isinstance(writers_raw, str)
                else (writers_raw if isinstance(writers_raw, list) else None),
                "publishers": _split_semi(pubs_raw)
                if isinstance(pubs_raw, str)
                else (pubs_raw if isinstance(pubs_raw, list) else None),
                "genres": [
                    {"id": g.get("id") or i, "name": g.get("name") or str(g)}
                    for i, g in enumerate(sm_genres or [])
                    if isinstance(g, dict) and (g.get("name") or g)
                ]
                if sm_genres is not None
                else None,
                "languages": sm_langs,
                "country": sm_country,
                "activity_periods": _activity_periods(
                    None,
                    None,
                    None,
                    {"activity_periods": sm_periods}
                    if isinstance(sm_periods, list)
                    else None,
                )
                if isinstance(sm_periods, list)
                else None,
            }

    index = _ensure_franchise_index(root)
    related = related_for_path(index, folder_path)
    # Exclude this franchise hub from series bucket for related tab
    related_series = [
        e
        for e in related.get("series", [])
        if (e.get("path") or "").casefold().rstrip("/")
        != folder_path.casefold().rstrip("/")
    ]

    music_band = _find_music_band(db, name)
    gallery = build_series_gallery(folder_path, root)
    has_gallery = bool(gallery.get("items"))

    from app.series_audio import scan_series_audio

    series_audio = scan_series_audio(db, franchise_id)
    has_series_audio = bool(series_audio.get("releases"))

    media_flags = {
        "has_audio": music_band is not None or has_series_audio,
        "has_series": bool(detail.get("subseries") or detail.get("seasons")),
        "has_movies": bool(related.get("movies")),
        "has_library": bool(related.get("books")),
        "has_games": bool(related.get("games")),
        "has_gallery": has_gallery or bool(local_eras),
    }

    subseries_cards = []
    from app.series_paths import find_badge_file

    for s in detail.get("subseries") or []:
        sub_path = (s.get("folder_path") or "").replace("\\", "/")
        sub_dir = root / sub_path if sub_path else None
        logo_url = None
        icon_url = None
        badge_url = None
        if sub_dir and sub_dir.is_dir():
            logo_url, icon_url = _list_brand_assets(sub_dir, root)
            badge_url = find_badge_file(sub_dir, root)
        subseries_cards.append(
            {
                "id": s["id"],
                "title": s["title"],
                "date_iso": s.get("date_iso"),
                "display_date": s.get("display_date"),
                "cover_url": s.get("cover_url") or detail.get("cover_url"),
                "logo_url": logo_url,
                "icon_url": icon_url,
                "badge_url": badge_url,
                "folder_path": s.get("folder_path"),
                "season_count": s.get("season_count") or 0,
                "has_gallery": s.get("has_gallery"),
            }
        )

    related_stored = images.get("related") if isinstance(images.get("related"), dict) else {}

    def _visible_related(bucket: str) -> list:
        items = related_stored.get(bucket) or []
        return [
            x
            for x in items
            if isinstance(x, dict) and not x.get("hidden")
        ]

    creator_cards = _visible_related("creator")
    similar_cards = _visible_related("similar")

    writers = _split_semi(row.ser_writers)
    publishers = _split_semi(row.ser_publishers)
    activity_periods = _activity_periods(
        row.ser_starting_date,
        row.ser_ending_date,
        row.ser_status,
        images if isinstance(images, dict) else None,
    )
    # Standalone / unscanned shows: use earliest disk season date when DB empty.
    if not activity_periods and detail.get("date_iso"):
        activity_periods = _activity_periods(
            detail.get("date_iso"),
            None,
            row.ser_status,
            None,
        )

    # Franchise About fields roll up from per-subseries overrides when present
    if subseries_meta and subseries_cards:
        base_genres = list(genres)
        base_writers = list(writers)
        base_pubs = list(publishers)
        base_langs = list(selected_langs)
        base_country = country
        base_periods = list(activity_periods)

        agg_genres: list[dict] = []
        seen_g: set[str] = set()
        agg_writers: list[str] = []
        seen_w: set[str] = set()
        agg_pubs: list[str] = []
        seen_p: set[str] = set()
        agg_langs: list[str] = []
        seen_l: set[str] = set()
        period_starts: list[str] = []
        period_ends: list[str] = []
        agg_country = None

        for card in subseries_cards:
            sid = str(card.get("id") or "")
            meta = subseries_meta.get(sid) or {}
            g_list = (
                meta["genres"]
                if meta.get("genres") is not None
                else base_genres
            )
            for g in g_list or []:
                if not isinstance(g, dict):
                    continue
                gname = (g.get("name") or "").strip()
                key = gname.casefold()
                if not key or key in seen_g:
                    continue
                seen_g.add(key)
                agg_genres.append(g)
            w_list = (
                meta["writers"]
                if meta.get("writers") is not None
                else base_writers
            )
            for w in w_list or []:
                wname = str(w).strip()
                key = wname.casefold()
                if not key or key in seen_w:
                    continue
                seen_w.add(key)
                agg_writers.append(wname)
            p_list = (
                meta["publishers"]
                if meta.get("publishers") is not None
                else base_pubs
            )
            for p in p_list or []:
                pname = str(p).strip()
                key = pname.casefold()
                if not key or key in seen_p:
                    continue
                seen_p.add(key)
                agg_pubs.append(pname)
            l_list = (
                meta["languages"]
                if meta.get("languages") is not None
                else base_langs
            )
            for code in l_list or []:
                c = str(code).strip()
                if not c or c in seen_l:
                    continue
                seen_l.add(c)
                agg_langs.append(c)
            ctry = meta.get("country") if meta.get("country") is not None else base_country
            if agg_country is None and ctry:
                agg_country = ctry
            periods = (
                meta["activity_periods"]
                if meta.get("activity_periods") is not None
                else base_periods
            )
            for p in periods or []:
                if not isinstance(p, dict):
                    continue
                if p.get("start"):
                    period_starts.append(str(p["start"]))
                if p.get("end"):
                    period_ends.append(str(p["end"]))

        if agg_genres:
            genres = agg_genres
        if agg_writers:
            writers = agg_writers
        if agg_pubs:
            publishers = agg_pubs
        if agg_langs:
            selected_langs = agg_langs
        if agg_country is not None:
            country = agg_country
        if period_starts:
            first_start = min(period_starts)
            last_end = max(period_ends) if period_ends else None
            activity_periods = _activity_periods(
                first_start,
                last_end,
                None,
                {
                    "activity_periods": [
                        {"start": first_start, "end": last_end}
                    ]
                },
            )

    from app.language_logos import resolve_language_logos

    child_dirs: list = []
    for s in detail.get("subseries") or []:
        fp = (s.get("folder_path") or "").replace("\\", "/")
        if fp:
            child_dirs.append(root / fp)
    child_dirs.sort(key=lambda p: p.name.casefold())

    lang_logos = resolve_language_logos(
        franchise_dir,
        root,
        listed_languages=list(selected_langs or []),
        child_folders=child_dirs,
        child_default_only=True,
    )
    logo_url = lang_logos.get("logo_url") or logo_url
    if local_eras and logo_url:
        local_eras[0] = {
            **local_eras[0],
            "logo_url": logo_url,
        }

    from app.universes import (
        filter_similar_against_universe,
        franchise_universe_bundle,
    )

    universes, universe, universe_cards, merged_universe_cards, universe_groups = (
        franchise_universe_bundle(db, "series", detail.get("id") or franchise_id)
    )
    similar_cards = filter_similar_against_universe(
        db, "series", detail.get("id") or franchise_id, similar_cards
    )
    # Always expose merged cards (tagged with universe_id) so multi-universe
    # Related tabs can filter client-side without a second fetch.
    display_cards = merged_universe_cards or universe_cards

    return {
        "id": detail["id"],
        "ser_id": row.ser_id,
        "name": name,
        "letter": letter,
        "slug": detail.get("slug"),
        "folder_path": folder_path,
        "cover_url": detail.get("cover_url") or row.ser_poster_url,
        "bio": row.ser_bio,
        "bio_manual": bool(row.ser_bio_manual),
        "writers": writers,
        "aliases": _split_semi(row.ser_other_names),
        "city": None,
        "country": country,
        "languages": selected_langs,
        "origin_language": origin_lang,
        "language_options": language_options,
        "cast_languages": cast_languages,
        "activity_periods": activity_periods,
        "genres": genres,
        "publishers": publishers,
        "status": row.ser_status,
        "type": row.ser_type,
        "is_animated": bool(row.ser_is_animated),
        "tmdb_id": row.ser_code,
        "eras": local_eras,
        "logo_url": logo_url,
        "icon_url": icon_url,
        "logo_by_language": lang_logos.get("logo_by_language") or {},
        "logos_switchable": bool(lang_logos.get("logos_switchable")),
        "cast": cast,
        "links": links_payload,
        "subseries": subseries_cards,
        "subseries_meta": subseries_meta,
        "seasons": detail.get("seasons") or [],
        "media": media_flags,
        "music_band_id": music_band.bnd_id if music_band else None,
        "related": {
            "movies": _enrich_related_cards(related.get("movies") or [], root),
            "series": _enrich_related_cards(related_series, root),
            "books": _enrich_related_cards(related.get("books") or [], root),
            "games": _enrich_related_cards(related.get("games") or [], root),
            "music": related.get("music") or [],
            "creator": creator_cards,
            "similar": similar_cards,
            "creator_count": len(creator_cards),
            "similar_count": len(similar_cards),
            "universe": display_cards,
            "universe_count": len(display_cards),
            "universe_groups": [
                {"id": g["id"], "name": g["name"], "count": g["count"]}
                for g in universe_groups
            ],
        },
        "universe": universe,
        "universes": universes,
        "metadata_refreshed_at": row.ser_metadata_refreshed_at,
        "needs_metadata": not bool(row.ser_metadata_refreshed_at),
    }
