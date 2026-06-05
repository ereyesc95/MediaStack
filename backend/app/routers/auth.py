import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import crud
from app.auth_session import create_session, resolve_session, revoke_session
from app.config import settings
from app.database import get_db
from app.deps import _bearer_token, get_current_user
from app.models import User
from app.paths import DATA_DIR, ensure_data_dir
from app.profiles import (
    ADMIN_USER_ID,
    get_profile_user,
    is_admin_role,
    list_profiles,
    profile_display_name,
    slot_default_name,
)
from app.schemas import (
    LoginRequest,
    LoginResponse,
    ProfileOut,
    RegisterRequest,
    SelectProfileRequest,
    SessionOut,
    UpdateProfileRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

AVATAR_PHOTO_MARKER = "photo"
_EMOJI_RE = re.compile(
    r"^[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0000FE00-\U0000FE0F"
    r"a-zA-Z0-9]{1,4}$"
)


def avatars_dir() -> Path:
    d = DATA_DIR / "avatars"
    d.mkdir(parents=True, exist_ok=True)
    return d


def avatar_file(user_id: int) -> Path:
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        p = avatars_dir() / f"{user_id}{ext}"
        if p.is_file():
            return p
    return avatars_dir() / f"{user_id}.jpg"


def _user_out(user: User) -> LoginResponse:
    default = slot_default_name(user.usr_id)
    avatar = None
    if user.usr_id != ADMIN_USER_ID:
        avatar = user.usr_image
        if avatar == AVATAR_PHOTO_MARKER and not avatar_file(user.usr_id).is_file():
            avatar = None
    return LoginResponse(
        user_id=user.usr_id,
        username=profile_display_name(user, default),
        role_id=user.usr_role_id,
        is_admin=is_admin_role(user.usr_role_id),
        avatar=avatar,
    )


def _validate_guest_avatar(value: str | None) -> str | None:
    if value is None:
        return None
    v = value.strip()
    if not v:
        return None
    if v == AVATAR_PHOTO_MARKER:
        return AVATAR_PHOTO_MARKER
    if v.startswith("#") and len(v) in (4, 7):
        return v
    if _EMOJI_RE.match(v):
        return v
    raise HTTPException(400, "Invalid avatar value")


@router.get("/profiles", response_model=list[ProfileOut])
def profiles(db: Session = Depends(get_db)):
    return list_profiles(db)


@router.post("/profile", response_model=LoginResponse)
def select_profile(body: SelectProfileRequest, db: Session = Depends(get_db)):
    user = get_profile_user(db, body.user_id)
    if not user:
        raise HTTPException(404, "Profile not found")
    if user.usr_id == ADMIN_USER_ID:
        pwd = (body.password or "").strip()
        if pwd != settings.admin_password:
            raise HTTPException(403, "Incorrect admin password")
    token = create_session(user.usr_id)
    return _user_out(user).model_copy(update={"token": token})


@router.patch("/profile", response_model=LoginResponse)
def update_profile(
    body: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if is_admin_role(user.usr_role_id):
        raise HTTPException(403, "Admin profile cannot be customized")
    if body.display_name is not None:
        name = body.display_name.strip()
        if not name or len(name) > 32:
            raise HTTPException(400, "Display name must be 1–32 characters")
        user.usr_name = name
    if body.avatar is not None:
        user.usr_image = _validate_guest_avatar(body.avatar)
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.post("/profile/avatar", response_model=LoginResponse)
async def upload_profile_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if is_admin_role(user.usr_role_id):
        raise HTTPException(403, "Admin profile cannot be customized")
    raw = await file.read()
    if not raw or len(raw) > 2_000_000:
        raise HTTPException(400, "Image must be under 2 MB")
    content_type = (file.content_type or "").lower()
    ext = ".jpg"
    if "png" in content_type:
        ext = ".png"
    elif "webp" in content_type:
        ext = ".webp"
    ensure_data_dir()
    dest = avatars_dir() / f"{user.usr_id}{ext}"
    for old in avatars_dir().glob(f"{user.usr_id}.*"):
        if old != dest:
            old.unlink(missing_ok=True)
    dest.write_bytes(raw)
    user.usr_image = AVATAR_PHOTO_MARKER
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.get("/avatars/{user_id}")
def serve_avatar(user_id: int):
    if user_id not in {1, 2, 3, 4}:
        raise HTTPException(404, "Avatar not found")
    path = avatar_file(user_id)
    if not path.is_file():
        raise HTTPException(404, "Avatar not found")
    return FileResponse(path)


@router.post("/logout")
def logout(authorization: str | None = Header(None)):
    revoke_session(_bearer_token(authorization))
    return {"ok": True}


@router.get("/session", response_model=SessionOut)
def session(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
):
    token = _bearer_token(authorization)
    user_id = resolve_session(token)
    user_out = None
    if user_id is not None:
        user = get_profile_user(db, user_id)
        if user:
            user_out = _user_out(user)
    return SessionOut(
        device_id=None,
        user=user_out,
        current_module=None,
        media_server_url=settings.media_server_url,
        token=token if user_out else None,
    )


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = crud.authenticate_user(db, body.username, body.password)
    if not user:
        raise HTTPException(401, "Invalid username or password")
    return _user_out(user)


@router.post("/register", response_model=LoginResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    try:
        user = crud.register_user(
            db, body.username, body.password, email=body.email
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return _user_out(user)


@router.get("/me", response_model=LoginResponse)
def me(user: User = Depends(get_current_user)):
    return _user_out(user)
