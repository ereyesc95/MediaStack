"""Excel import/export for HobbyStack collections (universal sheet)."""
from __future__ import annotations

import io
import re
from typing import BinaryIO

from openpyxl import Workbook, load_workbook
from sqlalchemy.orm import Session

from app.hobbies import (
    get_collection,
    list_items,
    serialize_item,
    upsert_item,
)

# Universal headers — extra columns ignored per preset at import time
HEADERS = (
    "TITLE",
    "YEAR",
    "BRAND",
    "THEME",
    "TYPE",
    "CATEGORY",
    "SIZE",
    "PIECES",
    "STYLE",
    "NUMBER",
    "TOTAL",
    "BOX SIZE",
    "MISSING",
    "DUPLICATES",
    "IMAGE URL",
    "SHOP URL",
    "TUTORIAL URL",
    "NOTES",
)

_HEADER_MAP = {
    "title": "title",
    "year": "year",
    "brand": "brand",
    "theme": "theme",
    "type": "type",
    "category": "category",
    "size": "size",
    "pieces": "size",  # puzzle piece count → size
    "style": "style",
    "quantity": "quantity",
    "number": "quantity",
    "total": "total_slots",
    "total slots": "total_slots",
    "totalslots": "total_slots",
    "slots": "total_slots",
    "box size": "box_size",
    "boxsize": "box_size",
    "missing": "missing",
    "duplicates": "duplicates",
    "image url": "image_url",
    "imageurl": "image_url",
    "shop url": "shop_url",
    "shopurl": "shop_url",
    "tutorial url": "tutorial_url",
    "tutorialurl": "tutorial_url",
    "notes": "notes",
}


def _split_tags(raw: object | None) -> list[str]:
    if raw is None:
        return []
    text = str(raw).strip()
    if not text:
        return []
    parts: list[str] = []
    for line in text.replace("\r", "").split("\n"):
        for piece in re.split(r"[,|;]+", line):
            p = piece.strip()
            if p:
                parts.append(p)
    out: list[str] = []
    seen: set[str] = set()
    for p in parts:
        key = p.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def _cell(row: dict, *keys: str) -> str | None:
    for k in keys:
        if k in row and row[k] is not None and str(row[k]).strip() != "":
            return str(row[k]).strip()
    return None


def export_hobbies_xlsx(db: Session, user_id: int, collection_id: int) -> bytes:
    items = list_items(db, user_id, collection_id, sort="title", order="asc")
    wb = Workbook()
    ws = wb.active
    ws.title = "Items"
    ws.append(list(HEADERS))
    for it in items:
        ws.append(
            [
                it.get("title"),
                it.get("year"),
                it.get("brand"),
                it.get("theme"),
                it.get("type"),
                it.get("category"),
                it.get("size"),
                it.get("size"),  # PIECES (puzzle) — same backing field as SIZE
                it.get("style"),
                it.get("quantity"),
                it.get("total_slots"),
                it.get("box_size"),
                ", ".join(it.get("missing") or []) or None,
                ", ".join(it.get("duplicates") or []) or None,
                it.get("image_url"),
                it.get("shop_url"),
                it.get("tutorial_url"),
                it.get("notes"),
            ]
        )
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def template_hobbies_xlsx() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Items"
    ws.append(list(HEADERS))
    # Example row
    ws.append(
        [
            "Example title",
            2018,
            "Brand",
            "Theme",
            "Type",
            "Category",
            "Size",
            "1000",
            "Style",
            1,
            100,
            "70×50 cm",
            "1, 2, Messi",
            "12",
            "https://example.com/image.jpg",
            "https://example.com/shop",
            "https://example.com/tutorial",
            "Notes",
        ]
    )
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def preview_import(file: BinaryIO) -> dict:
    wb = load_workbook(file, read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    try:
        header_row = next(rows_iter)
    except StopIteration:
        return {"ok": False, "error": "Empty workbook", "rows": []}
    headers: list[str] = []
    for h in header_row:
        key = re.sub(r"\s+", " ", str(h or "").strip()).casefold()
        headers.append(_HEADER_MAP.get(key.replace(" ", ""), _HEADER_MAP.get(key, "")))
    preview_rows: list[dict] = []
    for raw in rows_iter:
        if raw is None or all(c is None or str(c).strip() == "" for c in raw):
            continue
        mapped: dict = {}
        for i, h in enumerate(headers):
            if not h or i >= len(raw):
                continue
            mapped[h] = raw[i]
        body = _row_to_body(mapped)
        if not any(
            body.get(k)
            for k in (
                "title",
                "type",
                "style",
                "size",
                "theme",
                "brand",
                "category",
            )
        ):
            continue
        preview_rows.append(body)
    return {"ok": True, "rows": preview_rows, "count": len(preview_rows)}


def _row_to_body(mapped: dict) -> dict:
    qty_raw = mapped.get("quantity")
    try:
        qty = int(qty_raw) if qty_raw is not None and str(qty_raw).strip() != "" else 1
    except (TypeError, ValueError):
        qty = 1
    slots_raw = mapped.get("total_slots")
    try:
        slots = (
            int(slots_raw)
            if slots_raw is not None and str(slots_raw).strip() != ""
            else None
        )
    except (TypeError, ValueError):
        slots = None
    year_raw = mapped.get("year")
    try:
        year = (
            int(str(year_raw).strip()[:4])
            if year_raw is not None and str(year_raw).strip() != ""
            else None
        )
    except (TypeError, ValueError):
        year = None
    if year is not None and not (1000 <= year <= 9999):
        year = None
    return {
        "title": _cell(mapped, "title"),
        "year": year,
        "brand": _cell(mapped, "brand"),
        "theme": _cell(mapped, "theme"),
        "type": _cell(mapped, "type"),
        "category": _cell(mapped, "category"),
        "size": _cell(mapped, "size", "pieces"),
        "style": _cell(mapped, "style"),
        "quantity": qty,
        "total_slots": slots,
        "box_size": _cell(mapped, "box_size"),
        "missing": _split_tags(mapped.get("missing")),
        "duplicates": _split_tags(mapped.get("duplicates")),
        "image_url": _cell(mapped, "image_url"),
        "shop_url": _cell(mapped, "shop_url"),
        "tutorial_url": _cell(mapped, "tutorial_url"),
        "notes": _cell(mapped, "notes"),
    }


def commit_import(
    db: Session, user_id: int, collection_id: int, rows: list[dict]
) -> dict:
    coll = get_collection(db, user_id, collection_id)
    if not coll:
        raise ValueError("Collection not found")
    created = 0
    updated = 0
    for raw in rows:
        body = _row_to_body(raw) if "title" in raw or "TYPE" in raw else raw
        # Normalize if already body-shaped
        if "MISSING" in raw or "Title" in raw:
            body = _row_to_body({k.casefold().replace(" ", "_"): v for k, v in raw.items()})
        result = upsert_item(db, user_id, collection_id, body)
        if result.get("deleted"):
            continue
        if result.get("id"):
            created += 1
        else:
            updated += 1
    return {"ok": True, "created": created, "updated": updated, "total": created + updated}
