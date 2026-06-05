"""Native folder picker (Windows Explorer on Windows)."""
from __future__ import annotations


def pick_folder(*, title: str = "Choose media library folder") -> str | None:
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    root.update_idletasks()
    path = filedialog.askdirectory(title=title, parent=root)
    root.destroy()
    return path or None
