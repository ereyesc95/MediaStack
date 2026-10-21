"""Music MERCH tab — scan Souvenirs across all shows; categories in DB."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.gallery import IMAGE_EXTS
from app.models import Band, MerchCategory, Tour, TourShow
from app.tours_index import list_show_folder_items, show_slug, tour_slug

# label (plural), orientation, sort
DEFAULT_MERCH_CATEGORIES: tuple[tuple[str, str, int], ...] = (
    ("Posters", "portrait", 10),
    ("Shirts", "portrait", 20),
    ("Setlists", "portrait", 30),
    ("Tickets", "portrait", 40),
    ("Photocards", "landscape", 50),
    ("Drumsticks", "landscape", 60),
    ("Wristbands", "landscape", 70),
    ("Bandanas", "landscape", 80),
    ("Picks", "square", 90),
    ("Caps", "square", 100),
    ("Lanyards", "square", 110),
    ("Stickers", "square", 120),
    ("Totebags", "square", 130),
    ("Keychains", "square", 140),
    ("Pins", "square", 150),
)

_VALID_ORIENTATIONS = frozenset({"landscape", "portrait", "square"})


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _media_root() -> Path | None:
    raw = (settings.media_root or "").strip()
    if not raw:
        return None
    root = Path(raw)
    return root if root.is_dir() else None


def prefix_from_label(label: str) -> str:
    """Plural category label → singular file prefix (strip one trailing s)."""
    text = (label or "").strip()
    if not text:
        return ""
    if text.casefold().endswith("s") and len(text) > 1:
        return text[:-1]
    return text


def _serialize(row: MerchCategory, *, count: int | None = None) -> dict:
    out = {
        "id": row.mrc_id,
        "prefix": row.mrc_prefix,
        "label": row.mrc_label,
        "orientation": (row.mrc_orientation or "square").casefold(),
        "sort": row.mrc_sort or 0,
    }
    if count is not None:
        out["count"] = count
    return out


def ensure_default_merch_categories(db: Session) -> None:
    """Seed defaults and backfill orientation / missing categories."""
    now = _now_iso()
    existing = {
        (r.mrc_label or "").casefold(): r
        for r in db.scalars(select(MerchCategory)).all()
    }
    by_prefix = {
        (r.mrc_prefix or "").casefold(): r
        for r in existing.values()
    }
    changed = False
    for label, orientation, sort in DEFAULT_MERCH_CATEGORIES:
        pref = prefix_from_label(label)
        row = existing.get(label.casefold()) or by_prefix.get(pref.casefold())
        if row is None:
            db.add(
                MerchCategory(
                    mrc_prefix=pref,
                    mrc_label=label,
                    mrc_orientation=orientation,
                    mrc_sort=sort,
                    mrc_created_at=now,
                )
            )
            changed = True
            continue
        # Backfill orientation / normalize prefix+label for known seeds
        if not (row.mrc_orientation or "").strip():
            row.mrc_orientation = orientation
            changed = True
        # Only overwrite orientation for seed labels when still default-ish
        if (row.mrc_label or "").casefold() == label.casefold():
            if (row.mrc_orientation or "square").casefold() not in _VALID_ORIENTATIONS:
                row.mrc_orientation = orientation
                changed = True
            if (row.mrc_prefix or "").casefold() != pref.casefold():
                row.mrc_prefix = pref
                changed = True
    if changed:
        db.commit()


def list_merch_categories(db: Session) -> list[dict]:
    ensure_default_merch_categories(db)
    rows = db.scalars(
        select(MerchCategory).order_by(
            MerchCategory.mrc_sort.asc(), MerchCategory.mrc_id.asc()
        )
    ).all()
    return [_serialize(r) for r in rows]


def create_merch_category(
    db: Session,
    *,
    label: str,
    orientation: str = "square",
    sort: int | None = None,
) -> dict:
    ensure_default_merch_categories(db)
    lab = (label or "").strip()
    if not lab:
        raise ValueError("Category name is required")
    # Accept singular or plural; store plural label
    if not lab.casefold().endswith("s"):
        lab = f"{lab}s"
    pref = prefix_from_label(lab)
    orient = (orientation or "square").strip().casefold()
    if orient not in _VALID_ORIENTATIONS:
        orient = "square"
    clash = db.scalar(
        select(MerchCategory).where(MerchCategory.mrc_prefix.ilike(pref)).limit(1)
    )
    if clash:
        raise ValueError("Category already exists")
    if sort is None:
        max_sort = db.scalar(
            select(MerchCategory.mrc_sort).order_by(MerchCategory.mrc_sort.desc())
        )
        sort = (max_sort or 0) + 10
    row = MerchCategory(
        mrc_prefix=pref,
        mrc_label=lab,
        mrc_orientation=orient,
        mrc_sort=int(sort),
        mrc_created_at=_now_iso(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize(row)


def update_merch_category(
    db: Session,
    category_id: int,
    *,
    label: str | None = None,
    orientation: str | None = None,
    sort: int | None = None,
) -> dict | None:
    row = db.get(MerchCategory, category_id)
    if not row:
        return None
    if label is not None:
        lab = label.strip()
        if not lab:
            raise ValueError("Category name is required")
        if not lab.casefold().endswith("s"):
            lab = f"{lab}s"
        pref = prefix_from_label(lab)
        clash = db.scalar(
            select(MerchCategory)
            .where(
                MerchCategory.mrc_prefix.ilike(pref),
                MerchCategory.mrc_id != category_id,
            )
            .limit(1)
        )
        if clash:
            raise ValueError("Category already exists")
        row.mrc_label = lab
        row.mrc_prefix = pref
    if orientation is not None:
        orient = orientation.strip().casefold()
        if orient not in _VALID_ORIENTATIONS:
            raise ValueError("Invalid orientation")
        row.mrc_orientation = orient
    if sort is not None:
        row.mrc_sort = int(sort)
    db.commit()
    db.refresh(row)
    return _serialize(row)


def delete_merch_category(db: Session, category_id: int) -> bool:
    row = db.get(MerchCategory, category_id)
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def _match_category(
    item_label: str, categories: list[MerchCategory]
) -> MerchCategory | None:
    text = (item_label or "").strip()
    if not text:
        return None
    ranked = sorted(categories, key=lambda c: len(c.mrc_prefix or ""), reverse=True)
    folded = text.casefold()
    for cat in ranked:
        pref = (cat.mrc_prefix or "").strip()
        if not pref:
            continue
        pf = pref.casefold()
        if folded == pf:
            return cat
        if folded.startswith(pf + " -") or folded.startswith(pf + " –"):
            return cat
        if folded.startswith(pf + " "):
            return cat
    return None


def _event_label(date_iso: str | None, venue: str | None, city: str | None) -> str:
    parts: list[str] = []
    if date_iso:
        parts.append(date_iso.replace("-", "."))
    place = (
        ", ".join(p for p in (city, venue) if p)
        if city and venue
        else (venue or city or "")
    )
    if place:
        parts.append(place)
    return " · ".join(parts) if parts else "Show"


def list_merch_items(db: Session) -> dict:
    """Scan all show Souvenirs folders; return categorized image cards only."""
    ensure_default_merch_categories(db)
    categories = list(
        db.scalars(
            select(MerchCategory).order_by(
                MerchCategory.mrc_sort.asc(), MerchCategory.mrc_id.asc()
            )
        ).all()
    )
    root = _media_root()
    items: list[dict] = []
    if not root or not categories:
        return {"categories": [], "items": []}

    shows = db.scalars(
        select(TourShow)
        .where(TourShow.tsh_has_souvenirs == 1)
        .order_by(TourShow.tsh_date_iso.desc())
    ).all()
    if not shows:
        shows = db.scalars(select(TourShow).order_by(TourShow.tsh_date_iso.desc())).all()

    band_cache: dict[int, Band] = {}
    tour_cache: dict[int, Tour] = {}

    for show in shows:
        folder = (show.tsh_folder_path or "").strip()
        if not folder:
            continue
        souvenirs_dir = root / folder / "Souvenirs"
        if not souvenirs_dir.is_dir():
            parent = root / folder
            if parent.is_dir():
                try:
                    for child in parent.iterdir():
                        if child.is_dir() and child.name.casefold() == "souvenirs":
                            souvenirs_dir = child
                            break
                except OSError:
                    continue
            if not souvenirs_dir.is_dir():
                continue

        band = band_cache.get(show.tsh_band_id)
        if band is None:
            band = db.get(Band, show.tsh_band_id)
            if band:
                band_cache[show.tsh_band_id] = band
        if not band:
            continue

        tour = tour_cache.get(show.tsh_tour_id)
        if tour is None:
            tour = db.get(Tour, show.tsh_tour_id)
            if tour:
                tour_cache[show.tsh_tour_id] = tour
        if not tour:
            continue

        media_items = list_show_folder_items(root, folder, "Souvenirs")
        for media in media_items:
            if media.get("kind") != "image":
                continue
            label = (media.get("label") or "").strip()
            cat = _match_category(label, categories)
            if not cat:
                continue
            url = media.get("url")
            if not url:
                continue

            t_slug = tour_slug(tour.tur_date_iso, tour.tur_title)
            s_slug = show_slug(show.tsh_date_iso, show.tsh_city, show.tsh_venue)
            items.append(
                {
                    "id": f"{show.tsh_id}:{media.get('id')}",
                    "label": label,
                    "url": url,
                    "back_url": media.get("back_url"),
                    "has_back": bool(media.get("has_back")),
                    "category_id": cat.mrc_id,
                    "category_prefix": cat.mrc_prefix,
                    "category_label": cat.mrc_label,
                    "orientation": (cat.mrc_orientation or "square").casefold(),
                    "band_id": band.bnd_id,
                    "band_name": band.bnd_name or "Artist",
                    "logo_url": tour.tur_logo_url,
                    "tour_id": tour.tur_id,
                    "tour_slug": t_slug,
                    "tour_title": tour.tur_title,
                    "show_id": show.tsh_id,
                    "show_slug": s_slug,
                    "date_iso": show.tsh_date_iso,
                    "venue": show.tsh_venue,
                    "city": show.tsh_city,
                    "event_label": _event_label(
                        show.tsh_date_iso, show.tsh_venue, show.tsh_city
                    ),
                }
            )

    from collections import defaultdict

    items.sort(
        key=lambda it: (
            it.get("date_iso") or "",
            (it.get("label") or "").casefold(),
        ),
        reverse=True,
    )
    by_date: dict[str, list[dict]] = defaultdict(list)
    order: list[str] = []
    for it in items:
        key = it.get("date_iso") or ""
        if key not in by_date:
            order.append(key)
        by_date[key].append(it)
    fixed: list[dict] = []
    for key in order:
        chunk = by_date[key]
        chunk.sort(key=lambda it: (it.get("label") or "").casefold())
        fixed.extend(chunk)
    items = fixed

    counts: dict[int, int] = {}
    for it in items:
        cid = int(it["category_id"])
        counts[cid] = counts.get(cid, 0) + 1
    cat_out = [
        _serialize(c, count=counts.get(c.mrc_id, 0))
        for c in categories
        if counts.get(c.mrc_id, 0) > 0
    ]
    cat_out.sort(key=lambda c: (-int(c["count"]), str(c["label"]).casefold()))

    return {"categories": cat_out, "items": items}
