"""Remote (URL) playables for gallery-only / hybrid Series, Movies, and Books leaves.

Disk folder = catalog identity. DB rows = link seasons/episodes/movie URLs/volumes.
Local files win on collision; DB fills gaps.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.media_index import format_display_date
from app.models import RemoteMediaEpisode, RemoteMediaLink, RemoteMediaSeason

MODULE_SERIES = "series"
MODULE_MOVIES = "movies"
MODULE_BOOKS = "books"

ROLE_MOVIE = "movie"
ROLE_TRAILER = "trailer"
ROLE_EXTRA = "extra"

_TITLE_COLLAPSE_RE = re.compile(r"[^a-z0-9]+")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_folder_path(path: str | None) -> str:
    return (path or "").replace("\\", "/").strip("/")


def _title_key(title: str | None) -> str:
    return _TITLE_COLLAPSE_RE.sub("", (title or "").casefold())


def _episode_id(folder_path: str, season_key: str, number: int | None, title: str) -> str:
    raw = f"{folder_path}|{season_key}|{number}|{title}".casefold()
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
    return f"rep_{digest}"


def _volume_id(folder_path: str, number: int | None, title: str) -> str:
    raw = f"{folder_path}|vol|{number}|{title}".casefold()
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
    return f"rvol_{digest}"


def _link_id(folder_path: str, role: str, title: str, url: str) -> str:
    raw = f"{folder_path}|{role}|{title}|{url}".casefold()
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
    return f"rlnk_{digest}"


def _season_key_from_row(row: RemoteMediaSeason) -> str:
    return f"rms_{row.rms_id}"


def _normalize_date_iso(raw: str | None) -> str | None:
    value = (raw or "").strip()
    if not value:
        return None
    if len(value) == 4 and value.isdigit():
        return f"{value}-01-01"
    if len(value) >= 10 and value[4] == "-" and value[7] == "-":
        return value[:10]
    # Accept YYYY.MM.DD
    m = re.match(r"^(\d{4})\.(\d{2})\.(\d{2})", value)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return value


# ── load ─────────────────────────────────────────────────────────────────────


def list_remote_seasons(db: Session, folder_path: str) -> list[dict]:
    path = normalize_folder_path(folder_path)
    rows = db.scalars(
        select(RemoteMediaSeason)
        .where(
            RemoteMediaSeason.rms_module == MODULE_SERIES,
            RemoteMediaSeason.rms_folder_path == path,
        )
        .order_by(
            RemoteMediaSeason.rms_sort_order,
            RemoteMediaSeason.rms_date_iso,
            RemoteMediaSeason.rms_id,
        )
    ).all()
    out: list[dict] = []
    for row in rows:
        key = _season_key_from_row(row)
        out.append(
            {
                "id": key,
                "db_id": row.rms_id,
                "title": row.rms_title or "",
                "date_iso": row.rms_date_iso,
                "display_date": format_display_date(row.rms_date_iso),
                "is_specials": bool(row.rms_is_specials),
                "sort_order": row.rms_sort_order or 0,
                "source": "remote",
                "folder_path": None,
                "episode_count": 0,
                "cover_url": None,
            }
        )
    return out


def list_remote_episodes(db: Session, folder_path: str, season_db_id: int) -> list[dict]:
    path = normalize_folder_path(folder_path)
    rows = db.scalars(
        select(RemoteMediaEpisode)
        .where(
            RemoteMediaEpisode.rme_module == MODULE_SERIES,
            RemoteMediaEpisode.rme_folder_path == path,
            RemoteMediaEpisode.rme_season_id == season_db_id,
        )
        .order_by(
            RemoteMediaEpisode.rme_sort_order,
            RemoteMediaEpisode.rme_number,
            RemoteMediaEpisode.rme_id,
        )
    ).all()
    season_key = f"rms_{season_db_id}"
    out: list[dict] = []
    for row in rows:
        title = row.rme_title or ""
        number = row.rme_number
        out.append(
            {
                "id": _episode_id(path, season_key, number, title),
                "db_id": row.rme_id,
                "number": number,
                "title": title,
                "date_iso": row.rme_date_iso,
                "display_date": format_display_date(row.rme_date_iso),
                "open_url": (row.rme_url or "").strip() or None,
                "open_mode": "tab",
                "play_path": None,
                "duration": None,
                "duration_sec": None,
                "source": "remote",
                "hover_label": "Watch episode",
            }
        )
    return out


def list_remote_movie_links(db: Session, folder_path: str) -> list[dict]:
    path = normalize_folder_path(folder_path)
    rows = db.scalars(
        select(RemoteMediaLink)
        .where(
            RemoteMediaLink.rml_module == MODULE_MOVIES,
            RemoteMediaLink.rml_folder_path == path,
        )
        .order_by(RemoteMediaLink.rml_sort_order, RemoteMediaLink.rml_id)
    ).all()
    out: list[dict] = []
    for row in rows:
        role = (row.rml_role or ROLE_EXTRA).casefold()
        title = row.rml_title or ""
        url = (row.rml_url or "").strip()
        out.append(
            {
                "id": _link_id(path, role, title, url),
                "db_id": row.rml_id,
                "role": role,
                "title": title,
                "label": title,
                "url": url,
                "open_url": url or None,
                "open_mode": "tab",
                "sort_order": row.rml_sort_order or 0,
                "source": "remote",
            }
        )
    return out


def list_remote_book_volumes(db: Session, folder_path: str) -> list[dict]:
    path = normalize_folder_path(folder_path)
    rows = db.scalars(
        select(RemoteMediaLink)
        .where(
            RemoteMediaLink.rml_module == MODULE_BOOKS,
            RemoteMediaLink.rml_folder_path == path,
        )
        .order_by(RemoteMediaLink.rml_sort_order, RemoteMediaLink.rml_id)
    ).all()
    out: list[dict] = []
    for row in rows:
        title = row.rml_title or ""
        number = row.rml_number
        url = (row.rml_url or "").strip()
        date_iso = row.rml_date_iso
        out.append(
            {
                "id": _volume_id(path, number, title),
                "db_id": row.rml_id,
                "label": title,
                "title": title,
                "number": number,
                "date_iso": date_iso,
                "display_date": format_display_date(date_iso),
                "open_url": url or None,
                "file_url": url or None,
                "open_mode": "tab",
                "open_label": "Read",
                "play_path": None,
                "page_count": None,
                "pages": None,
                "source": "remote",
                "hover_label": "Read",
                "sort_order": row.rml_sort_order or 0,
            }
        )
    return out


def has_remote_series_content(db: Session, folder_path: str) -> bool:
    path = normalize_folder_path(folder_path)
    return (
        db.scalars(
            select(RemoteMediaSeason.rms_id)
            .where(
                RemoteMediaSeason.rms_module == MODULE_SERIES,
                RemoteMediaSeason.rms_folder_path == path,
            )
            .limit(1)
        ).first()
        is not None
    )


# ── merge ─────────────────────────────────────────────────────────────────────


def merge_series_seasons_and_episodes(
    local_seasons: list[dict],
    db: Session,
    folder_path: str,
    list_local_episodes: Callable[[dict], list[dict]],
) -> list[dict]:
    """Season cards with merged ``episodes`` (local wins on collision)."""
    path = normalize_folder_path(folder_path)
    remote_seasons = list_remote_seasons(db, path)
    remote_by_title = {
        _title_key(r.get("title")): r
        for r in remote_seasons
        if _title_key(r.get("title"))
    }
    consumed_remote: set[str] = set()
    merged: list[dict] = []

    for local in local_seasons:
        season = dict(local)
        local_eps = list(list_local_episodes(local) or [])
        for ep in local_eps:
            ep.setdefault("source", "local")
        title_k = _title_key(local.get("title") or local.get("id"))
        remote_match = remote_by_title.get(title_k)
        remote_eps: list[dict] = []
        if remote_match and remote_match.get("db_id") is not None:
            remote_eps = list_remote_episodes(db, path, int(remote_match["db_id"]))
            consumed_remote.add(title_k)
        season["episodes"] = _merge_episode_lists(local_eps, remote_eps)
        season["episode_count"] = len(season["episodes"])
        season["has_remote"] = bool(remote_eps)
        merged.append(season)

    for remote in remote_seasons:
        title_k = _title_key(remote.get("title"))
        if not title_k or title_k in consumed_remote:
            continue
        db_id = remote.get("db_id")
        eps = list_remote_episodes(db, path, int(db_id)) if db_id is not None else []
        merged.append(
            {
                **remote,
                "episodes": eps,
                "episode_count": len(eps),
                "has_remote": True,
            }
        )

    merged.sort(
        key=lambda s: (
            s.get("date_iso") or "9999",
            s.get("sort_order") if s.get("sort_order") is not None else 0,
            (s.get("title") or "").casefold(),
        )
    )
    return merged


def _merge_episode_lists(local_eps: list[dict], remote_eps: list[dict]) -> list[dict]:
    taken_numbers: set[int] = set()
    taken_titles: set[str] = set()
    out: list[dict] = []
    for ep in local_eps:
        num = ep.get("number")
        if isinstance(num, int):
            taken_numbers.add(num)
        tk = _title_key(ep.get("title"))
        if tk:
            taken_titles.add(tk)
        out.append(ep)
    for ep in remote_eps:
        num = ep.get("number")
        tk = _title_key(ep.get("title"))
        if isinstance(num, int) and num in taken_numbers:
            continue
        if tk and tk in taken_titles:
            continue
        out.append(ep)
    out.sort(
        key=lambda e: (
            e.get("number") is None,
            e.get("number") if e.get("number") is not None else 10**9,
            (e.get("title") or "").casefold(),
        )
    )
    return out


def merge_movie_playables(
    *,
    local_open_url: str | None,
    local_has_video: bool,
    versions: list[dict],
    existing_trailer_url: str | None,
    remote_links: list[dict],
) -> dict[str, Any]:
    movie_remote = next(
        (r for r in remote_links if r.get("role") == ROLE_MOVIE and r.get("open_url")),
        None,
    )
    trailer_remote = next(
        (r for r in remote_links if r.get("role") == ROLE_TRAILER and r.get("open_url")),
        None,
    )
    extras = [
        {
            "id": r["id"],
            "title": r.get("title") or r.get("label") or "Extra",
            "label": r.get("title") or r.get("label") or "Extra",
            "open_url": r.get("open_url"),
            "open_mode": "tab",
            "source": "remote",
        }
        for r in remote_links
        if r.get("role") == ROLE_EXTRA and r.get("open_url")
    ]

    open_url = local_open_url
    open_mode = "local" if local_has_video and local_open_url else None
    if not open_url and movie_remote:
        open_url = movie_remote.get("open_url")
        open_mode = "tab"

    trailer = (existing_trailer_url or "").strip() or None
    if not trailer and trailer_remote:
        trailer = trailer_remote.get("open_url")

    return {
        "open_url": open_url,
        "open_mode": open_mode,
        "open_label": "Play video" if open_url else None,
        "trailer_url": trailer,
        "extras": extras,
        "has_video": bool(local_has_video or open_url),
        "versions": versions,
    }


def merge_book_volumes(local_volumes: list[dict], remote_volumes: list[dict]) -> list[dict]:
    taken_numbers: set[int] = set()
    taken_titles: set[str] = set()
    out: list[dict] = []
    for v in local_volumes:
        item = dict(v)
        item.setdefault("source", "local")
        num = item.get("number")
        if isinstance(num, int):
            taken_numbers.add(num)
        tk = _title_key(item.get("label") or item.get("title"))
        if tk:
            taken_titles.add(tk)
        out.append(item)
    for v in remote_volumes:
        num = v.get("number")
        tk = _title_key(v.get("label") or v.get("title"))
        if isinstance(num, int) and num in taken_numbers:
            continue
        if tk and tk in taken_titles:
            continue
        out.append(v)
    out.sort(
        key=lambda v: (
            v.get("date_iso") or "9999",
            v.get("number") is None,
            v.get("number") if v.get("number") is not None else 10**9,
            (v.get("label") or v.get("title") or "").casefold(),
        )
    )
    return out


# ── save ──────────────────────────────────────────────────────────────────────


def save_series_remote(
    db: Session,
    folder_path: str,
    seasons_payload: list[dict],
) -> dict:
    path = normalize_folder_path(folder_path)
    if not path:
        raise ValueError("folder_path required")

    old_seasons = db.scalars(
        select(RemoteMediaSeason).where(
            RemoteMediaSeason.rms_module == MODULE_SERIES,
            RemoteMediaSeason.rms_folder_path == path,
        )
    ).all()
    old_ids = [s.rms_id for s in old_seasons]
    if old_ids:
        for ep in db.scalars(
            select(RemoteMediaEpisode).where(
                RemoteMediaEpisode.rme_module == MODULE_SERIES,
                RemoteMediaEpisode.rme_folder_path == path,
                RemoteMediaEpisode.rme_season_id.in_(old_ids),
            )
        ).all():
            db.delete(ep)
    for s in old_seasons:
        db.delete(s)
    db.flush()

    saved_seasons: list[dict] = []
    for s_idx, season in enumerate(seasons_payload or []):
        title = (season.get("title") or "").strip()
        if not title:
            continue
        date_iso = _normalize_date_iso(season.get("date_iso"))
        if not date_iso:
            raise ValueError(f'Season "{title}" requires a date')
        is_specials = bool(season.get("is_specials")) or title.casefold() == "specials"
        sort_order = season.get("sort_order")
        if sort_order is None:
            sort_order = s_idx
        row = RemoteMediaSeason(
            rms_module=MODULE_SERIES,
            rms_folder_path=path,
            rms_title=title,
            rms_date_iso=date_iso,
            rms_is_specials=1 if is_specials else 0,
            rms_sort_order=int(sort_order),
            rms_updated_at=_now(),
        )
        db.add(row)
        db.flush()

        episodes_out: list[dict] = []
        ep_number = 0
        for ep in season.get("episodes") or []:
            ep_title = (ep.get("title") or "").strip()
            ep_url = (ep.get("url") or ep.get("open_url") or "").strip()
            if not ep_title or not ep_url:
                continue
            ep_number += 1
            number = ep.get("number")
            if number is None:
                number = ep_number
            else:
                try:
                    number = int(number)
                except (TypeError, ValueError):
                    number = ep_number
            ep_date = _normalize_date_iso(ep.get("date_iso"))
            ep_row = RemoteMediaEpisode(
                rme_module=MODULE_SERIES,
                rme_folder_path=path,
                rme_season_id=row.rms_id,
                rme_number=number,
                rme_title=ep_title,
                rme_date_iso=ep_date,
                rme_url=ep_url,
                rme_sort_order=int(ep.get("sort_order") if ep.get("sort_order") is not None else ep_number - 1),
                rme_updated_at=_now(),
            )
            db.add(ep_row)
            db.flush()
            episodes_out.append(
                {
                    "db_id": ep_row.rme_id,
                    "number": number,
                    "title": ep_title,
                    "date_iso": ep_date,
                    "url": ep_url,
                }
            )

        saved_seasons.append(
            {
                "db_id": row.rms_id,
                "id": _season_key_from_row(row),
                "title": title,
                "date_iso": date_iso,
                "is_specials": is_specials,
                "episodes": episodes_out,
            }
        )

    db.commit()
    return {"folder_path": path, "seasons": saved_seasons}


def save_movie_remote_links(
    db: Session,
    folder_path: str,
    links_payload: list[dict],
) -> dict:
    path = normalize_folder_path(folder_path)
    if not path:
        raise ValueError("folder_path required")

    for row in db.scalars(
        select(RemoteMediaLink).where(
            RemoteMediaLink.rml_module == MODULE_MOVIES,
            RemoteMediaLink.rml_folder_path == path,
        )
    ).all():
        db.delete(row)
    db.flush()

    saved: list[dict] = []
    trailer_count = 0
    for idx, link in enumerate(links_payload or []):
        role = (link.get("role") or ROLE_EXTRA).casefold()
        if role not in {ROLE_MOVIE, ROLE_TRAILER, ROLE_EXTRA}:
            role = ROLE_EXTRA
        title = (link.get("title") or link.get("label") or "").strip()
        url = (link.get("url") or link.get("open_url") or "").strip()
        if not url:
            continue
        if role == ROLE_TRAILER:
            trailer_count += 1
            if trailer_count > 1:
                continue
            title = title or "Trailer"
        if role == ROLE_MOVIE:
            title = title or "Movie"
        if not title:
            title = "Extra"
        sort_order = link.get("sort_order")
        if sort_order is None:
            sort_order = idx
        row = RemoteMediaLink(
            rml_module=MODULE_MOVIES,
            rml_folder_path=path,
            rml_role=role,
            rml_title=title,
            rml_url=url,
            rml_number=None,
            rml_date_iso=None,
            rml_sort_order=int(sort_order),
            rml_updated_at=_now(),
        )
        db.add(row)
        db.flush()
        saved.append(
            {
                "db_id": row.rml_id,
                "role": role,
                "title": title,
                "url": url,
            }
        )

    db.commit()
    return {"folder_path": path, "links": saved}


def save_book_remote_volumes(
    db: Session,
    folder_path: str,
    volumes_payload: list[dict],
) -> dict:
    path = normalize_folder_path(folder_path)
    if not path:
        raise ValueError("folder_path required")

    for row in db.scalars(
        select(RemoteMediaLink).where(
            RemoteMediaLink.rml_module == MODULE_BOOKS,
            RemoteMediaLink.rml_folder_path == path,
        )
    ).all():
        db.delete(row)
    db.flush()

    saved: list[dict] = []
    auto_num = 0
    for idx, vol in enumerate(volumes_payload or []):
        title = (vol.get("title") or vol.get("label") or "").strip()
        url = (vol.get("url") or vol.get("open_url") or "").strip()
        if not title or not url:
            continue
        auto_num += 1
        number = vol.get("number")
        if number is None:
            number = auto_num
        else:
            try:
                number = int(number)
            except (TypeError, ValueError):
                number = auto_num
        date_iso = _normalize_date_iso(vol.get("date_iso"))
        sort_order = vol.get("sort_order")
        if sort_order is None:
            sort_order = idx
        row = RemoteMediaLink(
            rml_module=MODULE_BOOKS,
            rml_folder_path=path,
            rml_role="volume",
            rml_title=title,
            rml_url=url,
            rml_number=number,
            rml_date_iso=date_iso,
            rml_sort_order=int(sort_order),
            rml_updated_at=_now(),
        )
        db.add(row)
        db.flush()
        saved.append(
            {
                "db_id": row.rml_id,
                "number": number,
                "title": title,
                "date_iso": date_iso,
                "url": url,
            }
        )

    db.commit()
    return {"folder_path": path, "volumes": saved}


def get_series_remote_payload(db: Session, folder_path: str) -> dict:
    path = normalize_folder_path(folder_path)
    seasons = list_remote_seasons(db, path)
    out_seasons = []
    for s in seasons:
        db_id = s.get("db_id")
        eps = list_remote_episodes(db, path, int(db_id)) if db_id is not None else []
        out_seasons.append(
            {
                **s,
                "episodes": [
                    {
                        "db_id": e.get("db_id"),
                        "number": e.get("number"),
                        "title": e.get("title"),
                        "date_iso": e.get("date_iso"),
                        "url": e.get("open_url"),
                    }
                    for e in eps
                ],
            }
        )
    return {"folder_path": path, "seasons": out_seasons}


def get_movie_remote_payload(db: Session, folder_path: str) -> dict:
    path = normalize_folder_path(folder_path)
    links = list_remote_movie_links(db, path)
    return {
        "folder_path": path,
        "links": [
            {
                "db_id": l.get("db_id"),
                "role": l.get("role"),
                "title": l.get("title"),
                "url": l.get("url"),
                "sort_order": l.get("sort_order"),
            }
            for l in links
        ],
    }


def get_book_remote_payload(db: Session, folder_path: str) -> dict:
    path = normalize_folder_path(folder_path)
    volumes = list_remote_book_volumes(db, path)
    return {
        "folder_path": path,
        "volumes": [
            {
                "db_id": v.get("db_id"),
                "number": v.get("number"),
                "title": v.get("title") or v.get("label"),
                "date_iso": v.get("date_iso"),
                "url": v.get("open_url"),
                "sort_order": v.get("sort_order"),
            }
            for v in volumes
        ],
    }
