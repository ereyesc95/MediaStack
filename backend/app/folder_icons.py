"""Windows Explorer folder customization: desktop.ini + folder.ico."""
from __future__ import annotations

import re
import sys
from pathlib import Path

from app.config import settings
from app.franchise_index import normalize_franchise_slug
from app.paths import ASSETS_DIR

DESKTOP_INI_TEXT = (
    "[.ShellClassInfo]\n"
    "ConfirmFileOp=0\n"
    "IconFile=folder.ico\n"
    "IconIndex=0\n"
)

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp")

# Folder basename (casefold) → assets/icons stem (Artwork for [Artwork])
STRUCTURAL_ICON_STEMS: dict[str, str] = {
    "[artwork]": "Artwork",
    "exclusive": "Exclusive",
    "branding": "Branding",
    "miscellaneous": "Miscellaneous",
    "covers": "Covers",
    "albums": "Albums",
    "extended plays": "Extended Plays",
    "compilations": "Compilations",
    "demos": "Demos",
    "live albums": "Live Albums",
    "soundtracks": "Soundtracks",
    "singles": "Singles",
    "tours": "Tours",
    "gallery": "Gallery",
    "characters": "Characters",
    "episodes": "Episodes",
    "specials": "Specials",
    "extras": "Extras",
    "audio": "Audio",
    "souvenirs": "Souvenirs",
    "promo": "Promo",
    "music": "Music",
    "movies": "Movies",
    "series": "Series",
    "books": "Books",
    "games": "Games",
    "photos": "Photos",
}

MEDIA_MODULE_ROOTS = ("Music", "Movies", "Series", "Books", "Games", "Photos")

_DATE_PREFIX_RE = re.compile(
    r"^\d{4}(?:\.\d{2}(?:\.\d{2})?)?\.\s+",
)


def _media_root() -> Path | None:
    root = Path(settings.media_root or "")
    return root if root.is_dir() else None


def _set_file_attrs(path: Path, attrs: int) -> None:
    if sys.platform != "win32" or not path.exists():
        return
    try:
        import ctypes

        ctypes.windll.kernel32.SetFileAttributesW(str(path), attrs)
    except Exception:
        pass


def _set_hidden_system(path: Path) -> None:
    """Mark file Hidden+System on Windows; no-op elsewhere."""
    if sys.platform != "win32" or not path.is_file():
        return
    try:
        import ctypes

        FILE_ATTRIBUTE_HIDDEN = 0x2
        FILE_ATTRIBUTE_SYSTEM = 0x4
        _set_file_attrs(path, FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM)
    except Exception:
        try:
            import subprocess

            subprocess.run(
                ["attrib", "+H", "+S", str(path)],
                check=False,
                capture_output=True,
            )
        except Exception:
            pass


def mark_folder_customized(folder: Path) -> None:
    """
    Set the directory Read-only attribute so Explorer honors desktop.ini.

    On Windows this bit on a *folder* is only a shell customization flag — it
    does not block creating, moving, copying, or deleting files inside the
    folder. Contents remain fully writable.
    """
    if sys.platform != "win32" or not folder.is_dir():
        return
    try:
        import ctypes

        FILE_ATTRIBUTE_READONLY = 0x1
        GetFileAttributesW = ctypes.windll.kernel32.GetFileAttributesW
        GetFileAttributesW.restype = ctypes.c_uint32
        current = GetFileAttributesW(str(folder))
        if current == 0xFFFFFFFF:
            return
        # Only OR Read-only — does not make the folder's *contents* read-only.
        desired = current | FILE_ATTRIBUTE_READONLY
        if desired != current:
            _set_file_attrs(folder, desired)
    except Exception:
        try:
            import subprocess

            subprocess.run(
                ["attrib", "+R", str(folder)],
                check=False,
                capture_output=True,
            )
        except Exception:
            pass


def notify_shell_folder(folder: Path) -> None:
    """Ask Explorer to refresh this folder's icon / attributes."""
    if sys.platform != "win32" or not folder.exists():
        return
    try:
        import ctypes

        SHCNE_ATTRIBUTES = 0x00000800
        SHCNE_UPDATEDIR = 0x00001000
        SHCNE_UPDATEITEM = 0x00002000
        SHCNF_PATHW = 0x0005
        path = str(folder.resolve())
        ctypes.windll.shell32.SHChangeNotify(
            SHCNE_ATTRIBUTES | SHCNE_UPDATEITEM | SHCNE_UPDATEDIR,
            SHCNF_PATHW,
            path,
            None,
        )
    except Exception:
        pass


