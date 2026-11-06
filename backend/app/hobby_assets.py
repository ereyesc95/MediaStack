"""Resolve HobbyStack art from Media/Hobbies/{Collection}/."""
from __future__ import annotations

import re
from pathlib import Path

from app.config import settings

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif")
PDF_EXT = ".pdf"
ART_STEMS = {
    "cover": ("cover",),
    "logo": ("logo",),
    "icon": ("icon",),
    "landscape": ("landscape",),
    "banner": ("banner",),
    "portrait": ("portrait",),
}

STEM_BY_KIND = {
    "cover": "Cover",
    "logo": "Logo",
    "icon": "Icon",
    "landscape": "Landscape",
    "banner": "Banner",
    "portrait": "Portrait",
}


def _norm(stem: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (stem or "").casefold()).strip("-")


def _safe_folder_name(name: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*]+', " ", (name or "").strip()).strip(" .")
    return cleaned or "collection"


def hobbies_media_root() -> Path | None:
    root = Path(settings.media_root or "")
    return root if str(root) and root.is_dir() else None


def hobbies_module_dir() -> Path | None:
    """Media/Hobbies — created when missing if media root is set."""
    root = hobbies_media_root()
    if not root:
        return None
    path = root / "Hobbies"
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError:
        if not path.is_dir():
            return None
    return path


def collection_dir(collection_name: str, *, create: bool = False) -> Path | None:
    """Media/Hobbies/{Collection Name}/."""
    module = hobbies_module_dir()
    if not module:
        return None
    folder = module / _safe_folder_name(collection_name)
    if create:
        try:
            folder.mkdir(parents=True, exist_ok=True)
        except OSError:
            return None if not folder.is_dir() else folder
    return folder if folder.is_dir() else None


def ensure_collection_folder(collection_name: str) -> Path | None:
    """Create collection folder + desktop.ini; ico from Cover when present."""
    folder = collection_dir(collection_name, create=True)
    if not folder:
        return None
    try:
        from app.folder_icons import (
            ensure_folder_ico,
            find_first_image,
            mark_folder_customized,
            notify_shell_folder,
            write_desktop_ini,
        )

        write_desktop_ini(folder, force=False)
        cover = find_first_image(folder, ["Cover"])
        if cover:
            ensure_folder_ico(
                folder, overwrite=False, root=hobbies_media_root(), source=cover
            )
        mark_folder_customized(folder)
        notify_shell_folder(folder)
    except Exception:
        pass
    return folder


def rename_collection_folder(old_name: str, new_name: str) -> Path | None:
    """Rename Media/Hobbies/{old} → {new} when both names differ and old exists."""
    old_n = (old_name or "").strip()
    new_n = (new_name or "").strip()
    if not old_n or not new_n or _norm(old_n) == _norm(new_n):
        return _resolve_collection_folder(new_n) or ensure_collection_folder(new_n)
    src = _resolve_collection_folder(old_n)
    if not src:
        return ensure_collection_folder(new_n)
    dest = collection_dir(new_n, create=False)
    if not dest:
        return src
    if dest.exists():
        # Target already present — keep dest; leave src alone.
        return dest if dest.is_dir() else ensure_collection_folder(new_n)
    try:
        src.rename(dest)
    except OSError:
        return src
    return dest if dest.is_dir() else None


def _media_url(path: Path) -> str | None:
    root = hobbies_media_root()
    if not root or not path.is_file():
        return None
    try:
        rel = path.resolve().relative_to(root.resolve()).as_posix()
    except (OSError, ValueError):
        try:
            rel = path.relative_to(root).as_posix()
        except ValueError:
            return None
    from urllib.parse import quote

    return f"/api/media/file?path={quote(rel, safe='/')}"


def _find_stem(folder: Path, stems: tuple[str, ...]) -> Path | None:
    if not folder.is_dir():
        return None
    want = {_norm(s) for s in stems}
    try:
        for f in folder.iterdir():
            if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
                continue
            if _norm(f.stem) in want or f.stem.casefold() in {
                s.casefold() for s in stems
            }:
                return f
    except OSError:
        return None
    return None


def _resolve_collection_folder(name: str) -> Path | None:
    """Match Hobbies/{Name} with light aliasing (spaces/case)."""
    module = hobbies_module_dir()
    if not module or not name.strip():
        return None
    direct = module / _safe_folder_name(name)
    if direct.is_dir():
        return direct
    aliases = {
        _norm(name),
        _norm(name.replace("_", " ")),
        _norm(name.replace("-", " ")),
    }
    try:
        for child in module.iterdir():
            if child.is_dir() and _norm(child.name) in aliases:
                return child
    except OSError:
        return None
    return None


