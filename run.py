#!/usr/bin/env python3
"""Start MediaStack API on port 8766 (RecordStack-compatible stack)."""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
DEFAULT_PORT = 8766

CHROME_PATHS = [
    Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"))
    / "Google/Chrome/Application/chrome.exe",
    Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)"))
    / "Google/Chrome/Application/chrome.exe",
    Path(os.environ.get("LOCALAPPDATA", ""))
    / "Google/Chrome/Application/chrome.exe",
]


def open_chrome(url: str) -> None:
    for path in CHROME_PATHS:
        if path.is_file():
            subprocess.Popen([str(path), url], close_fds=True)
            print(f"Opened in Chrome: {url}")
            return
    print(f"Chrome not found. Open manually: {url}")


def ensure_deps() -> None:
    try:
        import uvicorn  # noqa: F401
    except ImportError:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "-r", str(BACKEND / "requirements.txt")]
        )


def run_import_sql(replace: bool = False) -> None:
    sys.path.insert(0, str(BACKEND))
    from app.database import init_db
    from app.import_databinger import import_from_sql_file

    init_db()
    result = import_from_sql_file(replace=replace)
    print(f"Import done: {sum(result.tables.values())} statements across {len(result.tables)} tables")
    for table, count in sorted(result.tables.items()):
        print(f"  {table}: {count}")
    if result.errors:
        for err in result.errors[:5]:
            print("Error:", err[:240].encode("ascii", errors="replace").decode())


def main() -> None:
    parser = argparse.ArgumentParser(description="MediaStack")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument(
        "--import-sql",
        action="store_true",
        help="Import data/databinger.sql into the local database and exit",
    )
    parser.add_argument(
        "--import-replace",
        action="store_true",
        help="Drop tables before SQL import",
    )
    args = parser.parse_args()

    ensure_deps()

    if args.import_sql:
        run_import_sql(replace=args.import_replace)
        return

    if not (ROOT / "data" / "mediastack.db").exists() and (ROOT / "data" / "databinger.sql").is_file():
        print("First run: importing databinger.sql …")
        run_import_sql(replace=False)

    if (ROOT / "frontend" / "dist").is_dir():
        open_url = f"http://127.0.0.1:{args.port}/"
        print(f"MediaStack: {open_url}")
    else:
        open_url = "http://localhost:5174/"
        print("Dev UI: cd frontend && npm install && npm run dev")

    if not args.no_browser:
        open_chrome(open_url)

    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=args.port,
        reload=False,
        app_dir=str(BACKEND),
    )


if __name__ == "__main__":
    main()
