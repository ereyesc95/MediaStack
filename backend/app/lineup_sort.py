"""Lineup display order: vocals first, then guitar, bass, drums, other."""
from __future__ import annotations

from app.music_filters import VOCALS_INSTRUMENT_ID

# Lower rank = earlier in grid.
ROLE_RANK_BY_ID: dict[int, int] = {
    VOCALS_INSTRUMENT_ID: 0,  # Lead Vocals
    1016: 0,
    419: 1,  # Guitar
    313: 2,  # Bass Guitar
    380: 2,  # Double Bass
    965: 2,  # Bass
    703: 3,  # Drums
    938: 3,  # Keyboard (with drums tier for rock bands)
    511: 4,
}

NAME_TO_RANK: dict[str, int] = {
    "lead vocals": 0,
    "vocals": 0,
    "vocal": 0,
    "guitar": 1,
    "bass guitar": 2,
    "double bass": 2,
    "bass": 2,
    "drums": 3,
    "drum": 3,
    "keyboard": 4,
    "piano": 4,
    "keyboards": 4,
}


def _parse_instrument_ids(raw: str | None) -> list[int]:
    if not raw:
        return []
    out: list[int] = []
    for part in raw.replace(",", ";").split(";"):
        p = part.strip()
        if p.isdigit():
            out.append(int(p))
    return out


def primary_role_rank(instrument_ids: list[int], role_labels: list[str] | None = None) -> int:
    rank = 6
    for iid in instrument_ids:
        rank = min(rank, ROLE_RANK_BY_ID.get(iid, 5))
    if role_labels:
        for label in role_labels:
            key = label.strip().lower()
            if key in NAME_TO_RANK:
                rank = min(rank, NAME_TO_RANK[key])
    return rank


def sort_lineup_members(members: list[dict]) -> list[dict]:
    def key(m: dict) -> tuple:
        ids = _parse_instrument_ids(m.get("instrument_ids_raw"))
        labels = m.get("roles") or []
        return (
            primary_role_rank(ids, labels),
            (m.get("name") or "").casefold(),
        )

    return sorted(members, key=key)
