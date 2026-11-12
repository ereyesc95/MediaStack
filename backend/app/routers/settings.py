import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api_credentials import (
    clear_api_credentials,
    export_api_credentials_text,
    list_api_credentials,
    save_api_credentials,
)
from app.config import settings
from app.database import get_db
from app.deps import require_admin
from app.folder_picker import pick_folder
from app.models import User
from app.profiles import (
    ADMIN_USER_ID,
    ensure_profiles,
    list_profiles,
    profile_display_name,
    slot_default_name,
)
from app.user_settings import (
    DEFAULT_MEMBER_PHOTO_REFRESH_DAYS,
    create_media_library,
    get_member_photo_refresh_days,
    get_play_videos_locally,
    get_saved_admin_nsfw_password,
    get_saved_admin_password,
    get_saved_media_root,
    get_saved_media_server_url,
    get_saved_public_url,
    is_valid_media_root,
    save_admin_passwords,
    save_media_root,
    save_media_server_url,
    save_member_photo_refresh_days,
    save_play_videos_locally,
    save_public_url,
    suggested_library_parent,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


class MediaRootBody(BaseModel):
    path: str


class CreateLibraryBody(BaseModel):
    parent_path: str


class PhotoRefreshDaysBody(BaseModel):
    days: int


class ApiCredentialBody(BaseModel):
    key: str | None = None
    secret: str | None = None
    user_agent: str | None = None


class AppUrlsBody(BaseModel):
    public_url: str | None = None
    media_server_url: str | None = None


class AdminPasswordsBody(BaseModel):
    admin_password: str | None = None
    admin_nsfw_password: str | None = None


class GuestProfileBody(BaseModel):
    display_name: str


class PlayVideosLocallyBody(BaseModel):
    enabled: bool


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
        "public_url": settings.public_url or "",
        "suggested_library_parent": suggested_library_parent(),
        "member_photo_refresh_days": get_member_photo_refresh_days(),
        "member_photo_refresh_days_default": DEFAULT_MEMBER_PHOTO_REFRESH_DAYS,
        "database_url": settings.database_url.split("@")[-1]
        if "@" in settings.database_url
        else settings.database_url,
        "admin_password_custom": bool(get_saved_admin_password()),
        "admin_nsfw_password_custom": bool(get_saved_admin_nsfw_password()),
        "play_videos_locally": get_play_videos_locally(),
    }


@router.put("/play-videos-locally")
def put_play_videos_locally(
    body: PlayVideosLocallyBody,
    _admin: User = Depends(require_admin),
):
    enabled = save_play_videos_locally(bool(body.enabled))
    return {"play_videos_locally": enabled}


@router.post("/member-photo-refresh-days")
def set_member_photo_refresh_days(
    body: PhotoRefreshDaysBody,
    _admin: User = Depends(require_admin),
):
    days = save_member_photo_refresh_days(body.days)
    return {"member_photo_refresh_days": days}


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
    from app.folder_icons import ensure_media_module_roots

    ensure_media_module_roots(force_ini=True)
    return {"media_root": resolved, "media_root_configured": True}


@router.post("/pick-media-root")
async def pick_media_root(_admin: User = Depends(require_admin)):
    loop = asyncio.get_running_loop()
    try:
        path = await loop.run_in_executor(
            None,
            lambda: pick_folder(
                title="Choose MyStack source folder",
                initial_dir=suggested_library_parent(),
            ),
        )
    except Exception as exc:
        raise HTTPException(500, f"Could not open folder picker: {exc}") from exc
    if not path:
        raise HTTPException(400, "No folder selected")
    if not is_valid_media_root(path):
        raise HTTPException(400, "Selected folder is not accessible")
    resolved = save_media_root(path)
    settings.media_root = resolved
    from app.folder_icons import ensure_media_module_roots

    ensure_media_module_roots(force_ini=True)
    return {"media_root": resolved, "media_root_configured": True}


@router.post("/create-library")
def create_library(
    body: CreateLibraryBody,
    _admin: User = Depends(require_admin),
):
    parent = (body.parent_path or "").strip()
    if not parent:
        raise HTTPException(400, "Parent folder is required")
    try:
        resolved = create_media_library(parent)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except OSError as exc:
        raise HTTPException(500, f"Could not create library: {exc}") from exc
    return {"media_root": resolved, "media_root_configured": True}


