import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app import crud
from app.config import settings
from app.database import SessionLocal, get_db
from app.deps import require_admin
from app.models import User
from app.schemas import SyncRequest
from app.services.sync_folders import run_folder_sync

router = APIRouter(prefix="/api/sync", tags=["sync"])

_jobs: list[dict] = []


async def _do_sync(module: str, media_root: str, tmdb_key: str | None, mb_ua: str) -> list[dict]:
    db = SessionLocal()
    try:
        return await run_folder_sync(
            db,
            media_root=media_root,
            module=module,
            tmdb_api_key=tmdb_key,
            musicbrainz_ua=mb_ua,
        )
    finally:
        db.close()


@router.post("/folders")
async def sync_folders(
    body: SyncRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    root = body.media_root or settings.media_root
    if not root:
        raise HTTPException(400, "Set MEDIASTACK_MEDIA_ROOT or pass media_root")
    results = await _do_sync(
        body.module,
        root,
        crud.get_tmdb_key(db),
        settings.musicbrainz_user_agent,
    )
    _jobs.append({"module": body.module, "results": results})
    return {"status": "completed", "results": results}


@router.post("/folders/background")
def sync_folders_background(
    body: SyncRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    root = body.media_root or settings.media_root
    if not root:
        raise HTTPException(400, "Set MEDIASTACK_MEDIA_ROOT or pass media_root")
    tmdb_key = crud.get_tmdb_key(db)
    mb_ua = settings.musicbrainz_user_agent

    def _task():
        results = asyncio.run(_do_sync(body.module, root, tmdb_key, mb_ua))
        _jobs.append({"module": body.module, "results": results})

    background_tasks.add_task(_task)
    return {"status": "started", "module": body.module}


@router.get("/jobs")
def list_jobs():
    return {"jobs": _jobs[-10:]}
