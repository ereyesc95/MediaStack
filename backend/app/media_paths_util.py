"""Resolve media folder entries (directories, symlinks, Windows .lnk) for NAS + Windows."""
from __future__ import annotations

import os
import re
import struct
import sys
from pathlib import Path


def _read_utf16_string(data: bytes, pos: int) -> tuple[str | None, int]:
    if pos + 2 > len(data):
        return None, pos
    char_count = struct.unpack_from("<H", data, pos)[0]
    pos += 2
    if char_count == 0:
        return "", pos
    byte_count = char_count * 2
    if pos + byte_count > len(data):
        return None, pos
    try:
        text = data[pos : pos + byte_count].decode("utf-16-le", errors="ignore")
    except UnicodeDecodeError:
        return None, pos + byte_count
    return text.rstrip("\0"), pos + byte_count


def _skip_id_list(data: bytes, pos: int) -> int | None:
    if pos + 2 > len(data):
        return None
    size = struct.unpack_from("<H", data, pos)[0]
    pos += 2 + size
    if pos > len(data):
        return None
    return pos


def _path_from_link_info(data: bytes, pos: int) -> Path | None:
    if pos + 4 > len(data):
        return None
    link_info_size = struct.unpack_from("<I", data, pos)[0]
    if link_info_size < 0x1C or pos + link_info_size > len(data):
        return None
    block = data[pos : pos + link_info_size]
    header_size = struct.unpack_from("<I", block, 4)[0]
    if header_size < 0x1C:
        return None
    local_offset = struct.unpack_from("<I", block, 0x10)[0]
    if local_offset and local_offset < link_info_size:
        raw = block[local_offset:]
        end = raw.find(b"\0")
        if end != -1:
            text = raw[:end].decode("ascii", errors="ignore").strip()
            if text:
                return Path(text)
    return None


def read_windows_lnk_target(path: Path) -> Path | None:
    """Best-effort .lnk target path without COM (Windows only)."""
    if sys.platform != "win32":
        return None
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if len(data) < 0x4C or data[:4] != b"L\x00\x00\x00":
        return None

    flags = struct.unpack_from("<I", data, 0x14)[0]
    pos = 0x4C

    if flags & 0x1:
        pos = _skip_id_list(data, pos)
        if pos is None:
            return None

    link_info_path: Path | None = None
    if flags & 0x2:
        link_info_path = _path_from_link_info(data, pos)
        if pos + 4 <= len(data):
            link_info_size = struct.unpack_from("<I", data, pos)[0]
            pos += link_info_size

    string_order = (
        (0x4, "name"),
        (0x8, "relative"),
        (0x10, "working"),
        (0x20, "arguments"),
        (0x40, "icon"),
    )
    strings: dict[str, str] = {}
    for flag, key in string_order:
        if flags & flag:
            text, pos = _read_utf16_string(data, pos)
            if text is None:
                break
            strings[key] = text

    for candidate in (
        link_info_path,
        Path(strings["relative"]) if strings.get("relative") else None,
        Path(strings["working"]) if strings.get("working") else None,
    ):
        if candidate and str(candidate).strip():
            return candidate
    return None


def _read_redirect_text(path: Path) -> str | None:
    try:
        text = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    if not text or text.startswith(("#", ";")):
        return None
    return text.replace("\\", "/")


def read_path_sidecar(entry: Path) -> Path | None:
    """Read NAS-friendly `.path` sidecar (relative path from media root)."""
    if entry.suffix.casefold() == ".path":
        text = _read_redirect_text(entry)
        return Path(text) if text else None
    sidecar = entry.with_suffix(".path")
    if not sidecar.is_file():
        return None
    text = _read_redirect_text(sidecar)
    return Path(text) if text else None


def resolve_media_entry(entry: Path, *, media_root: Path | None = None) -> Path | None:
    """Return a directory path for a catalog entry (folder, symlink, .lnk, or .path)."""
    try:
        if entry.is_dir():
            return entry
        is_junction = getattr(entry, "is_junction", lambda: False)
        if entry.is_symlink() or is_junction():
            target = entry.resolve()
            return target if target.is_dir() else None
    except OSError:
        pass

    if entry.suffix.casefold() == ".lnk":
        target = read_windows_lnk_target(entry)
        if target:
            try:
                resolved = target.resolve()
            except OSError:
                resolved = target
            if resolved.is_dir():
                return resolved
            parent = resolved.parent
            if parent.is_dir():
                return parent

    rel = read_path_sidecar(entry)
    if rel:
        if media_root and not rel.is_absolute():
            target = (media_root / rel).resolve()
        else:
            try:
                target = rel.resolve()
            except OSError:
                target = rel
        if target.is_dir():
            return target

    return None


def safe_relative(path: Path, root: Path) -> str | None:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return None


def is_under_root(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def entry_display_name(entry: Path) -> str:
    name = entry.name
    low = name.casefold()
    if low.endswith(".lnk") or low.endswith(".path"):
        name = Path(name).stem
    return name


def _folder_has_direct_artwork(folder: Path) -> bool:
    try:
        for child in folder.iterdir():
            low = child.name.casefold()
            if child.is_dir() and low in ("[artwork]", "artwork"):
                return True
            if child.is_file() and low.startswith("cover"):
                return True
    except OSError:
        return False
    return False


def refine_resolved_work_folder(display_entry: Path, resolved: Path) -> Path:
    """If a .lnk/.path points at a franchise hub, prefer the matching dated work folder.

    Example: Video/2017.06.12. The HIM Docuseries.lnk → Series/T/The HIM Docuseries
    while artwork lives in Series/T/The HIM Docuseries/2017.06.12. The HIM Docuseries/.
    """
    if not resolved.is_dir():
        return resolved
    if _folder_has_direct_artwork(resolved):
        return resolved

    want = entry_display_name(display_entry).casefold().strip()
    if not want:
        return resolved

    try:
        children = [c for c in resolved.iterdir() if c.is_dir()]
    except OSError:
        return resolved

    for child in children:
        child_name = entry_display_name(child).casefold().strip()
        if child_name == want or child.name.casefold().strip() == want:
            return child

    date_re = re.compile(r"^\d{4}(?:\.\d{2}(?:\.\d{2})?)?\.\s*")
    want_title = date_re.sub("", want).strip()
    if want_title and want_title != want:
        for child in children:
            child_title = date_re.sub(
                "", entry_display_name(child).casefold()
            ).strip()
            if child_title == want_title:
                return child

    return resolved