def notify_shell_assoc_changed() -> None:
    """Broad icon-cache nudge (use sparingly after batch writes)."""
    if sys.platform != "win32":
        return
    try:
        import ctypes

        SHCNE_ASSOCCHANGED = 0x08000000
        SHCNF_IDLIST = 0x0000
        ctypes.windll.shell32.SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None)
    except Exception:
        pass


def write_desktop_ini(folder: Path, *, force: bool = False) -> bool:
    """Write desktop.ini into folder. Returns True if written/updated."""
    if not folder.is_dir():
        return False
    ini = folder / "desktop.ini"
    if ini.is_file() and not force:
        mark_folder_customized(folder)
        return False
    try:
        # Clear attributes so we can overwrite if present
        if ini.is_file() and sys.platform == "win32":
            _set_file_attrs(ini, 0x80)  # NORMAL
        ini.write_text(DESKTOP_INI_TEXT, encoding="utf-8", newline="\r\n")
        _set_hidden_system(ini)
        mark_folder_customized(folder)
        return True
    except OSError:
        return False


def is_letter_tier_folder(folder: Path, root: Path | None = None) -> bool:
    """True for Music/H, Movies/D, Series/D, Books/D, Games/{Platform}/S — skip ini/ico."""
    root = root or _media_root()
    if not root:
        return False
    try:
        parts = folder.resolve().relative_to(root.resolve()).parts
    except (OSError, ValueError):
        try:
            parts = folder.relative_to(root).parts
        except ValueError:
            return False
    if len(parts) == 2 and parts[0] in {"Music", "Movies", "Series", "Books"}:
        return len(parts[1]) == 1 or parts[1] == "#"
    if len(parts) == 3 and parts[0] == "Games":
        return len(parts[2]) == 1 or parts[2] == "#"
    return False


def decorate_folder(
    folder: Path,
    *,
    force_ini: bool = False,
    overwrite_ico: bool = False,
    root: Path | None = None,
    notify: bool = True,
) -> None:
    """Write desktop.ini and best-effort folder.ico (skip letter tiers)."""
    root = root or _media_root()
    if not folder.is_dir():
        return
    if root and is_letter_tier_folder(folder, root):
        return
    write_desktop_ini(folder, force=force_ini)
    ensure_folder_ico(folder, overwrite=overwrite_ico, root=root)
    mark_folder_customized(folder)
    if notify:
        notify_shell_folder(folder)


def ensure_dir_with_ini(folder: Path) -> Path:
    """mkdir parents + write desktop.ini (+ structural ico when available) on the leaf."""
    folder.mkdir(parents=True, exist_ok=True)
    decorate_folder(folder)
    return folder


def ensure_relative_tree(base: Path, relative: str) -> None:
    """Create base/rel path components and decorate each node under base."""
    base.mkdir(parents=True, exist_ok=True)
    decorate_folder(base)
    cur = base
    for part in Path(relative).parts:
        if part in (".", ""):
            continue
        cur = cur / part
        cur.mkdir(parents=True, exist_ok=True)
        decorate_folder(cur)


def find_first_image(folder: Path, stems: list[str]) -> Path | None:
    """Case-insensitive first match for any stem + any image extension."""
    if not folder.is_dir() or not stems:
        return None
    want = {s.casefold() for s in stems if s}
    try:
        children = list(folder.iterdir())
    except OSError:
        return None
    for child in children:
        if not child.is_file():
            continue
        stem = child.stem.casefold()
        suf = child.suffix.casefold()
        if suf not in IMAGE_EXTS:
            continue
        if stem in want:
            return child
    return None


def assets_icons_dir() -> Path:
    return ASSETS_DIR / "icons"


def assets_platforms_dir() -> Path:
    return ASSETS_DIR / "platforms"


def find_assets_icon(stem: str) -> Path | None:
    return find_first_image(assets_icons_dir(), [stem])


def find_platform_icon(platform_name: str) -> Path | None:
    d = assets_platforms_dir()
    name = (platform_name or "").strip()
    if not name:
        return None
    hit = find_first_image(d, [f"{name} - Icon"])
    if hit:
        return hit
    hit = find_first_image(d, [f"{name} - Logo"])
    if hit:
        return hit
    return find_first_image(d, [name])


_ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)


def _square_rgba(im):
    """RGBA square; trim transparent margins so art fills the icon canvas."""
    from PIL import Image

    im = im.convert("RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    side = max(w, h, 1)
    if w == side and h == side:
        return im
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2), im)
    return canvas


def image_to_ico(src: Path, dest: Path) -> bool:
    """Convert image to multi-size ICO (explicit LANCZOS layers). Never raises."""
    try:
        from PIL import Image
    except ImportError:
        return False
    try:
        if dest.is_file() and sys.platform == "win32":
            _set_file_attrs(dest, 0x80)  # NORMAL
        with Image.open(src) as raw:
            base = _square_rgba(raw)
        # Build each mip explicitly so Explorer Extra Large (256) is a real bitmap
        layers = [
            base.resize((side, side), Image.Resampling.LANCZOS)
            for side in _ICO_SIZES
        ]
        dest.parent.mkdir(parents=True, exist_ok=True)
        # Provide 256px as the primary frame; other sizes via append_images
        layers[-1].save(
            dest,
            format="ICO",
            append_images=layers[:-1],
            sizes=[(side, side) for side in _ICO_SIZES],
        )
        _set_hidden_system(dest)
        return True
    except Exception:
        return False


def strip_date_prefix(name: str) -> str:
    return _DATE_PREFIX_RE.sub("", name or "").strip() or (name or "")


def _parse_by_artist_tag(folder_name: str) -> str | None:
    """Extract act name from trailing [By Artist] tag."""
    m = re.search(r"\[By\s+([^\]]+)\]\s*$", folder_name or "", re.I)
    if not m:
        return None
    return m.group(1).strip() or None


def _music_artist_dir(root: Path, artist_name: str) -> Path | None:
    from app.gallery import _letter_folder, _safe_folder_component

    letter = _letter_folder(artist_name)
    safe = _safe_folder_component(artist_name)
    d = root / "Music" / letter / safe
    return d if d.is_dir() else None


