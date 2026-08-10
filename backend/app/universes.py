"""Shared universes across Movies and Series franchises."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.franchise_index import normalize_franchise_slug
from app.gallery import IMAGE_EXTS, _media_url
from app.models import Universe, UniverseFranchiseSync, UniverseMember

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


def _universe_art_dirs(media_root: Path | None = None) -> list[Path]:
    """Candidate folders for universe artwork."""
    dirs: list[Path] = []
    root = media_root or _media_root()
    if root:
        dirs.append(root / "Universes")
        dirs.append(root / "universes")
        dirs.append(root / "assets" / "universes")
        dirs.append(root / "Assets" / "Universes")
    # Project assets (repo-local), if present
    try:
        from app.paths import PROJECT_ROOT

        dirs.append(PROJECT_ROOT / "assets" / "universes")
        dirs.append(PROJECT_ROOT / "Assets" / "Universes")
        dirs.append(PROJECT_ROOT / "data" / "assets" / "universes")
    except Exception:
        pass
    out: list[Path] = []
    seen: set[str] = set()
    for d in dirs:
        key = str(d).casefold()
        if key in seen:
            continue
        seen.add(key)
        if d.is_dir():
            out.append(d)
    return out


def _art_file(universe_name: str, kind: str, media_root: Path | None = None) -> Path | None:
    """Resolve art file for a universe.

    Accepts legacy `{Name} - {Kind}.*` and newer `universe_{kind}.*` /
    `{slug}_{kind}.*` stems under Media/Universes or assets/universes.
    """
    folders = _universe_art_dirs(media_root)
    if not folders:
        return None
    kind_l = (kind or "").casefold().strip()
    name = (universe_name or "").strip()
    slug = _slugify(name)
    stems = {
        f"{name} - {kind}".casefold(),
        f"universe_{kind_l}",
        f"{slug}_{kind_l}",
        f"{slug}-{kind_l}",
        f"{name.casefold()}_{kind_l}",
    }
    try:
        for folder in folders:
            for p in folder.iterdir():
                if not p.is_file() or p.suffix.lower() not in IMAGE_EXTS:
                    continue
                if p.stem.casefold() in stems:
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
    name = universe.uni_name
    for kind, key in (
        ("Portrait", "portrait_url"),
        ("Landscape", "landscape_url"),
        ("Banner", "banner_url"),
        ("Logo", "logo_url"),
    ):
        f = _art_file(name, kind, root)
        if f:
            under_media = False
            if root:
                try:
                    f.resolve().relative_to(root.resolve())
                    under_media = True
                except ValueError:
                    under_media = False
            out[key] = _media_url(f, root) if under_media and root else _file_url(f)
    out["cover_url"] = (
        out["portrait_url"] or out["landscape_url"] or out["banner_url"] or out["logo_url"]
    )
    return out


def _file_url(path: Path) -> str | None:
    """Serve project-local art via /api/assets when outside media root."""
    try:
        from app.paths import PROJECT_ROOT

        resolved = path.resolve()
        assets_root = (PROJECT_ROOT / "assets").resolve()
        try:
            # Prefer /api/assets/universes/... (assets router roots at assets/)
            rel = resolved.relative_to(assets_root)
            return f"/api/assets/{rel.as_posix()}"
        except ValueError:
            pass
        rel = resolved.relative_to(PROJECT_ROOT.resolve())
        # Drop leading assets/ so router does not double-nest
        parts = rel.parts
        if parts and parts[0].casefold() == "assets":
            rel = Path(*parts[1:]) if len(parts) > 1 else Path()
        return f"/api/assets/{rel.as_posix()}"
    except Exception:
        try:
            return _media_url(path, path.parent)
        except Exception:
            return None


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
    expand_cover: bool = False,
) -> dict:
    art = resolve_universe_art(u)
    members = _member_rows(db, u.uni_id) if include_members else []
    cover = art.get("cover_url") or cover_fallback
    if not cover and include_members and expand_cover:
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
            {
                "module": m.ume_module,
                "slug": m.ume_slug,
                "leaf_id": m.ume_leaf_id or m.ume_slug,
                "source": m.ume_source,
            }
            for m in members
        ]
        if include_members
        else None,
    }


def list_universes(
    db: Session, module: ModuleKind | None = None
) -> list[dict]:
    rows = db.scalars(select(Universe).order_by(Universe.uni_name)).all()
    out: list[dict] = []
    for u in rows:
        members = _member_rows(db, u.uni_id)
        has_series = any(m.ume_module == "series" for m in members)
        has_movies = any(m.ume_module == "movies" for m in members)
        if module == "series" and not has_series:
            continue
        if module == "movies" and not has_movies:
            continue
        # Keep list payloads light — home panes only need art + flags.
        data = _serialize_universe(db, u, include_members=False, expand_cover=False)
        data["has_series"] = has_series
        data["has_movies"] = has_movies
        data["member_count"] = len(members)
        out.append(data)
    return out


def get_universe(db: Session, universe_id: int) -> dict | None:
    u = db.get(Universe, universe_id)
    if not u:
        return None
    return _serialize_universe(db, u)


def universe_for_franchise(
    db: Session, module: ModuleKind, slug: str
) -> dict | None:
    """Return the first universe for a franchise (compat). Prefer universes_for_franchise."""
    rows = universes_for_franchise(db, module, slug)
    return rows[0] if rows else None


def _norm_leaf_id(leaf_id: str | None, franchise_slug: str) -> str:
    lid = (leaf_id or "").strip()
    return lid or franchise_slug


_leaf_cards_cache: dict[tuple[str, str], list[dict]] = {}
_expand_cards_cache: dict[int, list[dict]] = {}


def clear_universe_card_caches() -> None:
    _leaf_cards_cache.clear()
    _expand_cards_cache.clear()


def _leaf_card(
    module: ModuleKind, franchise_slug: str, leaf_id: str
) -> dict | None:
    want = (leaf_id or "").casefold().strip()
    for card in _leaf_cards_for_member(module, franchise_slug):
        cid = (card.get("leaf_id") or card.get("id") or "").casefold()
        if cid == want:
            return card
    return None


def migrate_legacy_universe_members(db: Session) -> int:
    """Expand pre-leaf franchise rows into leaf members + sync rules."""
    legacy = list(
        db.scalars(
            select(UniverseMember).where(
                (UniverseMember.ume_leaf_id == "")
                | (UniverseMember.ume_leaf_id.is_(None))  # type: ignore[union-attr]
            )
        ).all()
    )
    if not legacy:
        return 0
    changed = 0
    for row in legacy:
        module = row.ume_module
        if module not in ("movies", "series"):
            db.delete(row)
            changed += 1
            continue
        franchise = _norm_slug(row.ume_slug)
        universe_id = row.ume_universe_id
        cards = _leaf_cards_for_member(module, franchise)  # type: ignore[arg-type]
        leaf_ids = [
            str(c.get("leaf_id") or c.get("id") or franchise) for c in cards
        ] or [franchise]
        for lid in leaf_ids:
            _ensure_leaf_member(
                db,
                universe_id=universe_id,
                module=module,  # type: ignore[arg-type]
                franchise_slug=franchise,
                leaf_id=lid,
                source=row.ume_source or "manual",
                commit=False,
            )
        _ensure_sync_rule(
            db,
            universe_id=universe_id,
            module=module,  # type: ignore[arg-type]
            franchise_slug=franchise,
            commit=False,
        )
        db.delete(row)
        changed += 1
    db.commit()
    return changed


def _ensure_sync_rule(
    db: Session,
    *,
    universe_id: int,
    module: ModuleKind,
    franchise_slug: str,
    commit: bool = True,
) -> None:
    norm = _norm_slug(franchise_slug)
    existing = db.scalar(
        select(UniverseFranchiseSync).where(
            UniverseFranchiseSync.ufs_universe_id == universe_id,
            UniverseFranchiseSync.ufs_module == module,
            UniverseFranchiseSync.ufs_franchise_slug == norm,
        )
    )
    if not existing:
        db.add(
            UniverseFranchiseSync(
                ufs_universe_id=universe_id,
                ufs_module=module,
                ufs_franchise_slug=norm,
            )
        )
    if commit:
        db.commit()


def _clear_sync_rule(
    db: Session,
    *,
    universe_id: int,
    module: ModuleKind,
    franchise_slug: str,
    commit: bool = True,
) -> None:
    norm = _norm_slug(franchise_slug)
    rows = list(
        db.scalars(
            select(UniverseFranchiseSync).where(
                UniverseFranchiseSync.ufs_universe_id == universe_id,
                UniverseFranchiseSync.ufs_module == module,
                UniverseFranchiseSync.ufs_franchise_slug == norm,
            )
        ).all()
    )
    for row in rows:
        db.delete(row)
    if commit:
        db.commit()


def _ensure_leaf_member(
    db: Session,
    *,
    universe_id: int,
    module: ModuleKind,
    franchise_slug: str,
    leaf_id: str,
    source: str = "manual",
    commit: bool = True,
) -> bool:
    """Insert leaf membership if missing. Returns True when a row was added."""
    norm = _norm_slug(franchise_slug)
    lid = _norm_leaf_id(leaf_id, norm)
    existing = db.scalar(
        select(UniverseMember).where(
            UniverseMember.ume_universe_id == universe_id,
            UniverseMember.ume_module == module,
            UniverseMember.ume_slug == norm,
            UniverseMember.ume_leaf_id == lid,
        )
    )
    if existing:
        return False
    db.add(
        UniverseMember(
            ume_universe_id=universe_id,
            ume_module=module,
            ume_slug=norm,
            ume_leaf_id=lid,
            ume_source=source,
        )
    )
    if commit:
        db.commit()
    _expand_cards_cache.pop(universe_id, None)
    return True


def apply_franchise_syncs(db: Session, module: ModuleKind, franchise_slug: str) -> int:
    """Materialize missing leaves for active sync rules on this franchise."""
    norm = _norm_slug(franchise_slug)
    rules = list(
        db.scalars(
            select(UniverseFranchiseSync).where(
                UniverseFranchiseSync.ufs_module == module,
                UniverseFranchiseSync.ufs_franchise_slug == norm,
            )
        ).all()
    )
    if not rules:
        return 0
    cards = _leaf_cards_for_member(module, norm)
    leaf_ids = [str(c.get("leaf_id") or c.get("id") or norm) for c in cards] or [
        norm
    ]
    added = 0
    for rule in rules:
        for lid in leaf_ids:
            if _ensure_leaf_member(
                db,
                universe_id=rule.ufs_universe_id,
                module=module,
                franchise_slug=norm,
                leaf_id=lid,
                source="sync",
                commit=False,
            ):
                added += 1
    if added:
        db.commit()
    return added


def universes_for_leaf(
    db: Session,
    module: ModuleKind,
    franchise_slug: str,
    leaf_id: str | None = None,
) -> list[dict]:
    """Universes this specific leaf belongs to."""
    apply_franchise_syncs(db, module, franchise_slug)
    norm = _norm_slug(franchise_slug)
    lid = _norm_leaf_id(leaf_id, norm)
    members = list(
        db.scalars(
            select(UniverseMember).where(
                UniverseMember.ume_module == module,
                UniverseMember.ume_slug == norm,
                UniverseMember.ume_leaf_id == lid,
            )
        ).all()
    )
    # Compat: legacy empty leaf_id rows matching franchise
    if not members:
        members = list(
            db.scalars(
                select(UniverseMember).where(
                    UniverseMember.ume_module == module,
                    UniverseMember.ume_slug == norm,
                    UniverseMember.ume_leaf_id == "",
                )
            ).all()
        )
    out: list[dict] = []
    seen: set[int] = set()
    for member in members:
        if member.ume_universe_id in seen:
            continue
        u = db.get(Universe, member.ume_universe_id)
        if not u:
            continue
        seen.add(u.uni_id)
        data = _serialize_universe(db, u)
        data["parent_module"] = module
        data["parent_slug"] = member.ume_slug
        data["leaf_id"] = member.ume_leaf_id or lid
        out.append(data)
    out.sort(key=lambda x: (x.get("name") or "").casefold())
    return out


def universes_for_franchise(
    db: Session, module: ModuleKind, slug: str
) -> list[dict]:
    """Union of universes any leaf of this franchise belongs to."""
    apply_franchise_syncs(db, module, slug)
    norm = _norm_slug(slug)
    members = list(
        db.scalars(
            select(UniverseMember).where(
                UniverseMember.ume_module == module,
                UniverseMember.ume_slug == norm,
            )
        ).all()
    )
    out: list[dict] = []
    seen: set[int] = set()
    for member in members:
        if member.ume_universe_id in seen:
            continue
        u = db.get(Universe, member.ume_universe_id)
        if not u:
            continue
        seen.add(u.uni_id)
        data = _serialize_universe(db, u)
        data["parent_module"] = module
        data["parent_slug"] = member.ume_slug
        out.append(data)
    out.sort(key=lambda x: (x.get("name") or "").casefold())
    return out


def franchise_has_sync(
    db: Session, module: ModuleKind, franchise_slug: str, universe_id: int
) -> bool:
    norm = _norm_slug(franchise_slug)
    return (
        db.scalar(
            select(UniverseFranchiseSync).where(
                UniverseFranchiseSync.ufs_universe_id == universe_id,
                UniverseFranchiseSync.ufs_module == module,
                UniverseFranchiseSync.ufs_franchise_slug == norm,
            )
        )
        is not None
    )


def franchise_universe_bundle(
    db: Session,
    module: ModuleKind,
    slug: str,
    *,
    prefer_universe_id: int | None = None,
) -> tuple[list[dict], dict | None, list[dict], list[dict], list[dict]]:
    """
    Returns (universes, active_universe, active_cards, merged_cards, groups).
    universes = union across franchise leaves. Cards are always leaf-level.
    """
    universes = universes_for_franchise(db, module, slug)
    active: dict | None = None
    if prefer_universe_id is not None:
        active = next((u for u in universes if u.get("id") == prefer_universe_id), None)
    if active is None and universes:
        active = universes[0]

    groups: list[dict] = []
    merged: list[dict] = []
    seen: set[tuple] = set()
    for u in universes:
        cards = expand_universe_cards(db, u["id"])
        for c in cards:
            c.setdefault("universe_id", u["id"])
        groups.append(
            {
                "id": u["id"],
                "name": u["name"],
                "count": len(cards),
                "items": cards,
            }
        )
        for c in cards:
            key = (
                c.get("module"),
                (c.get("franchise_id") or "").casefold(),
                (c.get("leaf_id") or c.get("id") or "").casefold(),
            )
            if key in seen:
                continue
            seen.add(key)
            merged.append(c)

    active_cards = (
        next((g["items"] for g in groups if g["id"] == active["id"]), [])
        if active
        else []
    )
    return universes, active, active_cards, merged, groups


def link_franchise(
    db: Session,
    *,
    universe_id: int,
    module: ModuleKind,
    slug: str,
    source: str = "manual",
    leaf_id: str | None = None,
) -> dict:
    """Link a franchise (bulk + sync) or a single leaf when leaf_id is set."""
    if module not in ("movies", "series"):
        raise ValueError("module must be movies or series")
    u = db.get(Universe, universe_id)
    if not u:
        raise ValueError("Universe not found")
    norm = _norm_slug(slug)
    if leaf_id:
        _ensure_leaf_member(
            db,
            universe_id=universe_id,
            module=module,
            franchise_slug=norm,
            leaf_id=leaf_id,
            source=source,
            commit=True,
        )
        return _serialize_universe(db, u)

    # Bulk: sync rule + all current leaves (skip existing).
    _ensure_sync_rule(
        db,
        universe_id=universe_id,
        module=module,
        franchise_slug=norm,
        commit=False,
    )
    cards = _leaf_cards_for_member(module, norm)
    leaf_ids = [str(c.get("leaf_id") or c.get("id") or norm) for c in cards] or [
        norm
    ]
    for lid in leaf_ids:
        _ensure_leaf_member(
            db,
            universe_id=universe_id,
            module=module,
            franchise_slug=norm,
            leaf_id=lid,
            source=source,
            commit=False,
        )
    db.commit()
    return _serialize_universe(db, u)


def unlink_franchise(
    db: Session,
    *,
    module: ModuleKind,
    slug: str,
    universe_id: int | None = None,
    leaf_id: str | None = None,
) -> None:
    """Unlink a leaf (demotes sync) or all franchise leaves in a universe."""
    norm = _norm_slug(slug)
    if leaf_id and universe_id is not None:
        lid = _norm_leaf_id(leaf_id, norm)
        rows = list(
            db.scalars(
                select(UniverseMember).where(
                    UniverseMember.ume_universe_id == universe_id,
                    UniverseMember.ume_module == module,
                    UniverseMember.ume_slug == norm,
                    UniverseMember.ume_leaf_id == lid,
                )
            ).all()
        )
        for row in rows:
            db.delete(row)
        # Demote: clear sync so new children no longer auto-join.
        _clear_sync_rule(
            db,
            universe_id=universe_id,
            module=module,
            franchise_slug=norm,
            commit=False,
        )
        db.commit()
        _expand_cards_cache.pop(universe_id, None)
        return

    q = select(UniverseMember).where(
        UniverseMember.ume_module == module,
        UniverseMember.ume_slug == norm,
    )
    if universe_id is not None:
        q = q.where(UniverseMember.ume_universe_id == universe_id)
    rows = list(db.scalars(q).all())
    for row in rows:
        db.delete(row)
        _expand_cards_cache.pop(row.ume_universe_id, None)
    sync_q = select(UniverseFranchiseSync).where(
        UniverseFranchiseSync.ufs_module == module,
        UniverseFranchiseSync.ufs_franchise_slug == norm,
    )
    if universe_id is not None:
        sync_q = sync_q.where(
            UniverseFranchiseSync.ufs_universe_id == universe_id
        )
    for rule in list(db.scalars(sync_q).all()):
        db.delete(rule)
    db.commit()


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
    return update_universe(db, universe_id, overview=overview, set_overview=True)


def update_universe(
    db: Session,
    universe_id: int,
    *,
    name: str | None = None,
    overview: str | None = None,
    set_overview: bool = False,
) -> Universe | None:
    u = db.get(Universe, universe_id)
    if not u:
        return None
    if name is not None:
        cleaned = name.strip()
        if not cleaned:
            raise ValueError("Name is required")
        new_slug = _slugify(cleaned)
        clash = db.scalar(
            select(Universe).where(
                Universe.uni_slug == new_slug,
                Universe.uni_id != universe_id,
            )
        )
        if clash:
            raise ValueError(f"Universe {cleaned!r} already exists")
        old_name = u.uni_name
        if cleaned != old_name:
            _rename_universe_art_files(old_name, cleaned)
            u.uni_name = cleaned
            u.uni_slug = new_slug
    if set_overview:
        u.uni_overview = (overview or "").strip() or None
    u.uni_updated_at = _now()
    db.commit()
    db.refresh(u)
    return u


def _rename_universe_art_files(old_name: str, new_name: str) -> None:
    root = _media_root()
    folder = universes_dir(root) if root else None
    if not folder or not folder.is_dir() or not root:
        return
    for kind in ART_KINDS:
        src = _art_file(old_name, kind, root)
        if not src:
            continue
        dest = folder / f"{new_name} - {kind}{src.suffix}"
        try:
            if dest.exists() and dest != src:
                dest.unlink()
            src.rename(dest)
        except OSError:
            pass


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
    cache_key = (module, (slug or "").casefold().strip())
    cached = _leaf_cards_cache.get(cache_key)
    if cached is not None:
        return cached

    if module == "movies":
        from app.movies_index import build_work_detail

        detail = build_work_detail(slug)
        if not detail:
            _leaf_cards_cache[cache_key] = []
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
        _leaf_cards_cache[cache_key] = out
        return out

    from app.series_index import build_franchise_detail

    detail = build_franchise_detail(slug)
    if not detail:
        _leaf_cards_cache[cache_key] = []
        return []
    franchise_id = detail.get("id") or slug
    subseries = detail.get("subseries") or []
    out: list[dict] = []
    if subseries:
        for s in subseries:
            out.append(
                {
                    **s,
                    "module": "series",
                    "franchise_id": franchise_id,
                    "leaf_id": s.get("id"),
                    "kind": "subseries"
                    if not s.get("is_standalone")
                    else "show",
                    "title": s.get("title") or s.get("name"),
                }
            )
    else:
        # No subseries: treat franchise itself as one card when it has seasons/episodes
        seasons = detail.get("seasons") or []
        if seasons or detail.get("episode_count"):
            date_iso = detail.get("date_iso") or detail.get("starting_date")
            display_date = detail.get("display_date")
            if not date_iso and seasons:
                dated = [s for s in seasons if s.get("date_iso")]
                if dated:
                    best = min(dated, key=lambda s: str(s.get("date_iso") or "9999"))
                    date_iso = best.get("date_iso")
                    display_date = best.get("display_date")
            out.append(
                {
                    "id": franchise_id,
                    "title": detail.get("name") or franchise_id,
                    "name": detail.get("name"),
                    "date_iso": date_iso,
                    "display_date": display_date,
                    "cover_url": detail.get("cover_url"),
                    "portrait_url": detail.get("portrait_url") or detail.get("cover_url"),
                    "landscape_url": detail.get("landscape_url"),
                    "banner_url": detail.get("banner_url"),
                    "logo_url": detail.get("logo_url"),
                    "folder_path": detail.get("folder_path"),
                    "module": "series",
                    "franchise_id": franchise_id,
                    "leaf_id": franchise_id,
                    "kind": "show",
                }
            )
    _leaf_cards_cache[cache_key] = out
    return out


def expand_universe_cards(db: Session, universe_id: int) -> list[dict]:
    cached = _expand_cards_cache.get(universe_id)
    if cached is not None:
        return cached
    members = _member_rows(db, universe_id)
    cards: list[dict] = []
    seen: set[tuple] = set()
    for m in members:
        if m.ume_module not in ("movies", "series"):
            continue
        module = m.ume_module  # type: ignore[assignment]
        leaf_id = (m.ume_leaf_id or "").strip()
        if leaf_id:
            card = _leaf_card(module, m.ume_slug, leaf_id)
            if not card:
                # Leaf missing on disk — skip rather than expand whole franchise.
                continue
            key = (module, m.ume_slug.casefold(), leaf_id.casefold())
            if key in seen:
                continue
            seen.add(key)
            cards.append({**card, "universe_id": universe_id})
            continue
        # Legacy franchise-only row: expand all children once.
        for card in _leaf_cards_for_member(module, m.ume_slug):
            lid = str(card.get("leaf_id") or card.get("id") or m.ume_slug)
            key = (module, m.ume_slug.casefold(), lid.casefold())
            if key in seen:
                continue
            seen.add(key)
            cards.append({**card, "universe_id": universe_id})
    cards.sort(
        key=lambda c: (
            c.get("date_iso") or "9999",
            (c.get("title") or c.get("name") or "").casefold(),
        )
    )
    _expand_cards_cache[universe_id] = cards
    return cards


def _json_obj(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        import json

        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _years_from_isos(isos: list[str | None]) -> tuple[str | None, str | None]:
    years: list[int] = []
    for iso in isos:
        y = (iso or "")[:4]
        if y.isdigit():
            years.append(int(y))
    if not years:
        return None, None
    return str(min(years)), str(max(years))


def _hub_aggregate_meta(db: Session, cards: list[dict]) -> dict:
    """Union writers/genres/publishers/languages + air-date span from member cards."""
    from app.models import MovieWork, Series as SeriesRow

    writers: list[str] = []
    publishers: list[str] = []
    languages: list[str] = []
    genre_map: dict[str, dict] = {}
    seen_w: set[str] = set()
    seen_p: set[str] = set()
    seen_l: set[str] = set()

    def add_writer(v: str) -> None:
        key = v.casefold().strip()
        if not key or key in seen_w:
            return
        seen_w.add(key)
        writers.append(v.strip())

    def add_pub(v: str) -> None:
        key = v.casefold().strip()
        if not key or key in seen_p:
            return
        seen_p.add(key)
        publishers.append(v.strip())

    def add_lang(v: str) -> None:
        key = v.casefold().strip()
        if not key or key in seen_l:
            return
        seen_l.add(key)
        languages.append(v.strip())

    def add_genre(g: object) -> None:
        if isinstance(g, dict):
            name = str(g.get("name") or "").strip()
            gid = g.get("id") if g.get("id") is not None else name
        else:
            name = str(g or "").strip()
            gid = name
        if not name:
            return
        key = name.casefold()
        if key not in genre_map:
            genre_map[key] = {"id": gid, "name": name}

    # Cache work meta by slug
    movie_meta_cache: dict[str, dict] = {}
    for c in cards:
        module = c.get("module")
        slug = (c.get("franchise_id") or "").strip()
        leaf = str(c.get("leaf_id") or c.get("id") or "")
        if module == "movies" and slug:
            if slug not in movie_meta_cache:
                row = db.scalar(
                    select(MovieWork).where(MovieWork.mwk_slug == slug)
                )
                movie_meta_cache[slug] = _json_obj(
                    row.mwk_metadata_json if row else None
                )
            meta = movie_meta_cache[slug]
            films = meta.get("films") if isinstance(meta.get("films"), dict) else {}
            film = films.get(leaf) if isinstance(films.get(leaf), dict) else None
            src = film or meta
            for w in src.get("writers") or []:
                if isinstance(w, str):
                    add_writer(w)
            for p in src.get("publishers") or []:
                if isinstance(p, str):
                    add_pub(p)
            for g in src.get("genres") or []:
                add_genre(g)
            langs = src.get("languages")
            if isinstance(langs, list):
                for lang in langs:
                    if isinstance(lang, str):
                        add_lang(lang)
            elif isinstance(src.get("original_language"), str):
                add_lang(src["original_language"])
        elif module == "series" and slug:
            title_hint = (
                c.get("name") or c.get("title") or slug.replace("-", " ")
            ).strip()
            row = db.scalar(
                select(SeriesRow).where(SeriesRow.ser_name == title_hint)
            )
            if not row and title_hint:
                # Loose match on code/name
                rows = db.scalars(select(SeriesRow)).all()
                for cand in rows:
                    n = (cand.ser_name or "").casefold()
                    if n and (
                        n == title_hint.casefold()
                        or n in title_hint.casefold()
                        or title_hint.casefold() in n
                    ):
                        row = cand
                        break
            if not row:
                continue
            for w in (row.ser_writers or "").split(";"):
                if w.strip():
                    add_writer(w)
            try:
                import json

                raw_g = row.ser_genres_json
                parsed = json.loads(raw_g) if raw_g else []
                if isinstance(parsed, list):
                    for g in parsed:
                        add_genre(g)
            except Exception:
                pass
            for p in (row.ser_publishers or "").split(";"):
                if p.strip():
                    add_pub(p)

    y0, y1 = _years_from_isos([c.get("date_iso") for c in cards])
    periods: list[dict] = []
    if y0 and y1:
        label = y0 if y0 == y1 else f"{y0}-{y1}"
        periods.append({"label": label, "start": f"{y0}-01-01", "end": f"{y1}-12-31"})

    return {
        "writers": writers,
        "publishers": publishers,
        "languages": languages,
        "genres": list(genre_map.values()),
        "activity_periods": periods,
    }


def _hub_media_flags(cards: list[dict]) -> dict:
    """Best-effort media tab flags from member folders (audio/gallery)."""
    has_audio = False
    has_gallery = False
    root = _media_root()
    if not root:
        return {
            "has_series": any(c.get("module") == "series" for c in cards),
            "has_movies": any(c.get("module") == "movies" for c in cards),
            "has_audio": False,
            "has_gallery": False,
            "has_library": False,
            "has_games": False,
        }
    for c in cards:
        folder = (c.get("folder_path") or "").strip()
        if not folder:
            continue
        base = root / folder.replace("\\", "/")
        if not base.is_dir():
            continue
        if not has_audio:
            for name in ("Audio", "audio"):
                if (base / name).is_dir():
                    try:
                        if any((base / name).iterdir()):
                            has_audio = True
                            break
                    except OSError:
                        pass
            parent_audio = base.parent / "Audio"
            if not has_audio and parent_audio.is_dir():
                try:
                    if any(parent_audio.iterdir()):
                        has_audio = True
                except OSError:
                    pass
        if not has_gallery:
            for name in ("Gallery", "gallery"):
                gdir = base / name
                if gdir.is_dir():
                    try:
                        if any(gdir.rglob("*")):
                            has_gallery = True
                            break
                    except OSError:
                        pass
        if has_audio and has_gallery:
            break
    return {
        "has_series": any(c.get("module") == "series" for c in cards),
        "has_movies": any(c.get("module") == "movies" for c in cards),
        "has_audio": has_audio,
        "has_gallery": has_gallery,
        "has_library": False,
        "has_games": False,
    }


def build_universe_hub(db: Session, universe_id: int) -> dict | None:
    """Franchise-like hub payload: universe record + leaf cards by module (name sort)."""
    u = db.get(Universe, universe_id)
    if not u:
        return None
    data = _serialize_universe(db, u, expand_cover=True)
    cards = expand_universe_cards(db, universe_id)

    def title_key(c: dict) -> str:
        return (c.get("title") or c.get("name") or "").casefold()

    series = sorted(
        (c for c in cards if c.get("module") == "series"),
        key=title_key,
    )
    movies = sorted(
        (c for c in cards if c.get("module") == "movies"),
        key=title_key,
    )
    # Overview carousel: chronological (franchise-like), all leaves
    carousel = sorted(
        cards,
        key=lambda c: (c.get("date_iso") or "9999", title_key(c)),
    )

    # Prefer universe art; fall back to earliest member for page chrome.
    banner = data.get("banner_url") or data.get("landscape_url")
    portrait = data.get("portrait_url") or data.get("cover_url")
    if not banner or not portrait:
        for c in carousel:
            if not portrait:
                portrait = (
                    c.get("portrait_url")
                    or c.get("cover_url")
                    or c.get("landscape_url")
                )
            if not banner:
                banner = (
                    c.get("banner_url")
                    or c.get("landscape_url")
                    or c.get("cover_url")
                )
            if portrait and banner:
                break
        if portrait and not data.get("cover_url"):
            data["cover_url"] = portrait
        if portrait and not data.get("portrait_url"):
            data["portrait_url"] = portrait
        if banner and not data.get("banner_url"):
            data["banner_url"] = banner
        if banner and not data.get("landscape_url"):
            data["landscape_url"] = banner

    agg = _hub_aggregate_meta(db, cards)
    media = _hub_media_flags(cards)
    media["has_series"] = bool(series)
    media["has_movies"] = bool(movies)

    # Logo-by-language stubs (universe_logo / universe_logo_{code})
    logo_by_language: dict[str, str] = {}
    if data.get("logo_url"):
        logo_by_language["default"] = data["logo_url"]
    for code in agg.get("languages") or []:
        f = _art_file(u.uni_name, f"Logo_{code}", None) or _art_file(
            u.uni_name, f"logo_{code}", None
        )
        if f:
            url = resolve_universe_art(u).get("logo_url")
            # Resolve language-specific file directly
            root = _media_root()
            under_media = False
            if root:
                try:
                    f.resolve().relative_to(root.resolve())
                    under_media = True
                except ValueError:
                    under_media = False
            url = _media_url(f, root) if under_media and root else _file_url(f)
            if url:
                logo_by_language[code.casefold()] = url

    eras = []
    if portrait:
        eras.append(
            {
                "orientation": "portrait",
                "portrait_url": portrait,
                "slide_url": portrait,
            }
        )
    if banner:
        eras.append(
            {
                "orientation": "landscape",
                "landscape_url": banner,
                "slide_url": banner,
            }
        )

    overview = {
        "id": f"universe-{universe_id}",
        "name": data.get("name") or "",
        "letter": (data.get("name") or "?")[:1].upper(),
        "folder_path": "",
        "cover_url": portrait,
        "bio": data.get("overview"),
        "writers": agg["writers"],
        "aliases": [],
        "languages": agg["languages"],
        "origin_language": (agg["languages"][0] if agg["languages"] else None),
        "language_options": [
            {
                "code": lang,
                "label": lang,
                "selected": i == 0,
                "is_origin": i == 0,
            }
            for i, lang in enumerate(agg["languages"])
        ],
        "activity_periods": agg["activity_periods"],
        "genres": agg["genres"],
        "publishers": agg["publishers"],
        "eras": eras,
        "logo_url": data.get("logo_url"),
        "logo_by_language": logo_by_language,
        "logos_switchable": len(logo_by_language) > 1,
        "cast": {"characters": [], "staff": []},
        "media": media,
        "links": {"categories": [], "groups": {}, "total": 0},
        "seasons": [],
        "related": {
            "movies": [],
            "series": [],
            "books": [],
            "games": [],
            "music": [],
        },
        "subseries": [
            {
                "id": str(c.get("leaf_id") or c.get("id") or ""),
                "title": c.get("title") or c.get("name") or "",
                "date_iso": c.get("date_iso"),
                "display_date": c.get("display_date"),
                "folder_path": c.get("folder_path") or "",
                "cover_url": c.get("portrait_url") or c.get("cover_url"),
                "logo_url": c.get("logo_url"),
                "season_count": 0,
                "module": c.get("module"),
                "franchise_id": c.get("franchise_id"),
            }
            for c in carousel
        ],
        "gallery_folder_paths": [
            p
            for p in (
                (c.get("folder_path") or "").strip() for c in carousel
            )
            if p
        ],
    }

    return {
        "universe": data,
        "series": series,
        "movies": movies,
        "carousel": carousel,
        "overview": overview,
        "media": media,
    }


def landing_franchise(
    db: Session, universe_id: int, prefer_module: ModuleKind
) -> dict | None:
    """Pick a landing page for a universe card click.

    Prefer the earliest multi-leaf franchise hub when one exists; otherwise the
    earliest standalone leaf page.
    """
    members = _member_rows(db, universe_id)
    if not members:
        return None

    def module_pool(module: ModuleKind) -> list[UniverseMember]:
        return [m for m in members if m.ume_module == module]

    def franchise_groups(
        module: ModuleKind,
    ) -> dict[str, list[UniverseMember]]:
        groups: dict[str, list[UniverseMember]] = {}
        for m in module_pool(module):
            groups.setdefault(_norm_slug(m.ume_slug), []).append(m)
        return groups

    def earliest_date(module: ModuleKind, slug: str) -> str:
        return _franchise_earliest_date(module, slug)

    def is_multi_leaf(module: ModuleKind, slug: str, rows: list[UniverseMember]) -> bool:
        """True when this work is a franchise hub (2+ films/shows), not a standalone."""
        if len(rows) > 1:
            return True
        cards = _leaf_cards_for_member(module, slug)
        if len(cards) > 1:
            return True
        if len(cards) == 1 and cards[0].get("is_standalone"):
            return False
        # Single leaf whose title differs from the work name → treat as franchise folder
        if module == "movies":
            from app.movies_index import build_work_detail

            detail = build_work_detail(slug)
            if detail and int(detail.get("film_count") or 0) > 1:
                return True
            if detail and detail.get("is_standalone"):
                return False
            # film_count == 1 and not standalone (e.g. HIM/Poison Arrow) → hub ok
            if detail and int(detail.get("film_count") or 0) == 1:
                return not bool(detail.get("is_standalone"))
        return False

    def pick(module: ModuleKind) -> dict | None:
        groups = franchise_groups(module)
        if not groups:
            return None
        hubs: list[tuple[str, str]] = []
        standalones: list[tuple[str, str, str]] = []
        for slug, rows in groups.items():
            date = earliest_date(module, slug)
            if is_multi_leaf(module, slug, rows):
                hubs.append((date, slug))
                continue
            # Standalone leaf
            leaf = (rows[0].ume_leaf_id or "").strip() or slug
            cards = _leaf_cards_for_member(module, slug)
            if cards:
                leaf = str(cards[0].get("leaf_id") or cards[0].get("id") or leaf)
                date = str(cards[0].get("date_iso") or date)
            standalones.append((date, slug, leaf))

        if hubs:
            hubs.sort(key=lambda x: (x[0], x[1].casefold()))
            _date, slug = hubs[0]
            return {
                "module": module,
                "franchise_id": slug,
                "leaf_id": None,
                "universe_id": universe_id,
            }
        if standalones:
            standalones.sort(key=lambda x: (x[0], x[1].casefold()))
            _date, slug, leaf = standalones[0]
            return {
                "module": module,
                "franchise_id": slug,
                "leaf_id": leaf,
                "universe_id": universe_id,
            }
        return None

    return pick(prefer_module) or pick(
        "series" if prefer_module == "movies" else "movies"
    )


def universe_member_slugs(db: Session, universe_id: int) -> set[tuple[str, str]]:
    return {
        (m.ume_module, m.ume_slug)
        for m in _member_rows(db, universe_id)
    }


def _norm_title_key(value: str) -> str:
    """Alphanumeric-only key so ':' vs '-' title variants still match."""
    return re.sub(r"[^a-z0-9]+", "", (value or "").casefold())


def filter_similar_against_universe(
    db: Session,
    module: ModuleKind,
    franchise_slug: str,
    similar: list[dict],
) -> list[dict]:
    """Drop similar entries that match any franchise in any shared universe."""
    universes = universes_for_franchise(db, module, franchise_slug)
    if not universes:
        return similar
    member_slugs: set[str] = set()
    member_name_keys: set[str] = set()
    leaf_keys: set[str] = set()
    for uni in universes:
        if uni.get("name"):
            member_name_keys.add(_norm_title_key(uni["name"]))
        for m in uni.get("members") or []:
            slug = (m.get("slug") or "").strip()
            if slug:
                member_slugs.add(slug.casefold())
                member_name_keys.add(_norm_title_key(slug))
        for c in expand_universe_cards(db, uni["id"]):
            t = (c.get("title") or c.get("name") or "").strip()
            if t:
                leaf_keys.add(_norm_title_key(t))
            fid = (c.get("franchise_id") or "").casefold()
            if fid:
                member_slugs.add(fid)
                member_name_keys.add(_norm_title_key(fid))

    out = []
    for item in similar:
        title = (item.get("title") or item.get("name") or "").strip()
        title_key = _norm_title_key(title)
        sid = str(item.get("id") or item.get("slug") or "").casefold()
        if title_key and title_key in leaf_keys:
            continue
        if sid and sid in member_slugs:
            continue
        if title_key and any(
            len(mk) >= 8 and (mk in title_key or title_key in mk)
            for mk in member_name_keys
        ):
            continue
        local_id = (item.get("local_id") or item.get("franchise_id") or "").casefold()
        if local_id and local_id in member_slugs:
            continue
        out.append(item)
    return out


async def pull_tmdb_portrait(db: Session, universe_id: int, api_key: str) -> dict:
    """Search TMDb collection by universe name; save Portrait.png only (no collection id)."""
    import httpx

    from app.services import tmdb

    u = db.get(Universe, universe_id)
    if not u:
        raise ValueError("Universe not found")

    names_to_try: list[str] = [u.uni_name]
    for m in _member_rows(db, universe_id):
        hint = (m.ume_slug or "").replace("-", " ").strip()
        if hint and hint.casefold() not in {n.casefold() for n in names_to_try}:
            names_to_try.append(hint)

    collection_id = None
    last_err: Exception | None = None
    for name in names_to_try:
        try:
            collection_id, _ = await tmdb.search_collection_id(name, api_key)
        except Exception as exc:  # network / TMDb outages
            last_err = exc
            continue
        if collection_id:
            break
    if not collection_id:
        if last_err is not None:
            raise RuntimeError(
                "Couldn't reach TMDb right now. Try Fetch cover again in a moment."
            ) from last_err
        raise ValueError("No cover found")

    try:
        data = await tmdb.fetch_collection(collection_id, api_key)
    except Exception as exc:
        raise RuntimeError(
            "Couldn't reach TMDb right now. Try Fetch cover again in a moment."
        ) from exc

    poster_path = data.get("poster_path")
    url = tmdb.image_url(poster_path, "w500")
    if not url:
        raise ValueError("That collection has no poster to fetch.")
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            raw = resp.content
    except Exception as exc:
        raise RuntimeError(
            "Couldn't download the cover image. Try again in a moment."
        ) from exc

    art_url = save_universe_art_bytes(u, "Portrait", raw, suffix=".png")
    overview = (data.get("overview") or "").strip()
    if overview and not u.uni_overview:
        u.uni_overview = overview
        u.uni_updated_at = _now()
        db.commit()
        db.refresh(u)
    return _serialize_universe(db, u) | {"portrait_url": art_url}
