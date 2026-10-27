"""Per-episode tags on a Series leaf (disk + remote episode ids)."""
from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import SeriesEpisodeTags

MAX_TAGS_PER_EPISODE = 3
MAX_TAG_LEN = 32
# Letters, numbers, hyphen, space; 1–32 chars after trim.
_TAG_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9\- ]{0,30}[A-Za-z0-9])?$|^[A-Za-z0-9]$")


def _norm_path(path: str) -> str:
    return (path or "").replace("\\", "/").strip().strip("/")


def _norm_key(tag: str) -> str:
    return " ".join((tag or "").casefold().split())


def validate_tag(raw: str) -> str | None:
    """Return cleaned tag as typed (trimmed, collapsed space) or None if invalid."""
    cleaned = " ".join((raw or "").strip().split())
    if not cleaned or len(cleaned) > MAX_TAG_LEN:
        return None
    if not _TAG_RE.match(cleaned):
        return None
    return cleaned


def sanitize_tags(tags: list[str] | None) -> list[str]:
    """Keep up to 3 valid tags; case-insensitive dedupe; preserve first spelling."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in tags or []:
        cleaned = validate_tag(str(raw))
        if not cleaned:
            continue
        key = _norm_key(cleaned)
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
        if len(out) >= MAX_TAGS_PER_EPISODE:
            break
    return out


def _parse_json(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return []
    if not isinstance(data, list):
        return []
    return sanitize_tags([str(x) for x in data])


def get_leaf_tag_payload(db: Session, leaf_path: str) -> dict[str, Any]:
    path = _norm_path(leaf_path)
    if not path:
        return {"path": path, "tags": [], "by_episode": {}}
    rows = db.scalars(
        select(SeriesEpisodeTags).where(SeriesEpisodeTags.set_leaf_path == path)
    ).all()
    by_episode: dict[str, list[str]] = {}
    counts: dict[str, tuple[str, int]] = {}  # norm -> (display, count)
    for row in rows:
        tags = _parse_json(row.set_tags_json)
        if not tags:
            continue
        by_episode[row.set_episode_id] = tags
        for t in tags:
            key = _norm_key(t)
            if key in counts:
                display, n = counts[key]
                counts[key] = (display, n + 1)
            else:
                counts[key] = (t, 1)
    # Stable order: most used first, then casefold label
    tag_list = sorted(
        ({"label": display, "count": n} for display, n in counts.values()),
        key=lambda x: (-x["count"], x["label"].casefold()),
    )
    return {
        "path": path,
        "tags": tag_list,
        "by_episode": by_episode,
    }


def set_episode_tags(
    db: Session,
    *,
    leaf_path: str,
    episode_id: str,
    tags: list[str] | None,
) -> dict[str, Any]:
    path = _norm_path(leaf_path)
    eid = (episode_id or "").strip()
    if not path:
        raise ValueError("path is required")
    if not eid:
        raise ValueError("episode_id is required")
    cleaned = sanitize_tags(tags)
    row = db.scalars(
        select(SeriesEpisodeTags).where(
            SeriesEpisodeTags.set_leaf_path == path,
            SeriesEpisodeTags.set_episode_id == eid,
        )
    ).first()
    if not cleaned:
        if row:
            db.delete(row)
            db.commit()
        return get_leaf_tag_payload(db, path)
    if row:
        row.set_tags_json = json.dumps(cleaned, ensure_ascii=False)
    else:
        db.add(
            SeriesEpisodeTags(
                set_leaf_path=path,
                set_episode_id=eid,
                set_tags_json=json.dumps(cleaned, ensure_ascii=False),
            )
        )
    db.commit()
    return get_leaf_tag_payload(db, path)
