"""FileStack — scan and mutate `{media_root}/Files/{Tab}/[Nested]/file`."""
from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

from app.config import settings

FILES_ROOT_NAME = "Files"
EXCLUSIVE_TAB_NAME = "Exclusive"


def tab_is_exclusive(tab: str) -> bool:
    """True when a Files tab name is the NSFW Exclusive folder."""
    return (tab or "").strip().casefold() == EXCLUSIVE_TAB_NAME.casefold()


def path_is_exclusive_files(rel_path: str) -> bool:
    """True when a Files-relative path is under the Exclusive tab."""
    parts = [p for p in (rel_path or "").replace("\\", "/").split("/") if p]
    return bool(parts) and tab_is_exclusive(parts[0])

_SYSTEM_NAMES = frozenset(
    {
        "desktop.ini",
        "thumbs.db",
        "folder.ico",
        "$recycle.bin",
        "system volume information",
        ".ds_store",
        ".git",
    }
)

_PREVIEW_EXT = frozenset(
    {
        # images
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
        ".bmp",
        ".svg",
        # pdf
        ".pdf",
        # text
        ".txt",
        ".md",
        ".csv",
        ".json",
        ".xml",
        ".log",
        ".html",
        ".htm",
        ".css",
        ".js",
        ".ts",
        ".tsx",
        ".jsx",
        ".py",
        ".yml",
        ".yaml",
        ".ini",
        ".cfg",
        ".conf",
        # audio
        ".mp3",
        ".m4a",
        ".wav",
        ".ogg",
        ".flac",
        ".aac",
        # video
        ".mp4",
        ".webm",
        ".mkv",
        ".mov",
        ".avi",
        ".m4v",
    }
)

_SAFE_NAME_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def media_root() -> Path:
    root = settings.media_root
    if not root:
        raise ValueError("MYSTACK_MEDIA_ROOT not set")
    return Path(root).resolve()


def files_root() -> Path:
    root = media_root() / FILES_ROOT_NAME
    root.mkdir(parents=True, exist_ok=True)
    return root


def _is_hidden_or_system(path: Path) -> bool:
    name = path.name
    if name.startswith("."):
        return True
    if name.casefold() in _SYSTEM_NAMES:
        return True
    if sys.platform == "win32":
        try:
            import ctypes

            attrs = ctypes.windll.kernel32.GetFileAttributesW(str(path))
            if attrs == -1:
                return False
            # FILE_ATTRIBUTE_HIDDEN=2, SYSTEM=4
            return bool(attrs & 0x6)
        except Exception:
            return False
    return False


def _skip_entry(path: Path) -> bool:
    return _is_hidden_or_system(path)


def sanitize_folder_name(raw: str) -> str:
    name = (raw or "").strip().strip(". ")
    name = _SAFE_NAME_RE.sub("", name)
    name = re.sub(r"\s+", " ", name).strip()
    if not name or name in {".", ".."} or name.casefold() in _SYSTEM_NAMES:
        raise ValueError("Invalid folder name")
    if name.startswith("."):
        raise ValueError("Invalid folder name")
    return name


def sanitize_file_name(raw: str) -> str:
    name = (raw or "").strip()
    name = _SAFE_NAME_RE.sub("", name).strip()
    if not name or name in {".", ".."} or name.casefold() in _SYSTEM_NAMES:
        raise ValueError("Invalid file name")
    if name.startswith("."):
        raise ValueError("Invalid file name")
    return name


def tab_label(folder_name: str) -> str:
    """Title-case words for display; tabs render uppercased in UI."""
    parts = re.split(r"(\s+|-|_)", folder_name.strip())
    out: list[str] = []
    for p in parts:
        if not p or p.isspace() or p in "-_":
            out.append(p)
            continue
        out.append(p[:1].upper() + p[1:] if len(p) > 1 else p.upper())
    return "".join(out) or folder_name


def resolve_under_files(rel: str) -> Path:
    """Resolve a path relative to Files/; must stay under Files/."""
    root = files_root()
    cleaned = rel.replace("\\", "/").lstrip("/")
    if ".." in cleaned.split("/"):
        raise ValueError("Invalid path")
    target = (root / cleaned).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise ValueError("Path escapes Files root") from exc
    return target


def rel_from_files(path: Path) -> str:
    return path.resolve().relative_to(files_root()).as_posix()


def rel_from_media(path: Path) -> str:
    return path.resolve().relative_to(media_root()).as_posix()