@router.post("/pick-create-library")
async def pick_create_library(_admin: User = Depends(require_admin)):
    loop = asyncio.get_running_loop()
    try:
        path = await loop.run_in_executor(
            None,
            lambda: pick_folder(
                title="Choose where to create the Media folder",
                initial_dir=suggested_library_parent(),
            ),
        )
    except Exception as exc:
        raise HTTPException(500, f"Could not open folder picker: {exc}") from exc
    if not path:
        raise HTTPException(400, "No folder selected")
    try:
        resolved = create_media_library(path)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except OSError as exc:
        raise HTTPException(500, f"Could not create library: {exc}") from exc
    return {"media_root": resolved, "media_root_configured": True}


@router.get("/api-credentials")
def api_credentials_list(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return {"services": list_api_credentials(db)}


@router.get("/api-credentials/export")
def api_credentials_export(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return {
        "filename": "mystack-api-credentials.txt",
        "text": export_api_credentials_text(db),
    }


@router.put("/api-credentials/{service_id}")
def api_credentials_save(
    service_id: str,
    body: ApiCredentialBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    try:
        service = save_api_credentials(
            db,
            service_id,
            key=body.key,
            secret=body.secret,
            user_agent=body.user_agent,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"service": service}


@router.delete("/api-credentials/{service_id}")
def api_credentials_clear(
    service_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    try:
        service = clear_api_credentials(db, service_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"service": service}


@router.get("/app-urls")
def get_app_urls(_admin: User = Depends(require_admin)):
    return {
        "public_url": settings.public_url or "",
        "public_url_saved": bool(get_saved_public_url()),
        "media_server_url": settings.media_server_url or "",
        "media_server_url_saved": bool(get_saved_media_server_url()),
    }


@router.put("/app-urls")
def put_app_urls(
    body: AppUrlsBody,
    _admin: User = Depends(require_admin),
):
    if body.public_url is not None:
        saved = save_public_url(body.public_url)
        settings.public_url = saved
    if body.media_server_url is not None:
        saved = save_media_server_url(body.media_server_url)
        if saved:
            settings.media_server_url = saved
        else:
            # Fall back to settings default when cleared
            from app.config import Settings

            settings.media_server_url = Settings().media_server_url
    return {
        "public_url": settings.public_url or "",
        "public_url_saved": bool(get_saved_public_url()),
        "media_server_url": settings.media_server_url or "",
        "media_server_url_saved": bool(get_saved_media_server_url()),
    }


@router.get("/admin-security")
def get_admin_security(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    ensure_profiles(db)
    profiles = []
    for p in list_profiles(db):
        profiles.append(
            {
                "user_id": p["user_id"],
                "username": p["username"],
                "is_admin": p["is_admin"],
                "avatar": p.get("avatar"),
            }
        )
    return {
        "profiles": profiles,
        "admin_password_custom": bool(get_saved_admin_password()),
        "admin_nsfw_password_custom": bool(get_saved_admin_nsfw_password()),
        "public_url": settings.public_url or "",
        "media_server_url": settings.media_server_url or "",
    }


@router.put("/admin-passwords")
def put_admin_passwords(
    body: AdminPasswordsBody,
    _admin: User = Depends(require_admin),
):
    if body.admin_password is not None and body.admin_password.strip():
        if len(body.admin_password.strip()) < 4:
            raise HTTPException(400, "Admin password must be at least 4 characters")
    if body.admin_nsfw_password is not None and body.admin_nsfw_password.strip():
        if len(body.admin_nsfw_password.strip()) < 4:
            raise HTTPException(
                400, "NSFW admin password must be at least 4 characters"
            )
    result = save_admin_passwords(
        admin_password=body.admin_password,
        admin_nsfw_password=body.admin_nsfw_password,
    )
    if body.admin_password is not None and body.admin_password.strip():
        settings.admin_password = body.admin_password.strip()
    if body.admin_nsfw_password is not None and body.admin_nsfw_password.strip():
        settings.admin_nsfw_password = body.admin_nsfw_password.strip()
    return result


@router.patch("/profiles/{user_id}")
def patch_guest_profile_name(
    user_id: int,
    body: GuestProfileBody,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Admin: rename a guest profile slot (Admin name is locked)."""
    if user_id == ADMIN_USER_ID:
        raise HTTPException(400, "Admin display name cannot be changed")
    ensure_profiles(db)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Profile not found")
    name = (body.display_name or "").strip()
    if not name:
        raise HTTPException(400, "Display name is required")
    if len(name) > 40:
        raise HTTPException(400, "Display name is too long")
    user.usr_name = name
    db.commit()
    db.refresh(user)
    return {
        "user_id": user.usr_id,
        "username": profile_display_name(user, slot_default_name(user.usr_id)),
        "is_admin": False,
    }
