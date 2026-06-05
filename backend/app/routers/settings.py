import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.deps import require_admin
from app.folder_picker import pick_folder
from app.models import User
from app.user_settings import get_saved_media_root, is_valid_media_root, save_media_root

router = APIRouter(prefix="/api/settings", tags=["settings"])


class MediaRootBody(BaseModel):
    path: str


@router.get("")
def get_settings():
    saved = get_saved_media_root()
    effective = saved or settings.media_root or ""
    configured = is_valid_media_root(effective)
    chosen = is_valid_media_root(saved)
    return {
        "media_root": effective if configured else "",
        "media_root_configured": configured,
        "media_root_chosen": chosen,
        "media_server_url": settings.media_server_url,
        "database_url": settings.database_url.split("@")[-1]
        if "@" in settings.database_url
        else settings.database_url,
    }


@router.post("/media-root")
def set_media_root(
    body: MediaRootBody,
    _admin: User = Depends(require_admin),
):
    path = (body.path or "").strip()
    if not is_valid_media_root(path):
        raise HTTPException(400, "Folder does not exist or is not accessible")
    resolved = save_media_root(path)
    settings.media_root = resolved
    return {"media_root": resolved, "media_root_configured": True}


@router.post("/pick-media-root")
async def pick_media_root(_admin: User = Depends(require_admin)):
    loop = asyncio.get_running_loop()
    try:
        path = await loop.run_in_executor(
            None,
            lambda: pick_folder(title="Choose MediaStack source folder"),
        )
    except Exception as exc:
        raise HTTPException(500, f"Could not open folder picker: {exc}") from exc
    if not path:
        raise HTTPException(400, "No folder selected")
    if not is_valid_media_root(path):
        raise HTTPException(400, "Selected folder is not accessible")
    resolved = save_media_root(path)
    settings.media_root = resolved
    return {"media_root": resolved, "media_root_configured": True}