def hobby_folder_urls(collection_name: str) -> dict[str, str | None]:
    """Cover / logo / icon / scenic URLs from Media/Hobbies/{Collection}/."""
    empty = {
        "cover_url": None,
        "logo_url": None,
        "icon_url": None,
        "landscape_url": None,
        "banner_url": None,
        "portrait_url": None,
    }
    folder = _resolve_collection_folder(collection_name)
    if not folder:
        return empty
    out = dict(empty)
    for kind, key in (
        ("cover", "cover_url"),
        ("logo", "logo_url"),
        ("icon", "icon_url"),
        ("landscape", "landscape_url"),
        ("banner", "banner_url"),
        ("portrait", "portrait_url"),
    ):
        hit = _find_stem(folder, ART_STEMS[kind])
        out[key] = _media_url(hit) if hit else None
    return out


def delete_collection_folder(collection_name: str) -> bool:
    """Remove Media/Hobbies/{Collection}/ entirely (art + item files)."""
    import shutil

    folder = _resolve_collection_folder(collection_name)
    if not folder or not folder.is_dir():
        return False
    try:
        shutil.rmtree(folder)
        return True
    except OSError:
        return False


# Back-compat name used across hobbies.py
def hobby_preset_urls(preset: str) -> dict[str, str | None]:
    return hobby_folder_urls(preset)


def find_hobby_file(collection_name: str, stem: str, *, exts: tuple[str, ...]) -> Path | None:
    folder = _resolve_collection_folder(collection_name)
    if not folder or not stem.strip():
        return None
    aliases = {_norm(stem), _norm(stem.replace("_", " "))}
    try:
        for f in folder.iterdir():
            if not f.is_file() or f.suffix.lower() not in exts:
                continue
            # Skip structural art / explorer files
            if _norm(f.stem) in {"cover", "logo", "icon", "folder"}:
                if _norm(stem) not in {"cover", "logo", "icon"}:
                    continue
            if _norm(f.stem) in aliases or f.stem.casefold() == stem.casefold():
                return f
    except OSError:
        return None
    return None


def find_hobby_pdf(collection_name: str, file_stem: str | None = None) -> Path | None:
    """Find Media/Hobbies/{Collection}/{Stem}.pdf (stem defaults to collection name)."""
    stem = (file_stem or collection_name or "").strip()
    return find_hobby_file(collection_name, stem, exts=(PDF_EXT,))


def hobby_pdf_url(
    collection_name: str | None, file_stem: str | None = None
) -> str | None:
    key = (collection_name or "").strip()
    if not key:
        return None
    found = find_hobby_pdf(key, file_stem)
    return _media_url(found) if found else None


def _legacy_item_stem(collection_name: str, filename: str) -> str | None:
    """Map old `Collection - Item.ext` names to the item stem."""
    stem = Path(filename).stem
    if not stem:
        return None
    prefix = f"{(collection_name or '').strip()} - "
    if prefix and stem.casefold().startswith(prefix.casefold()):
        rest = stem[len(prefix) :].strip()
        return rest or None
    # Also tolerate normalized prefix match
    if " - " in stem:
        left, right = stem.split(" - ", 1)
        if _norm(left) == _norm(collection_name or ""):
            return right.strip() or None
    return None


def hobby_item_image_url(
    collection_name: str,
    image_path: str | None,
    *,
    item_title: str | None = None,
) -> str | None:
    """Resolve stored / on-disk item image under Media/Hobbies/{Collection}/."""
    root = hobbies_media_root()
    if not root:
        return None
    folder = _resolve_collection_folder(collection_name)
    candidates: list[Path] = []

    if image_path:
        raw = Path(image_path)
        if raw.is_file():
            candidates.append(raw)
        media_rel = root / image_path.replace("\\", "/")
        candidates.append(media_rel)
        if folder:
            candidates.append(folder / raw.name)
            # Legacy flat name: `Albums - Historia Natural.jpg` → `Historia Natural.jpg`
            legacy = _legacy_item_stem(collection_name, raw.name)
            if legacy:
                for ext in IMAGE_EXTS:
                    candidates.append(folder / f"{legacy}{ext}")
                # Exact migrated filename without re-adding ext
                candidates.append(folder / f"{legacy}{raw.suffix.lower()}")

    # Convention: Media/Hobbies/{Collection}/{Item title}.*
    title = (item_title or "").strip()
    if folder and title:
        hit = find_hobby_file(collection_name, title, exts=IMAGE_EXTS)
        if hit:
            candidates.append(hit)

    seen: set[str] = set()
    for cand in candidates:
        try:
            key = str(cand.resolve())
        except OSError:
            key = str(cand)
        if key in seen:
            continue
        seen.add(key)
        if cand.is_file():
            return _media_url(cand)
    return None


