"""Language-aware logo discovery for Series/Movies franchise and item pages.

Filename conventions (case-insensitive), searched under Gallery/Renders,
[Artwork], Artwork, and Gallery/Logos:

  logo.png                 → default (exact stem ``logo``)
  logo - japanese.png      → Japanese
  logo - spanish.png       → generic Spanish (es-ES and es-419)
  logo - latin.png         → Spanish (Latin America), preferred over generic
  logo - spain.png         → Spanish (Spain), preferred over generic

Stems containing ``collapsed`` are ignored. Icons are not language-switched.
"""
from __future__ import annotations

import re
from pathlib import Path

from app.gallery import IMAGE_EXTS, _media_url
from app.series_paths import render_search_dirs

# Preferred filename tokens per language code (most specific first).
_LANG_TOKENS: dict[str, tuple[str, ...]] = {
    "ja": ("japanese", "japan", "ja", "jp"),
    "en": ("english", "en"),
    "es-ES": ("spanish spain", "spain", "es-es", "castilian", "spanish"),
    "es-419": (
        "latin america",
        "latinamerica",
        "latam",
        "latin",
        "es-419",
        "es-mx",
        "spanish",
    ),
}

_LOGO_VARIANT_RE = re.compile(
    r"^logo\s*[-–—]\s*(.+)$",
    re.IGNORECASE,
)


def _file_url(path: Path, media_root: Path) -> str | None:
    url = _media_url(path, media_root)
    if not url:
        return None
    try:
        return f"{url}&v={int(path.stat().st_mtime)}"
    except OSError:
        return url


def _scan_folder_logos(folder: Path, media_root: Path) -> dict:
    """Return raw logo assets from one content folder.

    Keys:
      default: URL for exact stem ``logo``
      any: first logo* URL (non-collapsed) as last-resort fallback
      by_token: normalized token → URL (from ``logo - token``)
    """
    default: str | None = None
    any_logo: str | None = None
    by_token: dict[str, str] = {}

    for d in render_search_dirs(folder):
        try:
            files = sorted(d.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            continue
        for f in files:
            if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
                continue
            stem = f.stem.strip()
            low = stem.casefold()
            if "logo" not in low or "collapsed" in low:
                continue
            url = _file_url(f, media_root)
            if not url:
                continue
            if any_logo is None:
                any_logo = url
            if low == "logo":
                if default is None:
                    default = url
                continue
            m = _LOGO_VARIANT_RE.match(stem)
            if not m:
                continue
            token = re.sub(r"\s+", " ", m.group(1).strip().casefold())
            token = token.replace("_", " ").replace(".", " ")
            token = re.sub(r"\s+", " ", token).strip()
            if token and token not in by_token:
                by_token[token] = url

    return {"default": default, "any": any_logo, "by_token": by_token}


def _best_url_for_code(code: str, by_token: dict[str, str]) -> str | None:
    prefs = _LANG_TOKENS.get(code) or (code.casefold(),)
    for token in prefs:
        hit = by_token.get(token)
        if hit:
            return hit
    # Fuzzy: token contained in key or key contained in token
    for token in prefs:
        for key, url in by_token.items():
            if token in key or key in token:
                return url
    return None


def _has_any(assets: dict) -> bool:
    return bool(assets.get("default") or assets.get("any") or assets.get("by_token"))


def resolve_language_logos(
    folder: Path | None,
    media_root: Path,
    *,
    listed_languages: list[str] | None = None,
    fallback_folders: list[Path] | None = None,
    child_folders: list[Path] | None = None,
    child_default_only: bool = False,
) -> dict:
    """Resolve logos for a page folder.

    ``fallback_folders``: try these (e.g. parent franchise) when ``folder``
    has no logos.

    ``child_folders``: when the page folder (and fallbacks) have no logos,
    use ``logo.png`` from the first child that has a default logo
    (``child_default_only`` True — franchise → first film/subseries).

    Returns:
      logo_url, logo_by_language, logos_switchable, default_logo_url
    """
    listed = [c for c in (listed_languages or []) if c]
    assets = (
        _scan_folder_logos(folder, media_root) if folder and folder.is_dir() else
        {"default": None, "any": None, "by_token": {}}
    )

    if not _has_any(assets):
        for fb in fallback_folders or []:
            if fb and fb.is_dir():
                assets = _scan_folder_logos(fb, media_root)
                if _has_any(assets):
                    break

    used_child_default_only = False
    if not _has_any(assets) and child_folders:
        for child in child_folders:
            if not child or not child.is_dir():
                continue
            child_assets = _scan_folder_logos(child, media_root)
            if child_default_only:
                if child_assets.get("default"):
                    assets = {
                        "default": child_assets["default"],
                        "any": child_assets["default"],
                        "by_token": {},
                    }
                    used_child_default_only = True
                    break
            elif _has_any(child_assets):
                assets = child_assets
                break

    default = assets.get("default")
    any_logo = assets.get("any") or default
    by_token: dict[str, str] = assets.get("by_token") or {}

    # No languages configured: prefer default, else any logo*
    if not listed:
        logo = default or any_logo
        return {
            "logo_url": logo,
            "default_logo_url": default,
            "logo_by_language": {},
            "logos_switchable": False,
        }

    by_lang: dict[str, str | None] = {}
    single = len(listed) == 1

    for code in listed:
        specific = _best_url_for_code(code, by_token)
        if single:
            # Prefer default logo.png when only one language is listed
            by_lang[code] = default or specific or any_logo
        else:
            by_lang[code] = specific or default or any_logo

    distinct = {u for u in by_lang.values() if u}
    switchable = (
        not used_child_default_only
        and len(listed) >= 2
        and len(distinct) >= 2
    )

    # Primary logo_url: origin/first listed language's resolution
    primary_code = listed[0]
    logo_url = by_lang.get(primary_code) or default or any_logo

    return {
        "logo_url": logo_url,
        "default_logo_url": default,
        "logo_by_language": {k: v for k, v in by_lang.items() if v},
        "logos_switchable": switchable,
    }
