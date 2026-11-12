"""Disk + in-process cache for filesystem catalogs (Series/Movies/Books/Games).

Caches the raw ``build_*_catalog`` payload keyed by module listing signature
so folder add/delete invalidates without relying on mtime alone. DB enrichment
(genres, NSFW, music identity) still runs on every request unless callers use
``get_or_build_enriched_catalog``.

Listing signatures are memoized briefly in-process so warm catalog/dashboard
hits do not re-walk the media tree on every HTTP request.
"""

from __future__ import annotations

import copy
import json
import time
from pathlib import Path
from typing import Callable

from app.media_listing_sig import module_listing_sig
from app.paths import DATA_DIR

CATALOG_CACHE_VERSION = 1

# Avoid re-walking Games/Series trees on every request when the library is large.
_LISTING_SIG_TTL_SEC = 45.0
_listing_sig_mem: dict[str, tuple[float, str]] = {}

# Raw FS payload kept warm after disk read / rebuild.
_raw_payload_mem: dict[str, tuple[str, dict]] = {}  # module -> (listing, payload)

# Enriched responses (NSFW-aware) for instant repeat catalog opens.
_ENRICHED_TTL_SEC = 60.0
_enriched_mem: dict[str, tuple[float, str, dict]] = {}  # key -> (expires, listing, payload)


def _cache_dir() -> Path:
    d = DATA_DIR / "catalog_cache"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _cache_path(module: str) -> Path:
    return _cache_dir() / f"{module}.json"


def _listing_sig_cached(media_root: Path, module: str) -> str:
    """Return module listing signature, reusing a short-lived in-process value."""
    mod = (module or "").strip().casefold()
    key = f"{mod}:{media_root.resolve()}"
    now = time.monotonic()
    hit = _listing_sig_mem.get(key)
    if hit and (now - hit[0]) < _LISTING_SIG_TTL_SEC:
        return hit[1]
    listing = module_listing_sig(media_root, mod) if media_root.is_dir() else "0:"
    _listing_sig_mem[key] = (now, listing)
    return listing


def _payload_looks_empty(payload: dict) -> bool:
    franchises = payload.get("franchises")
    return not isinstance(franchises, list) or len(franchises) == 0


def _listing_implies_content(listing: str) -> bool:
    """True when the membership fingerprint is not an empty-tree marker."""
    # Format is ``{count}:{hash}`` from fingerprint_paths / module_listing_sig.
    head = (listing or "").split(":", 1)[0].strip()
    try:
        return int(head) > 0
    except ValueError:
        return bool(listing) and listing != "0:"


def get_or_build_catalog(
    module: str,
    *,
    media_root: Path,
    builder: Callable[[], dict],
    force: bool = False,
) -> dict:
    """Return filesystem catalog for ``module``, rebuilding when listing changes."""
    mod = (module or "").strip().casefold()
    if mod not in ("series", "movies", "books", "games"):
        return builder()

    listing = _listing_sig_cached(media_root, mod)
    path = _cache_path(mod)

    if not force:
        mem = _raw_payload_mem.get(mod)
        if mem and mem[0] == listing and isinstance(mem[1], dict):
            # Reject poisoned empty caches left by in-place letter/page mutation.
            if not (
                _payload_looks_empty(mem[1]) and _listing_implies_content(listing)
            ):
                # Always copy — callers (catalog paging, NSFW filters, enrich)
                # mutate the dict/lists in place and must not poison the cache.
                return copy.deepcopy(mem[1])
            _raw_payload_mem.pop(mod, None)
            for ek in [k for k in _enriched_mem if k.startswith(f"{mod}:")]:
                _enriched_mem.pop(ek, None)

    if not force and path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if (
                isinstance(raw, dict)
                and raw.get("cache_version") == CATALOG_CACHE_VERSION
                and raw.get("disk_listing") == listing
                and isinstance(raw.get("payload"), dict)
            ):
                payload = raw["payload"]
                if not (
                    _payload_looks_empty(payload)
                    and _listing_implies_content(listing)
                ):
                    _raw_payload_mem[mod] = (listing, payload)
                    return copy.deepcopy(payload)
        except (json.JSONDecodeError, OSError, TypeError):
            pass

    payload = builder()
    _raw_payload_mem[mod] = (listing, payload)
    try:
        path.write_text(
            json.dumps(
                {
                    "cache_version": CATALOG_CACHE_VERSION,
                    "disk_listing": listing,
                    "payload": payload,
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
    except OSError:
        pass
    return copy.deepcopy(payload)


def enriched_catalog_cache_key(module: str, *, nsfw_unlocked: bool) -> str:
    return f"{(module or '').strip().casefold()}:nsfw={1 if nsfw_unlocked else 0}"


def get_cached_enriched_catalog(
    module: str,
    *,
    media_root: Path,
    nsfw_unlocked: bool,
) -> dict | None:
    """Return a deep-copied enriched catalog if still warm for this listing."""
    mod = (module or "").strip().casefold()
    if mod not in ("series", "movies", "books", "games"):
        return None
    key = enriched_catalog_cache_key(mod, nsfw_unlocked=nsfw_unlocked)
    hit = _enriched_mem.get(key)
    if not hit:
        return None
    expires, listing, payload = hit
    if time.monotonic() > expires:
        _enriched_mem.pop(key, None)
        return None
    current = _listing_sig_cached(media_root, mod)
    if listing != current:
        _enriched_mem.pop(key, None)
        return None
    if (
        isinstance(payload, dict)
        and _payload_looks_empty(payload)
        and _listing_implies_content(current)
    ):
        _enriched_mem.pop(key, None)
        return None
    return copy.deepcopy(payload)


def store_enriched_catalog(
    module: str,
    *,
    media_root: Path,
    nsfw_unlocked: bool,
    payload: dict,
) -> None:
    mod = (module or "").strip().casefold()
    if mod not in ("series", "movies", "books", "games"):
        return
    listing = _listing_sig_cached(media_root, mod)
    key = enriched_catalog_cache_key(mod, nsfw_unlocked=nsfw_unlocked)
    _enriched_mem[key] = (
        time.monotonic() + _ENRICHED_TTL_SEC,
        listing,
        copy.deepcopy(payload),
    )


def invalidate_module_catalog(module: str | None = None) -> None:
    global _listing_sig_mem, _raw_payload_mem, _enriched_mem
    try:
        from app.adult_content import clear_adult_content_caches

        clear_adult_content_caches()
    except Exception:
        pass
    if module:
        mod = module.strip().casefold()
        path = _cache_path(mod)
        if path.is_file():
            try:
                path.unlink()
            except OSError:
                pass
        _raw_payload_mem.pop(mod, None)
        _listing_sig_mem = {
            k: v for k, v in _listing_sig_mem.items() if not k.startswith(f"{mod}:")
        }
        _enriched_mem = {
            k: v for k, v in _enriched_mem.items() if not k.startswith(f"{mod}:")
        }
        return
    try:
        for child in _cache_dir().iterdir():
            if child.suffix.casefold() == ".json":
                try:
                    child.unlink()
                except OSError:
                    pass
    except OSError:
        pass
    _listing_sig_mem = {}
    _raw_payload_mem = {}
    _enriched_mem = {}
