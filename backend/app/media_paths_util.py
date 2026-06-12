"""Resolve media folder entries (directories, symlinks, Windows .lnk) for NAS + Windows."""
from __future__ import annotations

import os
import struct
import sys
from pathlib import Path


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
        if pos + 2 > len(data):
            return None
        slen = struct.unpack_from("<H", data, pos)[0]
        pos += 2 + slen * 2
    if flags & 0x2:
        if pos + 2 > len(data):
            return None
        slen = struct.unpack_from("<H", data, pos)[0]
        pos += 2 + slen * 2
    if flags & 0x4:
        if pos + 2 > len(data):
            return None
        slen = struct.unpack_from("<H", data, pos)[0]
        pos += 2 + slen * 2
    if flags & 0x8:
        if pos + 16 > len(data):
            return None
        pos += 16
    if flags & 0x20:
        if pos + 4 > len(data):
            return None
        slen = struct.unpack_from("<I", data, pos)[0]
        pos += 4
        raw = data[pos : pos + slen]
        try:
            text = raw.decode("utf-16-le").split("\0", 1)[0]
            return Path(text) if text else None
        except UnicodeDecodeError:
            return None
    return None


def resolve_media_entry(entry: Path) -> Path | None:
    """Return a directory path for a catalog entry (folder, symlink, or .lnk)."""
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
        if target and target.is_dir():
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
    if name.casefold().endswith(".lnk"):
        name = name[:-4]
    return name
