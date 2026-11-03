"""Per-profile owned/signed markers for non-music leaf folders."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import LeafOwnership

MODULES = frozenset({"books", "movies", "series", "games"})
# Signed is only meaningful for books (physical signatures / autographs).
SIGNED_MODULES = frozenset({"books"})

_MODULE_ROOT = {
    "books": "Books",
    "movies": "Movies",
    "series": "Series",
    "games": "Games",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_folder_path(folder_path: str | None) -> str:
    return (folder_path or "").replace("\\", "/").strip().strip("/")


def normalize_module(module: str | None) -> str | None:
    m = (module or "").strip().casefold()
    return m if m in MODULES else None


def _media_root() -> Path | None:
    raw = settings.media_root
    if not raw:
        return None
    root = Path(raw)
    return root if root.is_dir() else None


def leaf_folder_exists(module: str, folder_path: str) -> bool:
    """Require an on-disk leaf folder under the module root (no ghost owns)."""
    root = _media_root()
    rel = normalize_folder_path(folder_path)
    if not root or not rel:
        return False
    parts = rel.split("/")
    want = _MODULE_ROOT.get(module, "").casefold()
    if not want or not parts or parts[0].casefold() != want:
        return False
    path = root.joinpath(*parts)
    try:
        return path.is_dir()
    except OSError:
        return False


def serialize(row: LeafOwnership) -> dict:
    return {
        "id": row.lfo_id,
        "module": row.lfo_module,
        "folder_path": row.lfo_folder_path,
        "leaf_id": row.lfo_leaf_id,
        "owned": bool(row.lfo_owned),
        "signed": bool(row.lfo_signed),
    }


def get_status(
    db: Session, *, user_id: int, module: str, folder_path: str
) -> dict:
    mod = normalize_module(module)
    rel = normalize_folder_path(folder_path)
    if not mod or not rel:
        return {"owned": False, "signed": False, "folder_path": rel}
    row = db.scalar(
        select(LeafOwnership).where(
            LeafOwnership.lfo_user_id == user_id,
            LeafOwnership.lfo_module == mod,
            LeafOwnership.lfo_folder_path == rel,
        )
    )
    if not row:
        return {"owned": False, "signed": False, "folder_path": rel}
    return {
        "owned": bool(row.lfo_owned),
        "signed": bool(row.lfo_signed),
        "folder_path": rel,
    }


def list_module(
    db: Session, *, user_id: int, module: str
) -> dict:
    mod = normalize_module(module)
    if not mod:
        return {
            "module": module,
            "items": [],
            "counts": {"owned": 0, "signed": 0},
        }
    rows = db.scalars(
        select(LeafOwnership).where(
            LeafOwnership.lfo_user_id == user_id,
            LeafOwnership.lfo_module == mod,
        )
    ).all()
    items = [serialize(r) for r in rows if r.lfo_owned or r.lfo_signed]
    owned_n = sum(1 for it in items if it["owned"])
    signed_n = sum(1 for it in items if it["signed"])
    return {
        "module": mod,
        "items": items,
        "counts": {"owned": owned_n, "signed": signed_n},
    }


def counts_by_module(db: Session, *, user_id: int) -> dict[str, dict[str, int]]:
    out = {m: {"owned": 0, "signed": 0} for m in sorted(MODULES)}
    rows = db.scalars(
        select(LeafOwnership).where(LeafOwnership.lfo_user_id == user_id)
    ).all()
    for row in rows:
        mod = row.lfo_module
        if mod not in out:
            continue
        if row.lfo_owned:
            out[mod]["owned"] += 1
        if row.lfo_signed:
            out[mod]["signed"] += 1
    return out


def upsert(
    db: Session,
    *,
    user_id: int,
    module: str,
    folder_path: str,
    leaf_id: str | None = None,
    owned: bool | None = None,
    signed: bool | None = None,
) -> dict:
    mod = normalize_module(module)
    rel = normalize_folder_path(folder_path)
    if not mod or not rel:
        raise ValueError("Invalid module or folder_path")
    if not leaf_folder_exists(mod, rel):
        raise ValueError("Leaf folder not found — ownership requires a local folder")

    allow_signed = mod in SIGNED_MODULES
    row = db.scalar(
        select(LeafOwnership).where(
            LeafOwnership.lfo_user_id == user_id,
            LeafOwnership.lfo_module == mod,
            LeafOwnership.lfo_folder_path == rel,
        )
    )
    if row is None:
        row = LeafOwnership(
            lfo_user_id=user_id,
            lfo_module=mod,
            lfo_folder_path=rel,
            lfo_leaf_id=(leaf_id or None),
            lfo_owned=0,
            lfo_signed=0,
        )
        db.add(row)

    if leaf_id:
        row.lfo_leaf_id = leaf_id

    next_owned = bool(row.lfo_owned) if owned is None else bool(owned)
    next_signed = bool(row.lfo_signed) if signed is None else bool(signed)
    if not allow_signed:
        next_signed = False
    # Signed always implies owned; clearing owned clears signed.
    if next_signed:
        next_owned = True
    if not next_owned:
        next_signed = False

    row.lfo_owned = 1 if next_owned else 0
    row.lfo_signed = 1 if next_signed else 0
    row.lfo_updated_at = _now()

    if not row.lfo_owned and not row.lfo_signed:
        db.delete(row)
        db.commit()
        return {"owned": False, "signed": False, "folder_path": rel}

    db.commit()
    db.refresh(row)
    return {
        "owned": bool(row.lfo_owned),
        "signed": bool(row.lfo_signed),
        "folder_path": rel,
    }
