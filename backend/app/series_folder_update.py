"""Additive Series season folders from TMDb (create missing only; never overwrite)."""
from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.catalog_import import _date_prefix
from app.config import settings
from app.crud import get_tmdb_key
from app.folder_icons import decorate_folder, ensure_relative_tree
from app.franchise_index import DATE_PREFIX_RE, build_franchise_index, save_franchise_index
from app.series_index import _is_season_folder, find_franchise_dir
from app.series_paths import find_episodes_root
from app.series_refresh import ensure_series_row, find_series_row
from app.services.tmdb import fetch_tv, search_tv_id

_SEASON_NUM_RE = re.compile(r"^season\s+(\d+)\b", re.I)


def _media_root() -> Path:
    root = Path(settings.media_root or "")
    if not root.is_dir():
        raise ValueError("Media root is not configured or missing")
    return root


def _season_number_from_folder(name: str) -> int | None:
    low = (name or "").casefold().strip()
    if low == "specials":
        return 0
    rest = name.strip()
    # DATE_PREFIX_RE captures the title in group 4 (full match spans the name).
    m = DATE_PREFIX_RE.match(rest)
    if m:
        rest = (m.group(4) or "").strip()
    m2 = _SEASON_NUM_RE.match(rest)
    if m2:
        return int(m2.group(1))
    return None


def _existing_season_numbers(show_dir: Path) -> set[int]:
    found: set[int] = set()
    episodes = find_episodes_root(show_dir)
    roots = [episodes]
    if episodes != show_dir:
        roots.append(show_dir)
    skip = {
        "episodes",
        "videos",
        "gallery",
        "audio",
        "extras",
        "[artwork]",
        "artwork",
    }
    for root in roots:
        try:
            children = list(root.iterdir())
        except OSError:
            continue
        for child in children:
            if not child.is_dir():
                continue
            if child.name.casefold() in skip:
                continue
            num = _season_number_from_folder(child.name)
            if num is not None:
                found.add(num)
            elif _is_season_folder(child.name):
                # e.g. undated "Season One" — still counts as occupied for skip logic
                # via title match below when creating.
                pass
    return found


def _list_show_targets(
    franchise_dir: Path,
    *,
    subseries_id: str | None = None,
) -> list[Path]:
    """Show folders that own seasons: one leaf, or franchise + each subseries hub."""
    from app.series_index import _list_subseries, _resolve_media_root

    root = _resolve_media_root()
    if subseries_id:
        want = (subseries_id or "").casefold().strip()
        for child in franchise_dir.iterdir():
            if not child.is_dir():
                continue
            from app.franchise_index import normalize_franchise_slug

            slug = normalize_franchise_slug(child.name) or child.name.casefold()
            if (
                child.name.casefold() == want
                or slug == want
                or slug.casefold() == want
            ):
                return [child]
        # Dated leaf id may be path-based — match folder_path suffix / name.
        for child in franchise_dir.iterdir():
            if child.is_dir() and want in child.name.casefold():
                return [child]
        raise ValueError(f"Subseries not found: {subseries_id}")

    subs = _list_subseries(franchise_dir, root)
    if subs:
        targets: list[Path] = []
        for card in subs:
            rel = (card.get("folder_path") or "").replace("\\", "/").strip("/")
            if not rel:
                continue
            path = root / rel
            if path.is_dir():
                targets.append(path)
        if targets:
            return targets

    return [franchise_dir]


async def _resolve_tmdb_id(
    db: Session,
    *,
    api_key: str,
    show_dir: Path,
    franchise_name: str,
) -> tuple[str | None, str | None]:
    """Return (tmdb_id, matched_name). Prefer DB code when folder is the franchise."""
    title = show_dir.name
    if title.casefold() == franchise_name.casefold():
        row = find_series_row(db, franchise_name) or ensure_series_row(
            db, franchise_name
        )
        if row.ser_code and str(row.ser_code).strip():
            return str(row.ser_code).strip(), row.ser_name or title
    tid, tname = await search_tv_id(title, api_key)
    if tid:
        return str(tid), tname or title
    if title.casefold() != franchise_name.casefold():
        tid, tname = await search_tv_id(franchise_name, api_key)
        if tid:
            return str(tid), tname or franchise_name
    return None, None


async def update_series_seasons_from_tmdb(
    db: Session,
    franchise_id: str,
    *,
    subseries_id: str | None = None,
) -> dict:
    """
    Create missing Season N / Specials folders under the show (or each subseries).
    Never renames or deletes existing folders; never downloads episode media.
    """
    api_key = get_tmdb_key(db)
    if not api_key:
        return {"ok": False, "error": "TMDb API key is not configured"}

    found = find_franchise_dir(franchise_id)
    if not found:
        return {"ok": False, "error": "Series franchise not found"}
    franchise_dir, _letter = found
    franchise_name = franchise_dir.name

    try:
        targets = _list_show_targets(franchise_dir, subseries_id=subseries_id)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}

    created: list[str] = []
    skipped: list[str] = []
    errors: list[str] = []
    media_root = _media_root()

    for show_dir in targets:
        try:
            tmdb_id, matched = await _resolve_tmdb_id(
                db,
                api_key=api_key,
                show_dir=show_dir,
                franchise_name=franchise_name,
            )
        except Exception as exc:
            errors.append(f"{show_dir.name}: TMDb lookup failed ({exc})")
            continue
        if not tmdb_id:
            errors.append(f"{show_dir.name}: no TMDb match")
            continue

        # Persist franchise TMDb id when updating the franchise root.
        if show_dir.resolve() == franchise_dir.resolve():
            row = ensure_series_row(db, franchise_name)
            if not row.ser_code:
                row.ser_code = str(tmdb_id)
                if matched and not row.ser_name:
                    row.ser_name = matched
                db.commit()

        try:
            tv = await fetch_tv(
                tmdb_id,
                api_key,
                append="",  # seasons list is on the base payload
            )
        except Exception as exc:
            errors.append(f"{show_dir.name}: TMDb fetch failed ({exc})")
            continue

        existing = _existing_season_numbers(show_dir)
        # Ensure Episodes/ exists when we will add numbered seasons.
        seasons_payload = tv.get("seasons") or []
        for season in seasons_payload:
            try:
                number = int(season.get("season_number"))
            except (TypeError, ValueError):
                continue
            if number < 0:
                continue
            if number in existing:
                label = "Specials" if number == 0 else f"Season {number}"
                skipped.append(f"{show_dir.name}/{label}")
                continue

            air_date = season.get("air_date")
            if number == 0:
                rel = "Specials"
                ensure_relative_tree(show_dir, rel)
                path = show_dir / "Specials"
            else:
                season_name = f"{_date_prefix(air_date)}Season {number}"
                rel = f"Episodes/{season_name}"
                ensure_relative_tree(show_dir, rel)
                path = show_dir / "Episodes" / season_name

            try:
                decorate_folder(path)
                decorate_folder(show_dir)
            except Exception:
                pass
            created.append(path.relative_to(media_root).as_posix())
            existing.add(number)

    try:
        save_franchise_index(build_franchise_index(media_root))
    except Exception:
        pass

    return {
        "ok": True,
        "franchise": franchise_name,
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "created_count": len(created),
        "skipped_count": len(skipped),
    }
