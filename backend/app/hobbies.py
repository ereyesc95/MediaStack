"""HobbyStack — per-profile collections with a shared optional field bag + presets."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import HobbyCollection, HobbyFieldOption, HobbyItem
from app.paths import ASSETS_DIR, ensure_assets_dir

PRESETS = (
    "generic",
    "marbles",
    "puzzle",
    "cube",
    "uno",
    "poker",
    "fillable_album",
)

PRESET_LABELS = {
    "marbles": "Marbles",
    "puzzle": "Puzzle",
    "cube": "Rubik / Cube",
    "uno": "Uno",
    "poker": "Poker",
    "fillable_album": "Fillable album",
    "generic": "General",
}

# Columns shown per preset (shared bag; unused stay null)
PRESET_FIELDS: dict[str, tuple[str, ...]] = {
    "marbles": ("type", "size", "style", "quantity", "image"),
    "puzzle": ("title", "brand", "theme", "box_size", "image", "shop_url"),
    "cube": ("title", "brand", "category", "image", "shop_url", "tutorial_url"),
    "uno": ("title", "brand", "theme", "image", "shop_url"),
    "poker": ("title", "brand", "theme", "type", "image", "shop_url"),
    "fillable_album": (
        "title",
        "brand",
        "theme",
        "type",
        "total_slots",
        "missing",
        "duplicates",
        "image",
        "shop_url",
    ),
    "generic": (
        "title",
        "brand",
        "theme",
        "type",
        "category",
        "size",
        "style",
        "quantity",
        "total_slots",
        "box_size",
        "missing",
        "duplicates",
        "image",
        "shop_url",
        "tutorial_url",
        "notes",
    ),
}

DEFAULT_MARBLE_STYLES = (
    "confetti",
    "swirl",
    "tile swirl",
    "black",
    "milky",
    "tiger",
    "cat's eye",
    "corkscrew",
    "oily",
    "solid",
    "iridescent",
    "patch",
    "game",
    "opaque",
    "slag",
    "agate",
    "clear",
)

_SAFE_NAME_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]+')


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _json_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return [str(x).strip() for x in data if str(x).strip()]
    return []


def _dump_list(items: list[str] | None) -> str | None:
    cleaned = [str(x).strip() for x in (items or []) if str(x).strip()]
    return json.dumps(cleaned, ensure_ascii=False) if cleaned else None


def collectibles_dir() -> Path:
    ensure_assets_dir()
    path = ASSETS_DIR / "collectibles"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_filename(name: str) -> str:
    cleaned = _SAFE_NAME_RE.sub(" ", (name or "").strip()).strip(" .")
    return cleaned or "item"


def icon_url(path: str | None) -> str | None:
    if not path:
        return None
    name = Path(path).name
    return f"/api/assets/collectibles/{name}"


def item_image_url(local_path: str | None, remote_url: str | None) -> str | None:
    if local_path:
        return icon_url(local_path)
    return (remote_url or "").strip() or None


def serialize_collection(row: HobbyCollection, *, item_count: int = 0) -> dict:
    return {
        "id": row.hbc_id,
        "name": row.hbc_name,
        "preset": row.hbc_preset,
        "preset_label": PRESET_LABELS.get(row.hbc_preset, row.hbc_preset),
        "fields": list(PRESET_FIELDS.get(row.hbc_preset, PRESET_FIELDS["generic"])),
        "icon_url": icon_url(row.hbc_icon_path)
        or "/api/assets/media/hobbies",
        "icon_path": row.hbc_icon_path,
        "item_count": item_count,
        "created_at": row.hbc_created_at,
        "updated_at": row.hbc_updated_at,
    }


def serialize_item(row: HobbyItem, preset: str) -> dict:
    missing = _json_list(row.hbi_missing_json)
    duplicates = _json_list(row.hbi_duplicates_json)
    total_slots = row.hbi_total_slots
    items_collected = None
    missing_count = None
    completion_pct = None
    if total_slots is not None and total_slots >= 0:
        missing_count = len(missing)
        items_collected = max(0, int(total_slots) - missing_count)
        completion_pct = (
            round(100.0 * items_collected / total_slots, 1) if total_slots > 0 else 0.0
        )
    return {
        "id": row.hbi_id,
        "collection_id": row.hbi_collection_id,
        "title": row.hbi_title,
        "brand": row.hbi_brand,
        "theme": row.hbi_theme,
        "type": row.hbi_type,
        "category": row.hbi_category,
        "size": row.hbi_size,
        "style": row.hbi_style,
        "quantity": row.hbi_quantity if row.hbi_quantity is not None else 1,
        "total_slots": total_slots,
        "items_collected": items_collected,
        "missing_count": missing_count,
        "completion_pct": completion_pct,
        "box_size": row.hbi_box_size,
        "missing": missing,
        "duplicates": duplicates,
        "image_path": row.hbi_image_path,
        "image_url": row.hbi_image_url,
        "image": item_image_url(row.hbi_image_path, row.hbi_image_url),
        "shop_url": row.hbi_shop_url,
        "tutorial_url": row.hbi_tutorial_url,
        "notes": row.hbi_notes,
        "preset": preset,
        "created_at": row.hbi_created_at,
        "updated_at": row.hbi_updated_at,
    }


def list_presets() -> list[dict]:
    return [
        {
            "id": p,
            "label": PRESET_LABELS[p],
            "fields": list(PRESET_FIELDS[p]),
        }
        for p in PRESETS
    ]


def list_collections(db: Session, user_id: int) -> list[dict]:
    rows = db.scalars(
        select(HobbyCollection)
        .where(HobbyCollection.hbc_user_id == user_id)
        .order_by(HobbyCollection.hbc_name.asc())
    ).all()
    out: list[dict] = []
    for row in rows:
        n = len(
            db.scalars(
                select(HobbyItem).where(HobbyItem.hbi_collection_id == row.hbc_id)
            ).all()
        )
        out.append(serialize_collection(row, item_count=n))
    return out


def get_collection(db: Session, user_id: int, collection_id: int) -> HobbyCollection | None:
    row = db.get(HobbyCollection, collection_id)
    if not row or row.hbc_user_id != user_id:
        return None
    return row


def create_collection(
    db: Session,
    user_id: int,
    *,
    name: str,
    preset: str,
    icon_path: str | None = None,
) -> dict:
    title = (name or "").strip()
    if not title:
        raise ValueError("Name is required")
    preset_key = (preset or "generic").strip().casefold()
    if preset_key not in PRESETS:
        raise ValueError("Unknown preset")
    now = _now_iso()
    row = HobbyCollection(
        hbc_user_id=user_id,
        hbc_name=title,
        hbc_preset=preset_key,
        hbc_icon_path=icon_path,
        hbc_created_at=now,
        hbc_updated_at=now,
    )
    db.add(row)
    db.flush()
    if preset_key == "marbles":
        _seed_marble_styles(db, user_id, row.hbc_id)
    db.commit()
    db.refresh(row)
    return serialize_collection(row, item_count=0)


def update_collection(
    db: Session,
    user_id: int,
    collection_id: int,
    *,
    name: str | None = None,
    icon_path: str | None = None,
    clear_icon: bool = False,
) -> dict | None:
    row = get_collection(db, user_id, collection_id)
    if not row:
        return None
    if name is not None:
        title = name.strip()
        if not title:
            raise ValueError("Name is required")
        row.hbc_name = title
    if clear_icon:
        row.hbc_icon_path = None
    elif icon_path is not None:
        row.hbc_icon_path = icon_path
    row.hbc_updated_at = _now_iso()
    db.commit()
    db.refresh(row)
    n = len(
        db.scalars(select(HobbyItem).where(HobbyItem.hbi_collection_id == row.hbc_id)).all()
    )
    return serialize_collection(row, item_count=n)


def delete_collection(db: Session, user_id: int, collection_id: int) -> bool:
    row = get_collection(db, user_id, collection_id)
    if not row:
        return False
    items = db.scalars(
        select(HobbyItem).where(HobbyItem.hbi_collection_id == collection_id)
    ).all()
    for it in items:
        _delete_asset_file(it.hbi_image_path)
        db.delete(it)
    opts = db.scalars(
        select(HobbyFieldOption).where(HobbyFieldOption.hfo_collection_id == collection_id)
    ).all()
    for opt in opts:
        db.delete(opt)
    _delete_asset_file(row.hbc_icon_path)
    db.delete(row)
    db.commit()
    return True


def _delete_asset_file(rel: str | None) -> None:
    if not rel:
        return
    path = Path(rel)
    if not path.is_file():
        # stored as filename under collectibles
        cand = collectibles_dir() / Path(rel).name
        if cand.is_file():
            path = cand
        else:
            return
    try:
        path.unlink()
    except OSError:
        pass


def save_uploaded_image(
    *,
    collection_name: str,
    stem: str,
    data: bytes,
    ext: str,
) -> str:
    """Write under assets/collectibles/; return stored filename."""
    folder = collectibles_dir()
    safe_coll = _safe_filename(collection_name)
    safe_stem = _safe_filename(stem)
    suffix = ext if ext.startswith(".") else f".{ext}"
    if suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}:
        suffix = ".png"
    filename = f"{safe_coll} - {safe_stem}{suffix.lower()}"
    dest = folder / filename
    dest.write_bytes(data)
    return filename


def list_items(
    db: Session,
    user_id: int,
    collection_id: int,
    *,
    q: str | None = None,
    type_filter: str | None = None,
    size_filter: str | None = None,
    style_filter: str | None = None,
    theme_filter: str | None = None,
    category_filter: str | None = None,
    sort: str = "title",
    order: str = "asc",
) -> list[dict]:
    coll = get_collection(db, user_id, collection_id)
    if not coll:
        return []
    rows = db.scalars(
        select(HobbyItem).where(
            HobbyItem.hbi_collection_id == collection_id,
            HobbyItem.hbi_user_id == user_id,
        )
    ).all()
    qf = (q or "").strip().casefold()
    out: list[dict] = []
    for row in rows:
        if type_filter and (row.hbi_type or "").casefold() != type_filter.casefold():
            continue
        if size_filter and (row.hbi_size or "").casefold() != size_filter.casefold():
            continue
        if style_filter and (row.hbi_style or "").casefold() != style_filter.casefold():
            continue
        if theme_filter and (row.hbi_theme or "").casefold() != theme_filter.casefold():
            continue
        if category_filter and (row.hbi_category or "").casefold() != category_filter.casefold():
            continue
        ser = serialize_item(row, coll.hbc_preset)
        if qf:
            hay = " ".join(
                str(ser.get(k) or "")
                for k in (
                    "title",
                    "brand",
                    "theme",
                    "type",
                    "category",
                    "size",
                    "style",
                    "box_size",
                    "notes",
                )
            ).casefold()
            if qf not in hay:
                continue
        out.append(ser)

    reverse = order.casefold() == "desc"
    sort_key = (sort or "title").casefold()

    def key_fn(it: dict):
        if sort_key == "quantity":
            return it.get("quantity") or 0
        if sort_key == "completion":
            return it.get("completion_pct") if it.get("completion_pct") is not None else -1
        if sort_key in it:
            val = it.get(sort_key)
            if isinstance(val, (int, float)):
                return val
            return (val or "").casefold()
        return (it.get("title") or "").casefold()

    out.sort(key=key_fn, reverse=reverse)
    return out


def _find_marble_batch(
    db: Session,
    collection_id: int,
    user_id: int,
    *,
    type_v: str | None,
    size_v: str | None,
    style_v: str | None,
) -> HobbyItem | None:
    rows = db.scalars(
        select(HobbyItem).where(
            HobbyItem.hbi_collection_id == collection_id,
            HobbyItem.hbi_user_id == user_id,
        )
    ).all()
    for row in rows:
        if (row.hbi_type or "").casefold() != (type_v or "").casefold():
            continue
        if (row.hbi_size or "").casefold() != (size_v or "").casefold():
            continue
        if (row.hbi_style or "").casefold() != (style_v or "").casefold():
            continue
        return row
    return None


def upsert_item(
    db: Session,
    user_id: int,
    collection_id: int,
    body: dict,
    *,
    item_id: int | None = None,
) -> dict:
    coll = get_collection(db, user_id, collection_id)
    if not coll:
        raise ValueError("Collection not found")

    qty = body.get("quantity")
    try:
        qty_i = int(qty) if qty is not None else 1
    except (TypeError, ValueError):
        qty_i = 1

    # Marbles: merge into existing type/size/style batch
    if coll.hbc_preset == "marbles" and item_id is None:
        existing = _find_marble_batch(
            db,
            collection_id,
            user_id,
            type_v=body.get("type"),
            size_v=body.get("size"),
            style_v=body.get("style"),
        )
        if existing:
            existing.hbi_quantity = (existing.hbi_quantity or 0) + max(qty_i, 1)
            if body.get("image_path"):
                existing.hbi_image_path = body["image_path"]
            if body.get("image_url") is not None:
                existing.hbi_image_url = body.get("image_url") or None
            existing.hbi_updated_at = _now_iso()
            _remember_field_values(db, user_id, collection_id, body)
            db.commit()
            db.refresh(existing)
            return serialize_item(existing, coll.hbc_preset)

    row: HobbyItem | None = None
    if item_id is not None:
        row = db.get(HobbyItem, item_id)
        if not row or row.hbi_user_id != user_id or row.hbi_collection_id != collection_id:
            raise ValueError("Item not found")

    now = _now_iso()
    if row is None:
        row = HobbyItem(
            hbi_collection_id=collection_id,
            hbi_user_id=user_id,
            hbi_quantity=max(qty_i, 1),
            hbi_created_at=now,
            hbi_updated_at=now,
        )
        db.add(row)
    else:
        row.hbi_updated_at = now
        if qty is not None:
            row.hbi_quantity = max(qty_i, 0)

    for attr, key in (
        ("hbi_title", "title"),
        ("hbi_brand", "brand"),
        ("hbi_theme", "theme"),
        ("hbi_type", "type"),
        ("hbi_category", "category"),
        ("hbi_size", "size"),
        ("hbi_style", "style"),
        ("hbi_box_size", "box_size"),
        ("hbi_image_url", "image_url"),
        ("hbi_shop_url", "shop_url"),
        ("hbi_tutorial_url", "tutorial_url"),
        ("hbi_notes", "notes"),
    ):
        if key in body:
            val = body.get(key)
            setattr(row, attr, (str(val).strip() if val is not None else None) or None)

    if "image_path" in body:
        row.hbi_image_path = body.get("image_path") or None
    if "total_slots" in body:
        ts = body.get("total_slots")
        try:
            row.hbi_total_slots = int(ts) if ts is not None and str(ts).strip() != "" else None
        except (TypeError, ValueError):
            row.hbi_total_slots = None
    if "missing" in body:
        row.hbi_missing_json = _dump_list(body.get("missing") or [])
    if "duplicates" in body:
        row.hbi_duplicates_json = _dump_list(body.get("duplicates") or [])

    # Qty 0 → delete (marbles decrement path)
    if row.hbi_quantity is not None and int(row.hbi_quantity) <= 0:
        _delete_asset_file(row.hbi_image_path)
        db.delete(row)
        db.commit()
        return {"deleted": True, "id": item_id}

    _remember_field_values(db, user_id, collection_id, body)
    db.commit()
    db.refresh(row)
    return serialize_item(row, coll.hbc_preset)


def adjust_quantity(
    db: Session, user_id: int, collection_id: int, item_id: int, delta: int
) -> dict:
    row = db.get(HobbyItem, item_id)
    if not row or row.hbi_user_id != user_id or row.hbi_collection_id != collection_id:
        raise ValueError("Item not found")
    coll = get_collection(db, user_id, collection_id)
    if not coll:
        raise ValueError("Collection not found")
    new_qty = (row.hbi_quantity or 0) + int(delta)
    if new_qty <= 0:
        _delete_asset_file(row.hbi_image_path)
        db.delete(row)
        db.commit()
        return {"deleted": True, "id": item_id}
    row.hbi_quantity = new_qty
    row.hbi_updated_at = _now_iso()
    db.commit()
    db.refresh(row)
    return serialize_item(row, coll.hbc_preset)


def delete_item(db: Session, user_id: int, collection_id: int, item_id: int) -> bool:
    row = db.get(HobbyItem, item_id)
    if not row or row.hbi_user_id != user_id or row.hbi_collection_id != collection_id:
        return False
    _delete_asset_file(row.hbi_image_path)
    db.delete(row)
    db.commit()
    return True


def delete_items(
    db: Session, user_id: int, collection_id: int, item_ids: list[int]
) -> int:
    n = 0
    for iid in item_ids:
        if delete_item(db, user_id, collection_id, iid):
            n += 1
    return n


def _seed_marble_styles(db: Session, user_id: int, collection_id: int) -> None:
    now = _now_iso()
    for style in DEFAULT_MARBLE_STYLES:
        db.add(
            HobbyFieldOption(
                hfo_user_id=user_id,
                hfo_collection_id=collection_id,
                hfo_field="style",
                hfo_value=style,
                hfo_created_at=now,
            )
        )


def _remember_field_values(
    db: Session, user_id: int, collection_id: int, body: dict
) -> None:
    now = _now_iso()
    for field in ("type", "size", "style", "theme", "category", "brand"):
        raw = body.get(field)
        if not raw or not str(raw).strip():
            continue
        val = str(raw).strip()
        exists = db.scalar(
            select(HobbyFieldOption)
            .where(
                HobbyFieldOption.hfo_user_id == user_id,
                HobbyFieldOption.hfo_collection_id == collection_id,
                HobbyFieldOption.hfo_field == field,
                HobbyFieldOption.hfo_value.ilike(val),
            )
            .limit(1)
        )
        if exists:
            continue
        db.add(
            HobbyFieldOption(
                hfo_user_id=user_id,
                hfo_collection_id=collection_id,
                hfo_field=field,
                hfo_value=val,
                hfo_created_at=now,
            )
        )


def list_field_options(
    db: Session, user_id: int, collection_id: int, field: str
) -> list[str]:
    rows = db.scalars(
        select(HobbyFieldOption)
        .where(
            HobbyFieldOption.hfo_user_id == user_id,
            HobbyFieldOption.hfo_collection_id == collection_id,
            HobbyFieldOption.hfo_field == field,
        )
        .order_by(HobbyFieldOption.hfo_value.asc())
    ).all()
    # Dedupe casefold preserving first casing
    out: list[str] = []
    seen: set[str] = set()
    for r in rows:
        key = (r.hfo_value or "").casefold()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(r.hfo_value)
    return out


def add_field_option(
    db: Session, user_id: int, collection_id: int, field: str, value: str
) -> list[str]:
    coll = get_collection(db, user_id, collection_id)
    if not coll:
        raise ValueError("Collection not found")
    val = (value or "").strip()
    if not val:
        raise ValueError("Value is required")
    field_key = (field or "").strip().casefold()
    if field_key not in {"type", "size", "style", "theme", "category", "brand"}:
        raise ValueError("Unsupported field")
    _remember_field_values(db, user_id, collection_id, {field_key: val})
    db.commit()
    return list_field_options(db, user_id, collection_id, field_key)


def store_icon_file(collection_name: str, data: bytes, ext: str) -> str:
    return save_uploaded_image(
        collection_name="Icon",
        stem=collection_name,
        data=data,
        ext=ext,
    )


def copy_local_path_into_collectibles(
    src: Path, *, collection_name: str, stem: str
) -> str:
    if not src.is_file():
        raise ValueError("Source file not found")
    data = src.read_bytes()
    return save_uploaded_image(
        collection_name=collection_name,
        stem=stem,
        data=data,
        ext=src.suffix or ".png",
    )
