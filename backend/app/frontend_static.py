"""Serve the built React UI (same pattern as RecordStack)."""
from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

mimetypes.add_type("application/javascript", ".js", strict=False)
mimetypes.add_type("application/javascript", ".mjs", strict=False)
mimetypes.add_type("text/css", ".css", strict=False)

_MEDIA_TYPES = {
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".woff2": "font/woff2",
}


def _media_type(path: Path) -> str:
    return _MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")


def mount_frontend(app: FastAPI, dist: Path) -> bool:
    index = dist / "index.html"
    if not index.is_file():
        return False
    assets_dir = dist / "assets"

    @app.get("/")
    async def serve_index():
        return FileResponse(index, media_type="text/html; charset=utf-8")

    if assets_dir.is_dir():

        @app.get("/assets/{asset_path:path}")
        async def serve_asset(asset_path: str):
            target = (assets_dir / asset_path).resolve()
            if not str(target).startswith(str(assets_dir.resolve())):
                raise HTTPException(404)
            if not target.is_file():
                raise HTTPException(404)
            return FileResponse(target, media_type=_media_type(target))

    return True