def store_collection_art_file(
    collection_name: str,
    data: bytes,
    ext: str,
    *,
    kind: str = "cover",
) -> str:
    """Save Cover/Icon/Logo/Landscape/Banner/Portrait under Media/Hobbies/{Collection}/.

    Returns media-root-relative path. Cover also regenerates folder.ico.
    """
    folder = ensure_collection_folder(collection_name)
    if not folder:
        raise RuntimeError("Hobbies media folder is not available (check MYSTACK_MEDIA_ROOT)")
    suffix = ext if ext.startswith(".") else f".{ext}"
    if suffix.lower() not in IMAGE_EXTS:
        suffix = ".png"
    kind_key = (kind or "cover").strip().casefold()
    stem = STEM_BY_KIND.get(kind_key)
    if not stem:
        stem = "Cover"
        kind_key = "cover"
    # Remove prior art of this kind (any extension)
    for f in list(folder.iterdir()) if folder.is_dir() else []:
        if f.is_file() and f.stem.casefold() == stem.casefold() and f.suffix.lower() in IMAGE_EXTS:
            try:
                f.unlink()
            except OSError:
                pass
    dest = folder / f"{stem}{suffix.lower()}"
    dest.write_bytes(data)
    if kind_key == "cover":
        try:
            from app.folder_icons import (
                ensure_folder_ico,
                mark_folder_customized,
                notify_shell_assoc_changed,
                notify_shell_folder,
                write_desktop_ini,
            )

            write_desktop_ini(folder, force=False)
            ensure_folder_ico(
                folder,
                overwrite=True,
                root=hobbies_media_root(),
                source=dest,
            )
            mark_folder_customized(folder)
            notify_shell_folder(folder)
            notify_shell_assoc_changed()
        except Exception:
            pass
    root = hobbies_media_root()
    assert root is not None
    return dest.relative_to(root).as_posix()


def store_item_image_file(
    collection_name: str,
    stem: str,
    data: bytes,
    ext: str,
) -> str:
    """Save {Item}.ext under the collection folder; return media-relative path."""
    folder = ensure_collection_folder(collection_name)
    if not folder:
        raise RuntimeError("Hobbies media folder is not available (check MYSTACK_MEDIA_ROOT)")
    safe_stem = _safe_folder_name(stem)
    suffix = ext if ext.startswith(".") else f".{ext}"
    if suffix.lower() not in IMAGE_EXTS:
        suffix = ".png"
    # Drop prior files for this stem
    for f in list(folder.iterdir()):
        if (
            f.is_file()
            and f.stem.casefold() == safe_stem.casefold()
            and f.suffix.lower() in IMAGE_EXTS
            and _norm(f.stem) not in {"cover", "logo", "icon"}
        ):
            try:
                f.unlink()
            except OSError:
                pass
    dest = folder / f"{safe_stem}{suffix.lower()}"
    dest.write_bytes(data)
    root = hobbies_media_root()
    assert root is not None
    return dest.relative_to(root).as_posix()


def migrate_legacy_assets_hobbies() -> dict:
    """One-shot: assets/hobbies/{Collection}[- rest].ext → Media/Hobbies/{Collection}/…"""
    from app.paths import PROJECT_ROOT

    stats = {"moved": 0, "skipped": 0, "errors": []}
    legacy = PROJECT_ROOT / "assets" / "hobbies"
    module = hobbies_module_dir()
    if not legacy.is_dir() or not module:
        return stats
    try:
        files = [f for f in legacy.iterdir() if f.is_file()]
    except OSError as exc:
        stats["errors"].append(str(exc))
        return stats

    for src in files:
        if src.name.startswith("."):
            stats["skipped"] += 1
            continue
        suf = src.suffix.lower()
        stem = src.stem
        cf = stem.casefold()
        collection: str
        dest_stem: str
        if cf.endswith(" - logo") or cf.endswith("-logo"):
            collection = re.sub(r"\s*-?\s*logo$", "", stem, flags=re.I).strip()
            dest_stem = "Logo"
        elif cf.endswith(" - icon") or cf.endswith("-icon"):
            collection = re.sub(r"\s*-?\s*icon$", "", stem, flags=re.I).strip()
            dest_stem = "Icon"
        elif " - " in stem:
            collection, rest = stem.split(" - ", 1)
            collection = collection.strip()
            dest_stem = rest.strip() or src.stem
        else:
            # Bare `{Collection}.ext` → Cover (images) or same-name PDF
            collection = stem
            dest_stem = "Cover" if suf in IMAGE_EXTS else stem
        if not collection:
            stats["skipped"] += 1
            continue
        dest_folder = module / _safe_folder_name(collection)
        try:
            dest_folder.mkdir(parents=True, exist_ok=True)
            dest = dest_folder / f"{_safe_folder_name(dest_stem)}{suf}"
            if dest.is_file():
                stats["skipped"] += 1
                continue
            src.replace(dest)
            stats["moved"] += 1
        except OSError as exc:
            stats["errors"].append(f"{src.name}: {exc}")
    # Best-effort: ini/ico on migrated collection folders
    try:
        for child in module.iterdir():
            if child.is_dir():
                ensure_collection_folder(child.name)
    except OSError:
        pass
    return stats