def resolve_source_image(folder: Path, root: Path | None = None) -> Path | None:
    """Pick the source image for folder.ico per locked mapping rules."""
    root = root or _media_root()
    name = folder.name
    key = name.casefold()

    # Structural / assets icons
    stem = STRUCTURAL_ICON_STEMS.get(key)
    if stem:
        return find_assets_icon(stem)

    if not root:
        return None

    try:
        rel = folder.resolve().relative_to(root.resolve()).as_posix()
    except (OSError, ValueError):
        try:
            rel = folder.relative_to(root).as_posix()
        except ValueError:
            return None
    parts = rel.split("/")
    if not parts:
        return None
    module = parts[0]

    # Games platform root: Games/{Platform}
    if module == "Games" and len(parts) == 2:
        return find_platform_icon(parts[1])

    # Format folders under a release (CD, LP, Disc N, …): [Artwork]/Cover - Front
    artwork = folder / "[Artwork]"
    if artwork.is_dir():
        # Release-like folder that already has [Artwork] as child — handled below
        pass
    parent = folder.parent
    # If this folder looks like a format/version under a release (has sibling or own Artwork with cover)
    own_art = folder / "[Artwork]"
    if own_art.is_dir():
        hit = find_first_image(own_art, ["Cover - Front", "Cover - Portrait"])
        if hit:
            # Prefer Front for format folders; Portrait then Front for others — try both orders by context
            front = find_first_image(own_art, ["Cover - Front"])
            if front and _looks_like_format_folder(name):
                return front
            portrait = find_first_image(own_art, ["Cover - Portrait"])
            return portrait or front or hit

    # Season under Episodes/
    if parent.name.casefold() == "episodes":
        show_dir = parent.parent
        season_title = strip_date_prefix(name)
        covers = show_dir / "Gallery" / "Covers"
        hit = find_first_image(covers, [f"{season_title} - Portrait"])
        if hit:
            return hit
        hit = find_first_image(covers, ["Cover - Portrait"])
        if hit:
            return hit
        return find_first_image(covers, ["Cover - Front"])

    # Tour folder (child of Tours/)
    if parent.name.casefold() == "tours":
        art = folder / "[Artwork]"
        hit = find_first_image(art, ["Poster"])
        if hit:
            return hit
        by = _parse_by_artist_tag(name)
        if by and root:
            main = _music_artist_dir(root, by)
            if main:
                # Mirror tour path without [By …]
                clean = re.sub(r"\s*\[By\s+[^\]]+\]\s*$", "", name, flags=re.I).strip()
                main_tour = main / "Tours" / clean
                return find_first_image(main_tour / "[Artwork]", ["Poster"])
        return None

    # Event / show under a tour (has Promo/)
    promo = folder / "Promo"
    if promo.is_dir() or (parent.parent.name.casefold() == "tours"):
        hit = find_first_image(folder / "Promo", ["Poster"])
        if hit:
            return hit
        # Support act → main act
        tour_folder = parent
        by = _parse_by_artist_tag(tour_folder.name)
        if by and root:
            main = _music_artist_dir(root, by)
            if main:
                clean_tour = re.sub(
                    r"\s*\[By\s+[^\]]+\]\s*$", "", tour_folder.name, flags=re.I
                ).strip()
                main_show = main / "Tours" / clean_tour / name
                return find_first_image(main_show / "Promo", ["Poster"])
        return None

    # Generic Gallery/Covers for leaf (movie/book/game/show)
    covers = folder / "Gallery" / "Covers"
    if covers.is_dir():
        hit = find_first_image(covers, ["Cover - Portrait"])
        if hit:
            return hit
        hit = find_first_image(covers, ["Cover - Front"])
        if hit:
            return hit

    # Franchise with [Artwork]/Covers (music artist / series-home franchise)
    art_covers = folder / "[Artwork]" / "Covers"
    if art_covers.is_dir():
        hit = find_first_image(art_covers, ["Cover - Portrait"])
        if hit:
            return hit
        hit = find_first_image(art_covers, ["Cover - Front"])
        if hit:
            return hit

    # Release audio leaf: …/Albums/{date}. Title — cover in [Artwork]
    if parent.name.casefold() in {
        "albums",
        "extended plays",
        "compilations",
        "demos",
        "live albums",
        "soundtracks",
        "singles",
    }:
        hit = find_first_image(folder / "[Artwork]", ["Cover - Portrait"])
        if hit:
            return hit
        return find_first_image(folder / "[Artwork]", ["Cover - Front"])

    # Format folder: Cover - Front in own [Artwork], else parent release
    if _looks_like_format_folder(name):
        hit = find_first_image(folder / "[Artwork]", ["Cover - Front"])
        if hit:
            return hit
        # parent may be edition; walk up to release [Artwork]
        for asc in (parent, parent.parent):
            hit = find_first_image(asc / "[Artwork]", ["Cover - Portrait"])
            if hit:
                return hit
            hit = find_first_image(asc / "[Artwork]", ["Cover - Front"])
            if hit:
                return hit

    return None


_FORMAT_HINTS = re.compile(
    r"^(?:cd|sacd|minidisc|md|flexi|digital|usb|lp|vinyl|cassette|tape|"
    r"dvd|blu-?ray|vhs|disc\s*\d+|side\s*[a-d])(?:\b|$)",
    re.I,
)


def _looks_like_format_folder(name: str) -> bool:
    core = strip_date_prefix(name)
    # "01. Disc 01" / "CD" / "LP - Black"
    core2 = re.sub(r"^\d+\.\s*", "", core).strip()
    return bool(_FORMAT_HINTS.match(core2))


def ensure_folder_ico(
    folder: Path,
    *,
    overwrite: bool = False,
    root: Path | None = None,
    source: Path | None = None,
) -> str:
    """
    Ensure folder.ico exists. Returns status:
    written | skipped_exists | skipped_no_source | failed
    """
    ico = folder / "folder.ico"
    if ico.is_file() and not overwrite:
        return "skipped_exists"
    src = source or resolve_source_image(folder, root)
    if not src or not src.is_file():
        return "skipped_no_source"
    if image_to_ico(src, ico):
        write_desktop_ini(folder, force=False)
        mark_folder_customized(folder)
        return "written"
    return "failed"


def count_existing_icos(folder: Path) -> int:
    n = 0
    try:
        for p in folder.rglob("folder.ico"):
            if p.is_file():
                n += 1
    except OSError:
        pass
    return n


