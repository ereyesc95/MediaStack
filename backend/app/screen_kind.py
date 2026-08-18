"""Parent-genre kind lines for movies, series, and artist video pages."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Genre, Subgenre

_SKIP_PARENTS = frozenset({"other", "unknown"})


def kind_label_from_parents(parents: list[str], noun: str) -> str:
    """Anime > Animation > first remaining parent, then a bare noun."""
    by_fold: dict[str, str] = {}
    ordered: list[str] = []
    for raw in parents:
        name = (raw or "").strip()
        if not name:
            continue
        key = name.casefold()
        if key in by_fold:
            continue
        by_fold[key] = name
        ordered.append(name)
    if "anime" in by_fold:
        return f"Anime {noun}"
    if "animation" in by_fold:
        return f"Animation {noun}"
    for name in ordered:
        if name.casefold() not in _SKIP_PARENTS:
            return f"{name} {noun}"
    return noun[:1].upper() + noun[1:] if noun else ""


def parent_names_for_labels(db: Session, labels: list[str]) -> list[str]:
    """Map subgenre (or parent) labels to parent genre names."""
    wanted = {(n or "").strip().casefold() for n in labels if (n or "").strip()}
    if not wanted:
        return []
    parents: dict[str, str] = {}
    for genre in db.scalars(select(Genre)).all():
        name = (genre.gen_name or "").strip()
        if name and name.casefold() in wanted:
            parents[name.casefold()] = name
    for sub in db.scalars(select(Subgenre)).all():
        name = (sub.sgn_name or "").strip()
        if not name or name.casefold() not in wanted:
            continue
        parent = db.get(Genre, sub.sgn_genre_id or 0)
        pname = (parent.gen_name if parent else "") or ""
        if pname:
            parents[pname.casefold()] = pname
    return list(parents.values())


def kind_label_from_genre_labels(
    db: Session,
    labels: list[str],
    noun: str,
) -> tuple[str, list[str]]:
    parents = parent_names_for_labels(db, labels)
    return kind_label_from_parents(parents, noun), parents
