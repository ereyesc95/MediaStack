"""Preserve admin About edits across TMDb / Google Books refreshes.

User-saved fields are sticky: a refresh may fill empty slots and update
uncustomized TMDb data, but must never overwrite a field the user saved.
"""
from __future__ import annotations

# Logical groups → concrete blob keys (movies films use overview; books use bio).
FIELD_GROUPS: dict[str, tuple[str, ...]] = {
    "overview": ("overview", "bio"),
    "genres": ("genres",),
    "writers": ("writers", "authors"),
    "directors": ("directors",),
    "publishers": ("publishers",),
    "languages": ("languages", "original_language", "origin_language"),
    "country": (
        "country_id",
        "country_iso",
        "country_name",
        "origin_countries",
        "country",
    ),
    "activity": ("activity_periods", "release_date"),
}

_LEGACY_FLAGS = {
    "bio_manual": "overview",
    "overview_manual": "overview",
    "genres_manual": "genres",
    "writers_manual": "writers",
    "directors_manual": "directors",
    "publishers_manual": "publishers",
    "languages_manual": "languages",
    "country_manual": "country",
    "activity_manual": "activity",
}


def _manual_groups(blob: dict | None) -> set[str]:
    if not isinstance(blob, dict):
        return set()
    groups: set[str] = set()
    raw = blob.get("manual_fields")
    if isinstance(raw, list):
        for item in raw:
            name = str(item).strip()
            if name:
                groups.add(name)
    about = blob.get("about_manual")
    if isinstance(about, dict):
        for key, flag in about.items():
            if flag:
                groups.add(str(key).strip())
    for flag, group in _LEGACY_FLAGS.items():
        if blob.get(flag):
            groups.add(group)
    return {g for g in groups if g}


def is_manual(blob: dict | None, group: str) -> bool:
    return group in _manual_groups(blob)


def mark_manual(blob: dict, *groups: str) -> None:
    """Record that the given About groups were saved by the user."""
    current = _manual_groups(blob)
    for group in groups:
        name = (group or "").strip()
        if name:
            current.add(name)
            blob[f"{name}_manual"] = True
            if name == "overview":
                blob["bio_manual"] = True
                blob["overview_manual"] = True
    blob["manual_fields"] = sorted(current)
    about = blob.get("about_manual")
    if not isinstance(about, dict):
        about = {}
    for group in current:
        about[group] = True
    blob["about_manual"] = about


def preserve_manual_about(existing: dict | None, incoming: dict) -> dict:
    """Copy user-pinned About fields from ``existing`` onto a refreshed blob."""
    out = dict(incoming)
    if not isinstance(existing, dict) or not existing:
        return out
    groups = _manual_groups(existing)
    for group in groups:
        for key in FIELD_GROUPS.get(group, (group,)):
            if key in existing:
                out[key] = existing[key]
    out["manual_fields"] = sorted(groups)
    about = existing.get("about_manual")
    if isinstance(about, dict):
        out["about_manual"] = dict(about)
    for flag, group in _LEGACY_FLAGS.items():
        if group in groups or existing.get(flag):
            out[flag] = True
    return out
