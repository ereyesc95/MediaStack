"""Native folder picker (Windows Explorer on Windows)."""
from __future__ import annotations

import sys
from pathlib import Path


def pick_folder(
    *,
    title: str = "Choose media library folder",
    initial_dir: str | None = None,
) -> str | None:
    paths = pick_folders(title=title, initial_dir=initial_dir, allow_multiple=False)
    return paths[0] if paths else None


def pick_folders(
    *,
    title: str = "Choose folder",
    initial_dir: str | None = None,
    allow_multiple: bool = True,
) -> list[str]:
    """Open a native folder dialog. On Windows, multi-select uses IFileOpenDialog."""
    start = _existing_dir(initial_dir)
    if sys.platform == "win32":
        try:
            return _pick_folders_win(
                title=title,
                initial_dir=start,
                allow_multiple=allow_multiple,
            )
        except Exception:
            pass
    return _pick_folders_tk(
        title=title,
        initial_dir=start,
        allow_multiple=allow_multiple,
    )


def _existing_dir(path: str | None) -> str | None:
    if not path:
        return None
    try:
        p = Path(path)
        if p.is_dir():
            return str(p.resolve())
    except OSError:
        pass
    return None


def _pick_folders_tk(
    *,
    title: str,
    initial_dir: str | None,
    allow_multiple: bool,
) -> list[str]:
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    root.update_idletasks()
    kwargs: dict = {"title": title, "parent": root}
    if initial_dir:
        kwargs["initialdir"] = initial_dir
    # tk askdirectory is single-select; multi → first pick only (fallback)
    path = filedialog.askdirectory(**kwargs)
    root.destroy()
    if not path:
        return []
    if not allow_multiple:
        return [path]
    return [path]


def _pick_folders_win(
    *,
    title: str,
    initial_dir: str | None,
    allow_multiple: bool,
) -> list[str]:
    """Vista+ IFileOpenDialog with FOS_PICKFOLDERS (+ multi when requested)."""
    import ctypes
    from ctypes import wintypes

    ole32 = ctypes.OleDLL("ole32")
    shell32 = ctypes.WinDLL("shell32")

    CLSCTX_INPROC_SERVER = 0x1
    COINIT_APARTMENTTHREADED = 0x2
    FOS_ALLOWMULTISELECT = 0x200
    FOS_PICKFOLDERS = 0x20
    FOS_FORCEFILESYSTEM = 0x40
    SIGDN_FILESYSPATH = 0x80058000

    class GUID(ctypes.Structure):
        _fields_ = [
            ("Data1", wintypes.DWORD),
            ("Data2", wintypes.WORD),
            ("Data3", wintypes.WORD),
            ("Data4", wintypes.BYTE * 8),
        ]

        def __init__(self, guid: str) -> None:
            super().__init__()
            ole32.CLSIDFromString(ctypes.c_wchar_p(guid), ctypes.byref(self))

    def _vtable(obj, index, *argtypes, restype=ctypes.HRESULT):
        this = ctypes.cast(obj, ctypes.POINTER(ctypes.c_void_p))
        vt = ctypes.cast(this[0], ctypes.POINTER(ctypes.c_void_p))
        func = ctypes.WINFUNCTYPE(restype, ctypes.c_void_p, *argtypes)(vt[index])
        return lambda *a: func(this, *a)

    def _release(obj) -> None:
        if obj:
            _vtable(obj, 2, restype=ctypes.c_ulong)()

    dialog = ctypes.c_void_p()
    ole_ready = False
    try:
        ole32.CoInitializeEx(None, COINIT_APARTMENTTHREADED)
        ole_ready = True
        clsid = GUID("{DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7}")  # FileOpenDialog
        iid = GUID("{D57C7288-D4AD-4768-BE02-9D969532D960}")  # IFileOpenDialog
        hr = ole32.CoCreateInstance(
            ctypes.byref(clsid),
            None,
            CLSCTX_INPROC_SERVER,
            ctypes.byref(iid),
            ctypes.byref(dialog),
        )
        if hr != 0 or not dialog:
            raise OSError(f"CoCreateInstance failed: {hr:#x}")

        set_title = _vtable(dialog, 17, ctypes.c_wchar_p)
        set_options = _vtable(dialog, 9, wintypes.DWORD)
        get_options = _vtable(dialog, 10, ctypes.POINTER(wintypes.DWORD))
        show = _vtable(dialog, 3, wintypes.HWND)
        get_results = _vtable(dialog, 27, ctypes.POINTER(ctypes.c_void_p))
        get_result = _vtable(dialog, 20, ctypes.POINTER(ctypes.c_void_p))
        set_folder = _vtable(dialog, 12, ctypes.c_void_p)

        opts = wintypes.DWORD()
        get_options(ctypes.byref(opts))
        flags = opts.value | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM
        if allow_multiple:
            flags |= FOS_ALLOWMULTISELECT
        set_options(flags)
        set_title(title)

        if initial_dir:
            item = ctypes.c_void_p()
            iid_item = GUID("{43826D1E-E718-42EE-BC55-A1E261C37BFE}")
            shell32.SHCreateItemFromParsingName.argtypes = [
                wintypes.LPCWSTR,
                ctypes.c_void_p,
                ctypes.POINTER(GUID),
                ctypes.POINTER(ctypes.c_void_p),
            ]
            shell32.SHCreateItemFromParsingName.restype = ctypes.HRESULT
            hr_item = shell32.SHCreateItemFromParsingName(
                initial_dir,
                None,
                ctypes.byref(iid_item),
                ctypes.byref(item),
            )
            if hr_item == 0 and item:
                try:
                    set_folder(item)
                finally:
                    _release(item)

        hr_show = show(None)
        # Cancelled
        if hr_show in (0x800704C7, 1, -2147023673):
            return []
        if hr_show != 0:
            raise OSError(f"Show failed: {hr_show:#x}")

        paths: list[str] = []

        def _path_from_shell_item(shell_item) -> str | None:
            get_display = _vtable(
                shell_item,
                5,
                wintypes.DWORD,
                ctypes.POINTER(ctypes.c_wchar_p),
            )
            name = ctypes.c_wchar_p()
            if get_display(SIGDN_FILESYSPATH, ctypes.byref(name)) != 0:
                return None
            try:
                return name.value
            finally:
                if name:
                    ole32.CoTaskMemFree(name)

        if allow_multiple:
            results = ctypes.c_void_p()
            if get_results(ctypes.byref(results)) != 0 or not results:
                return []
            try:
                get_count = _vtable(results, 7, ctypes.POINTER(wintypes.DWORD))
                get_item = _vtable(
                    results,
                    8,
                    wintypes.DWORD,
                    ctypes.POINTER(ctypes.c_void_p),
                )
                count = wintypes.DWORD()
                get_count(ctypes.byref(count))
                for i in range(count.value):
                    si = ctypes.c_void_p()
                    if get_item(i, ctypes.byref(si)) != 0 or not si:
                        continue
                    try:
                        p = _path_from_shell_item(si)
                        if p:
                            paths.append(p)
                    finally:
                        _release(si)
            finally:
                _release(results)
        else:
            result = ctypes.c_void_p()
            if get_result(ctypes.byref(result)) != 0 or not result:
                return []
            try:
                p = _path_from_shell_item(result)
                if p:
                    paths.append(p)
            finally:
                _release(result)

        return paths
    finally:
        try:
            _release(dialog)
        except Exception:
            pass
        if ole_ready:
            try:
                ole32.CoUninitialize()
            except Exception:
                pass