def iter_dirs_for_icons(root_folder: Path, media_root: Path | None = None) -> list[Path]:
    """All directories under root_folder including root (for generate / ensure-ini)."""
    root = media_root or _media_root()
    out: list[Path] = []
    if not root_folder.is_dir():
        return out
    if not (root and is_letter_tier_folder(root_folder, root)):
        out.append(root_folder)
    try:
        for p in root_folder.rglob("*"):
            if not p.is_dir():
                continue
            if p.name.casefold() in {"__pycache__", ".git"}:
                continue
            if root and is_letter_tier_folder(p, root):
                continue
            out.append(p)
    except OSError:
        pass
    return out


def ensure_ini_tree(root_folder: Path) -> dict:
    dirs = iter_dirs_for_icons(root_folder)
    written = 0
    for d in dirs:
        if write_desktop_ini(d):
            written += 1
        else:
            mark_folder_customized(d)
    notify_shell_folder(root_folder)
    notify_shell_assoc_changed()
    return {"ok": True, "ini_written": written, "folders": len(dirs)}


def generate_icons_tree(
    root_folder: Path,
    *,
    overwrite: bool = False,
    media_root: Path | None = None,
) -> dict:
    root = media_root or _media_root()
    stats = {
        "ok": True,
        "written": 0,
        "skipped_exists": 0,
        "skipped_no_source": 0,
        "failed": 0,
        "ini_written": 0,
        "existing_icos": count_existing_icos(root_folder),
    }
    for d in iter_dirs_for_icons(root_folder, root):
        if write_desktop_ini(d):
            stats["ini_written"] += 1
        else:
            mark_folder_customized(d)
        status = ensure_folder_ico(d, overwrite=overwrite, root=root)
        if status in stats:
            stats[status] += 1
    notify_shell_folder(root_folder)
    notify_shell_assoc_changed()
    return stats


def ensure_media_module_roots(
    *, overwrite_ico: bool = False, force_ini: bool = False
) -> dict:
    """Media/{Music,…,Photos} get desktop.ini + ico from assets."""
    root = _media_root()
    stats = {"ok": True, "modules": []}
    if not root:
        stats["ok"] = False
        stats["error"] = "media_root missing"
        return stats
    rewrite_ini = force_ini or overwrite_ico
    for name in MEDIA_MODULE_ROOTS:
        folder = root / name
        try:
            folder.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            stats["modules"].append({"name": name, "error": str(exc)})
            continue
        ini = write_desktop_ini(folder, force=rewrite_ini)
        src = find_assets_icon(name)
        ico_status = "skipped_no_source"
        if src:
            ico_status = ensure_folder_ico(
                folder, overwrite=overwrite_ico, root=root, source=src
            )
        mark_folder_customized(folder)
        notify_shell_folder(folder)
        stats["modules"].append(
            {
                "name": name,
                "ini_written": ini,
                "ico": ico_status,
                "has_source": bool(src),
            }
        )
    notify_shell_assoc_changed()
    return stats


def resolve_artist_folder(band_name: str) -> Path | None:
    root = _media_root()
    if not root:
        return None
    return _music_artist_dir(root, band_name)


def resolve_franchise_folder(
    module: str, franchise_id: str, folder_path: str | None = None
) -> Path | None:
    root = _media_root()
    if not root:
        return None
    if folder_path:
        p = root / folder_path.replace("\\", "/").lstrip("/")
        if p.is_dir():
            return p
    # Games: search platforms
    if module == "games":
        games = root / "Games"
        if not games.is_dir():
            return None
        want = normalize_franchise_slug(franchise_id) or franchise_id.casefold()
        for platform in games.iterdir():
            if not platform.is_dir():
                continue
            for letter in platform.iterdir():
                if not letter.is_dir() or len(letter.name) != 1:
                    # letter may be multi for # — still check children
                    pass
                if not letter.is_dir():
                    continue
                for child in letter.iterdir():
                    if not child.is_dir():
                        continue
                    if (
                        normalize_franchise_slug(child.name) == want
                        or child.name.casefold() == franchise_id.casefold()
                    ):
                        return child
        return None
    base = {
        "series": "Series",
        "movies": "Movies",
        "books": "Books",
    }.get(module)
    if not base:
        return None
    mod = root / base
    if not mod.is_dir():
        return None
    want = normalize_franchise_slug(franchise_id) or franchise_id.casefold()
    for letter in mod.iterdir():
        if not letter.is_dir():
            continue
        for child in letter.iterdir():
            if not child.is_dir():
                continue
            if (
                normalize_franchise_slug(child.name) == want
                or child.name.casefold() == franchise_id.casefold()
            ):
                return child
    return None