def media_file_url(path: Path) -> str:
    from urllib.parse import quote

    rel = rel_from_media(path)
    return f"/api/media/file?path={quote(rel, safe='/')}"


def open_local_url(path: Path) -> str:
    from urllib.parse import quote

    rel = rel_from_media(path)
    return f"/api/media/open-local?path={quote(rel, safe='/')}"


def unique_dest(dest: Path) -> Path:
    """Auto-rename if dest exists: `name (1).ext`, `name (2).ext`, …"""
    if not dest.exists():
        return dest
    stem = dest.stem
    suffix = dest.suffix
    parent = dest.parent
    n = 1
    while True:
        candidate = parent / f"{stem} ({n}){suffix}"
        if not candidate.exists():
            return candidate
        n += 1


def list_tabs(*, nsfw_unlocked: bool = False) -> list[dict]:
    root = files_root()
    tabs: list[dict] = []
    try:
        entries = sorted(
            (p for p in root.iterdir() if p.is_dir() and not _skip_entry(p)),
            key=lambda p: p.name.casefold(),
        )
    except OSError:
        return []
    for folder in entries:
        if tab_is_exclusive(folder.name) and not nsfw_unlocked:
            continue
        files = list_files_in_tab(folder.name)
        nested = list_nested_folders(folder.name)
        tabs.append(
            {
                "id": folder.name,
                "name": folder.name,
                "label": tab_label(folder.name),
                "file_count": len(files),
                "nested_folders": nested,
            }
        )
    return tabs


def list_nested_folders(tab: str) -> list[dict]:
    tab_path = resolve_under_files(tab)
    if not tab_path.is_dir():
        return []
    out: list[dict] = []
    try:
        for child in sorted(tab_path.iterdir(), key=lambda p: p.name.casefold()):
            if not child.is_dir() or _skip_entry(child):
                continue
            # Only one nesting level — do not count deeper dirs as folders here.
            file_count = 0
            try:
                for f in child.iterdir():
                    if f.is_file() and not _skip_entry(f):
                        file_count += 1
            except OSError:
                pass
            out.append(
                {
                    "id": child.name,
                    "name": child.name,
                    "label": tab_label(child.name),
                    "file_count": file_count,
                }
            )
    except OSError:
        return []
    return out


def _file_entry(path: Path, nested: str | None) -> dict:
    ext = path.suffix.lstrip(".").lower()
    full_ext = path.suffix.lower()
    return {
        "id": rel_from_files(path),
        "name": path.name,
        "ext": ext,
        "nested_folder": nested,
        "url": media_file_url(path),
        "open_url": open_local_url(path),
        "previewable": full_ext in _PREVIEW_EXT,
        "size": path.stat().st_size if path.is_file() else 0,
    }


