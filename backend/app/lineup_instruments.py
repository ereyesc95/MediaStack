"""Map MusicBrainz relationship attributes to local instrument IDs."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Instrument

# MB attribute substring -> instrument insID (from legacy seed data).
ATTR_TO_INSTRUMENT_ID: dict[str, int] = {
    "lead vocals": 1016,
    "vocals": 1016,
    "vocal": 1016,
    "guitar": 419,
    "bass guitar": 313,
    "double bass": 380,
    "bass": 965,
    "drums": 703,
    "drum": 703,
    "keyboard": 938,
    "keyboards": 938,
    "piano": 511,
}

_name_cache: dict[str, int] | None = None


def _build_name_cache(db: Session) -> dict[str, int]:
    global _name_cache
    if _name_cache is not None:
        return _name_cache
    mapping: dict[str, int] = {}
    for row in db.scalars(select(Instrument)).all():
        if row.ins_name and row.ins_id is not None:
            mapping[row.ins_name.strip().lower()] = row.ins_id
    _name_cache = mapping
    return mapping


def _normalize_attr(attr: str) -> str:
    key = (attr or "").strip().lower()
    if "(" in key:
        key = key.split("(", 1)[0].strip()
    return key


def map_mb_attributes(db: Session, attributes: list[str] | None) -> tuple[list[int], list[str]]:
    """Return (instrument ids, display labels)."""
    if not attributes:
        return [], []
    name_cache = _build_name_cache(db)
    ids: list[int] = []
    labels: list[str] = []
    seen: set[str] = set()
    for attr in attributes:
        raw = (attr or "").strip()
        if not raw or raw.lower() == "original":
            continue
        key = _normalize_attr(raw)
        if not key or key in seen:
            continue
        seen.add(key)
        display = raw.split("(", 1)[0].strip()
        if display.lower() == "double bass":
            display = "Double Bass"
        elif display.lower() == "lead vocals":
            display = "Lead Vocals"
        else:
            display = display.title() if display.islower() else display
        labels.append(display)
        iid = ATTR_TO_INSTRUMENT_ID.get(key) or name_cache.get(key)
        if iid and iid not in ids:
            ids.append(iid)
    return ids, labels


INSTRUMENT_ID_LABELS: dict[int, str] = {
    1016: "Lead Vocals",
    419: "Guitar",
    313: "Bass Guitar",
    380: "Double Bass",
    965: "Bass",
    703: "Drums",
    938: "Keyboards",
    511: "Piano",
}


def instrument_label(db: Session, instrument_id: int) -> str | None:
    row = db.get(Instrument, instrument_id)
    if row and row.ins_name:
        return row.ins_name.strip()
    return INSTRUMENT_ID_LABELS.get(instrument_id)


INSTRUMENT_TYPE_NAMES: dict[int, str] = {
    0: "Winds",
    1: "Strings",
    2: "Percussion",
    3: "Electronic",
    4: "Other",
    5: "Ensemble",
    6: "Family",
    7: "Vocals",
}

COMMON_INSTRUMENT_IDS: tuple[int, ...] = (
    1016,
    419,
    313,
    380,
    965,
    703,
    938,
    511,
)


def _instrument_type_id(raw: str | None) -> int:
    if not raw:
        return 4
    part = raw.replace(";", ",").split(",")[0].strip()
    try:
        return int(part)
    except ValueError:
        return 4


def _fallback_instrument_catalog() -> list[dict]:
    """Built-in catalog when the instruments table is empty (SQLite without seed)."""
    catalog: list[tuple[int, str, str]] = [
        (1016, "Lead Vocals", "Common"),
        (1016, "Vocals", "Common"),
        (419, "Guitar", "Common"),
        (286, "Acoustic Guitar", "Common"),
        (389, "Electric Guitar", "Common"),
        (313, "Bass Guitar", "Common"),
        (380, "Double Bass", "Common"),
        (965, "Bass", "Common"),
        (703, "Drums", "Common"),
        (938, "Keyboards", "Common"),
        (511, "Piano", "Common"),
        (8, "Alto Saxophone", "Winds"),
        (31, "Bassoon", "Winds"),
        (6, "Alto Clarinet", "Winds"),
        (21, "Bass Clarinet", "Winds"),
        (282, "12 String Guitar", "Strings"),
        (350, "Classical Guitar", "Strings"),
        (310, "Baritone Guitar", "Strings"),
        (385, "Electric Bass Guitar", "Strings"),
        (27, "Bass Trombone", "Winds"),
        (16, "Baritone Horn", "Winds"),
        (3, "Accordion", "Other"),
        (13, "Bagpipe", "Other"),
    ]
    seen: set[tuple[int, str]] = set()
    groups: dict[str, list[dict]] = {}
    for iid, name, group in catalog:
        key = (iid, name.lower())
        if key in seen:
            continue
        seen.add(key)
        groups.setdefault(group, []).append({"id": iid, "name": name})
    out: list[dict] = []
    if "Common" in groups:
        out.append({"type": "Common", "items": groups.pop("Common")})
    for type_name in sorted(groups.keys(), key=str.lower):
        out.append({"type": type_name, "items": groups[type_name]})
    return out


def instrument_filter_options(db: Session) -> list[dict]:
    rows = list(db.scalars(select(Instrument).order_by(Instrument.ins_name)).all())
    if not rows:
        return _fallback_instrument_catalog()

    by_id = {r.ins_id: r for r in rows if r.ins_id is not None and r.ins_name}
    common_items: list[dict] = []
    seen_common: set[int] = set()
    for iid in COMMON_INSTRUMENT_IDS:
        row = by_id.get(iid)
        if row:
            common_items.append({"id": row.ins_id, "name": row.ins_name.strip()})
            seen_common.add(iid)

    by_type: dict[str, list[dict]] = {}
    for row in rows:
        if not row.ins_id or not row.ins_name:
            continue
        if row.ins_id in seen_common:
            continue
        type_name = INSTRUMENT_TYPE_NAMES.get(
            _instrument_type_id(row.ins_fk_instrumenttypes), "Other"
        )
        by_type.setdefault(type_name, []).append(
            {"id": row.ins_id, "name": row.ins_name.strip()}
        )

    groups: list[dict] = []
    if common_items:
        groups.append({"type": "Common", "items": common_items})
    for type_name in sorted(by_type.keys(), key=str.lower):
        items = sorted(by_type[type_name], key=lambda x: x["name"].lower())
        groups.append({"type": type_name, "items": items})
    return groups if groups else _fallback_instrument_catalog()
