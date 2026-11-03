"""Disk membership fingerprints for catalog / franchise-index cache invalidation.

Max-mtime alone misses deletions of non-newest folders (same bug class as
music audio index). These signatures hash relative directory paths so adds
and deletes invalidate caches even when mtimes look unchanged.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

_SKIP_NAMES = frozenset(
    {
        "desktop.ini",
        "folder.ico",
        "thumbs.db",
        ".ds_store",
    }
)

# Shallow skips under a franchise/work (artwork hubs, not catalog leaves).
_SKIP_DIR_MARKERS = frozenset(
    {
        "artwork",
        "[artwork]",
        "gallery",
        "[gallery]",
        "exclusive",
        "[exclusive]",
        "audio",
        "[audio]",
        "library",
        "[library]",
        "video",
        "[video]",
        "branding",
        "[branding]",
    }
)

_MODULE_ROOTS = {
    "movies": ("Movies", 4),
    "series": ("Series", 5),
    "books": ("Books", 4),
    "games": ("Games", 5),
}


def _should_skip_dir(name: str) -> bool:
    low = name.casefold()
    if low in _SKIP_NAMES or low in _SKIP_DIR_MARKERS:
        return True
    if low.startswith("."):
        return True
    return False


def _collect_dir_paths(root: Path, *, max_depth: int) -> list[str]:
    """Relative posix paths of directories under ``root`` up to ``max_depth``."""
    if not root.is_dir():
        return []
    out: list[str] = []
    base = root.resolve()

    def walk(current: Path, depth: int) -> None:
        if depth > max_depth:
            return
        try:
            children = sorted(current.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            return
        for child in children:
            if not child.is_dir() or _should_skip_dir(child.name):
                continue
            try:
                rel = child.resolve().relative_to(base).as_posix().casefold()
            except (OSError, ValueError):
                continue
            out.append(rel)
            walk(child, depth + 1)

    walk(base, 1)
    return out


def module_listing_paths(media_root: Path, module: str) -> list[str]:
    spec = _MODULE_ROOTS.get((module or "").strip().casefold())
    if not spec:
        return []
    folder, depth = spec
    base = media_root / folder
    if not base.is_dir():
        return []
    prefix = folder.casefold()
    return [f"{prefix}/{p}" for p in _collect_dir_paths(base, max_depth=depth)]


def fingerprint_paths(paths: list[str]) -> str:
    ordered = sorted({p for p in paths if p})
    digest = hashlib.sha256("|".join(ordered).encode("utf-8")).hexdigest()[:24]
    return f"{len(ordered)}:{digest}"


def module_listing_sig(media_root: Path, module: str) -> str:
    return fingerprint_paths(module_listing_paths(media_root, module))


def media_modules_listing_sig(media_root: Path) -> str:
    """Combined Movies/Series/Books/Games membership fingerprint."""
    if not media_root.is_dir():
        return "0:"
    paths: list[str] = []
    for module in _MODULE_ROOTS:
        paths.extend(module_listing_paths(media_root, module))
    return fingerprint_paths(paths)
