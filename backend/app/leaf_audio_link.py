"""Create Series/Movies/Books/Games leaf Audio/.lnk shortcuts to Music releases."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from app.band_library import AUDIO_CATEGORIES
from app.series_audio import AUDIO_BUCKETS

CATEGORY_BY_FOLD = {name.casefold(): name for name in AUDIO_CATEGORIES.values()}
VARIOUS_ARTISTS = "various artists"


def _ps_single_quote(value: str) -> str:
    """Embed a path in a PowerShell single-quoted string (no escape mangling)."""
    return "'" + value.replace("'", "''") + "'"


def _category_parent_release(path: Path) -> tuple[Path, str] | None:
    """Walk up until parent is an Audio category folder; return (release_dir, Category)."""
    current = path.resolve()
    if not current.is_dir():
        return None
    for _ in range(8):
        parent = current.parent
        if parent == current:
            return None
        cat = CATEGORY_BY_FOLD.get(parent.name.casefold())
        if cat:
            return current, cat
        current = parent
    return None


def parse_music_release(
    selected: Path, *, media_root: Path
) -> tuple[str, str, Path] | None:
    """Return (artist_name, category_folder, release_dir) for a Music release path."""
    try:
        root = media_root.resolve()
        release_hit = _category_parent_release(selected)
        if not release_hit:
            return None
        release_dir, category = release_hit
        rel = release_dir.relative_to(root)
    except (OSError, ValueError):
        return None
    parts = list(rel.parts)
    if len(parts) < 3 or parts[0].casefold() != "music":
        return None
    # Music/{Letter}/{Artist}/[Audio/]{Category}/{Release}
    cat_idx = next(
        (
            i
            for i, p in enumerate(parts)
            if p.casefold() == category.casefold()
        ),
        None,
    )
    if cat_idx is None or cat_idx < 2:
        return None
    if parts[cat_idx - 1].casefold() == "audio":
        artist_idx = cat_idx - 2
    else:
        artist_idx = cat_idx - 1
    if artist_idx < 1:
        return None
    artist = parts[artist_idx]
    if not artist.strip():
        return None
    return artist, category, release_dir


def shortcut_display_name(release_dir: Path, artist: str) -> str:
    base = release_dir.name
    if artist.strip().casefold() == VARIOUS_ARTISTS:
        return base
    return f"{base} [By {artist}]"


def resolve_or_create_audio_bucket(leaf_dir: Path) -> Path:
    """Prefer existing Audio/, else existing [Audio]/, else create Audio/."""
    audio: Path | None = None
    bracket: Path | None = None
    try:
        for child in leaf_dir.iterdir():
            if not child.is_dir():
                continue
            name = child.name.casefold()
            if name in AUDIO_BUCKETS and name == "audio":
                audio = child
            elif name in AUDIO_BUCKETS:
                bracket = child
    except OSError:
        pass
    if audio is not None:
        return audio
    if bracket is not None:
        return bracket
    dest = leaf_dir / "Audio"
    dest.mkdir(parents=True, exist_ok=True)
    return dest


def create_windows_lnk(lnk_path: Path, target: Path) -> None:
    """Write a Windows .lnk pointing at ``target`` (folder)."""
    if sys.platform != "win32":
        raise OSError("Windows .lnk creation requires win32")
    lnk_path.parent.mkdir(parents=True, exist_ok=True)
    resolved = target.resolve()
    target_s = str(resolved)
    # Folder shortcuts resolve more reliably in Explorer with a trailing slash.
    if resolved.is_dir() and not target_s.endswith(("\\", "/")):
        target_s = target_s + "\\"
    work_s = str(resolved) if resolved.is_dir() else str(resolved.parent)
    lnk_s = str(lnk_path.resolve()) if lnk_path.parent.exists() else str(lnk_path)
    script = "\n".join(
        [
            f"$lnk = {_ps_single_quote(lnk_s)}",
            f"$target = {_ps_single_quote(target_s)}",
            f"$work = {_ps_single_quote(work_s)}",
            "$shell = New-Object -ComObject WScript.Shell",
            "$s = $shell.CreateShortcut($lnk)",
            "$s.TargetPath = $target",
            "$s.WorkingDirectory = $work",
            "$s.Save()",
            "if (-not (Test-Path -LiteralPath $lnk)) { exit 1 }",
            "$check = $shell.CreateShortcut($lnk)",
            "if ([string]::IsNullOrWhiteSpace($check.TargetPath)) { exit 2 }",
            "Write-Output $check.TargetPath",
        ]
    )
    proc = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    if proc.returncode != 0 or not lnk_path.is_file():
        detail = (proc.stderr or proc.stdout or "").strip()
        raise OSError(detail or "Failed to create .lnk")
    # Confirm the saved shortcut still points at the release folder.
    from app.media_paths_util import read_windows_lnk_target

    saved = read_windows_lnk_target(lnk_path)
    if saved is None:
        raise OSError("Created .lnk has no readable target path")


def _lnk_exists(cat_dir: Path, display_name: str) -> bool:
    want = f"{display_name}.lnk".casefold()
    try:
        for child in cat_dir.iterdir():
            if child.is_file() and child.name.casefold() == want:
                return True
    except OSError:
        pass
    return False


def link_music_releases_to_leaf(
    *,
    leaf_folder: Path,
    selected_folders: list[Path],
    media_root: Path,
) -> dict:
    """Create Audio/{Category}/*.lnk under leaf for each Music release folder.

    Skips collisions and non-Music/non-category picks silently.
    """
    created = 0
    skipped = 0
    if not leaf_folder.is_dir():
        return {"created": created, "skipped": skipped}

    bucket = resolve_or_create_audio_bucket(leaf_folder)

    for raw in selected_folders:
        try:
            selected = Path(raw)
        except (TypeError, ValueError):
            skipped += 1
            continue
        parsed = parse_music_release(selected, media_root=media_root)
        if not parsed:
            skipped += 1
            continue
        artist, category, release_dir = parsed
        display = shortcut_display_name(release_dir, artist)
        cat_dir = bucket / category
        try:
            cat_dir.mkdir(parents=True, exist_ok=True)
        except OSError:
            skipped += 1
            continue
        if _lnk_exists(cat_dir, display):
            skipped += 1
            continue
        lnk_path = cat_dir / f"{display}.lnk"
        try:
            create_windows_lnk(lnk_path, release_dir)
        except OSError:
            skipped += 1
            continue
        created += 1

    return {"created": created, "skipped": skipped}