def list_files_in_tab(tab: str) -> list[dict]:
    tab_path = resolve_under_files(tab)
    if not tab_path.is_dir():
        return []
    items: list[dict] = []
    try:
        children = sorted(tab_path.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return []
    for child in children:
        if _skip_entry(child):
            continue
        if child.is_file():
            items.append(_file_entry(child, None))
            continue
        if not child.is_dir():
            continue
        # One nested level only — flatten files inside.
        try:
            nested_files = sorted(
                (f for f in child.iterdir() if f.is_file() and not _skip_entry(f)),
                key=lambda p: p.name.casefold(),
            )
        except OSError:
            continue
        for f in nested_files:
            items.append(_file_entry(f, child.name))
    return items


def create_tab(name: str) -> dict:
    safe = sanitize_folder_name(name)
    dest = files_root() / safe
    if dest.exists():
        raise FileExistsError(f"Tab “{safe}” already exists")
    dest.mkdir(parents=True, exist_ok=False)
    return {
        "id": safe,
        "name": safe,
        "label": tab_label(safe),
        "file_count": 0,
        "nested_folders": [],
    }


def rename_tab(tab: str, new_name: str) -> dict:
    src = resolve_under_files(tab)
    if not src.is_dir():
        raise FileNotFoundError("Tab not found")
    safe = sanitize_folder_name(new_name)
    dest = files_root() / safe
    if dest.resolve() != src.resolve() and dest.exists():
        raise FileExistsError(f"Tab “{safe}” already exists")
    if dest.resolve() != src.resolve():
        src.rename(dest)
    return {
        "id": safe,
        "name": safe,
        "label": tab_label(safe),
        "file_count": len(list_files_in_tab(safe)),
        "nested_folders": list_nested_folders(safe),
    }


def delete_tab(tab: str) -> None:
    target = resolve_under_files(tab)
    if not target.is_dir():
        raise FileNotFoundError("Tab not found")
    shutil.rmtree(target)


def create_nested_folder(tab: str, name: str) -> dict:
    tab_path = resolve_under_files(tab)
    if not tab_path.is_dir():
        raise FileNotFoundError("Tab not found")
    safe = sanitize_folder_name(name)
    dest = tab_path / safe
    if dest.exists():
        raise FileExistsError(f"Folder “{safe}” already exists")
    dest.mkdir(parents=True, exist_ok=False)
    return {
        "id": safe,
        "name": safe,
        "label": tab_label(safe),
        "file_count": 0,
    }


def rename_nested_folder(tab: str, folder: str, new_name: str) -> dict:
    src = resolve_under_files(f"{tab}/{folder}")
    if not src.is_dir():
        raise FileNotFoundError("Folder not found")
    # Ensure it's exactly one level under tab
    if src.parent.resolve() != resolve_under_files(tab).resolve():
        raise ValueError("Invalid folder")
    safe = sanitize_folder_name(new_name)
    dest = src.parent / safe
    if dest.resolve() != src.resolve() and dest.exists():
        raise FileExistsError(f"Folder “{safe}” already exists")
    if dest.resolve() != src.resolve():
        src.rename(dest)
    return {
        "id": safe,
        "name": safe,
        "label": tab_label(safe),
        "file_count": sum(
            1 for f in dest.iterdir() if f.is_file() and not _skip_entry(f)
        )
        if dest.is_dir()
        else 0,
    }


def delete_nested_folder(tab: str, folder: str) -> None:
    target = resolve_under_files(f"{tab}/{folder}")
    if not target.is_dir():
        raise FileNotFoundError("Folder not found")
    if target.parent.resolve() != resolve_under_files(tab).resolve():
        raise ValueError("Invalid folder")
    shutil.rmtree(target)


def rename_file(rel: str, new_name: str) -> dict:
    src = resolve_under_files(rel)
    if not src.is_file():
        raise FileNotFoundError("File not found")
    safe = sanitize_file_name(new_name)
    dest = unique_dest(src.parent / safe) if (src.parent / safe) != src else src
    # If only case change on case-insensitive FS, allow direct rename when same path
    candidate = src.parent / safe
    if candidate.resolve() == src.resolve() or not candidate.exists():
        dest = candidate
    else:
        dest = unique_dest(candidate)
    if dest != src:
        src.rename(dest)
    nested = None
    tab_root = files_root()
    try:
        parts = dest.resolve().relative_to(tab_root).parts
        if len(parts) == 3:
            nested = parts[1]
    except ValueError:
        pass
    return _file_entry(dest, nested)


def _dest_dir(tab: str, nested: str | None) -> Path:
    if nested:
        d = resolve_under_files(f"{tab}/{nested}")
        if not d.is_dir():
            raise FileNotFoundError("Destination folder not found")
        return d
    d = resolve_under_files(tab)
    if not d.is_dir():
        raise FileNotFoundError("Destination tab not found")
    return d


def move_files(paths: list[str], tab: str, nested: str | None = None) -> list[dict]:
    dest_dir = _dest_dir(tab, nested)
    results: list[dict] = []
    for rel in paths:
        src = resolve_under_files(rel)
        if not src.is_file():
            continue
        dest = unique_dest(dest_dir / src.name)
        if src.resolve() == dest.resolve():
            results.append(_file_entry(src, nested))
            continue
        shutil.move(str(src), str(dest))
        results.append(_file_entry(dest, nested))
    return results


def copy_files(paths: list[str], tab: str, nested: str | None = None) -> list[dict]:
    dest_dir = _dest_dir(tab, nested)
    results: list[dict] = []
    for rel in paths:
        src = resolve_under_files(rel)
        if not src.is_file():
            continue
        dest = unique_dest(dest_dir / src.name)
        shutil.copy2(str(src), str(dest))
        results.append(_file_entry(dest, nested))
    return results


def delete_files(paths: list[str]) -> int:
    n = 0
    for rel in paths:
        target = resolve_under_files(rel)
        if target.is_file():
            target.unlink()
            n += 1
    return n
