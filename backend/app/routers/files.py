"""FileStack API — browse and manage `{media_root}/Files/`."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.deps import get_current_user, get_nsfw_unlocked, require_admin
from app import files_index as fi
from app.models import User

router = APIRouter(prefix="/api/files", tags=["files"])


class NameBody(BaseModel):
    name: str


class NestedBody(BaseModel):
    tab: str
    name: str


class NestedRenameBody(BaseModel):
    tab: str
    folder: str
    name: str


class NestedDeleteBody(BaseModel):
    tab: str
    folder: str


class RenameFileBody(BaseModel):
    path: str
    name: str


class TransferBody(BaseModel):
    paths: list[str] = Field(default_factory=list)
    tab: str
    folder: str | None = None


class DeleteFilesBody(BaseModel):
    paths: list[str] = Field(default_factory=list)


def _http_from_exc(exc: Exception) -> HTTPException:
    if isinstance(exc, FileNotFoundError):
        return HTTPException(404, str(exc) or "Not found")
    if isinstance(exc, FileExistsError):
        return HTTPException(409, str(exc) or "Already exists")
    if isinstance(exc, ValueError):
        return HTTPException(400, str(exc) or "Invalid request")
    return HTTPException(500, str(exc))


def _require_tab_access(tab: str, *, nsfw_unlocked: bool) -> None:
    if fi.tab_is_exclusive(tab) and not nsfw_unlocked:
        raise HTTPException(404, "Tab not found")


def _require_paths_access(paths: list[str], *, nsfw_unlocked: bool) -> None:
    if nsfw_unlocked:
        return
    for path in paths:
        if fi.path_is_exclusive_files(path):
            raise HTTPException(404, "Not found")


@router.get("/tabs")
def get_tabs(
    _user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    try:
        return {"tabs": fi.list_tabs(nsfw_unlocked=nsfw_unlocked)}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/tabs/{tab}/files")
def get_tab_files(
    tab: str,
    _user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _require_tab_access(tab, nsfw_unlocked=nsfw_unlocked)
    try:
        return {
            "tab": tab,
            "files": fi.list_files_in_tab(tab),
            "nested_folders": fi.list_nested_folders(tab),
        }
    except ValueError as exc:
        raise _http_from_exc(exc) from exc


@router.post("/tabs")
def create_tab(body: NameBody, _admin: User = Depends(require_admin)):
    try:
        return fi.create_tab(body.name)
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.put("/tabs/{tab}")
def rename_tab(tab: str, body: NameBody, _admin: User = Depends(require_admin)):
    try:
        return fi.rename_tab(tab, body.name)
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.delete("/tabs/{tab}")
def delete_tab(tab: str, _admin: User = Depends(require_admin)):
    try:
        fi.delete_tab(tab)
        return {"ok": True}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.post("/folders")
def create_folder(body: NestedBody, _admin: User = Depends(require_admin)):
    try:
        return fi.create_nested_folder(body.tab, body.name)
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.put("/folders")
def rename_folder(body: NestedRenameBody, _admin: User = Depends(require_admin)):
    try:
        return fi.rename_nested_folder(body.tab, body.folder, body.name)
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.post("/folders/delete")
def delete_folder(body: NestedDeleteBody, _admin: User = Depends(require_admin)):
    try:
        fi.delete_nested_folder(body.tab, body.folder)
        return {"ok": True}
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.post("/rename")
def rename_file(
    body: RenameFileBody,
    _admin: User = Depends(require_admin),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _require_paths_access([body.path], nsfw_unlocked=nsfw_unlocked)
    try:
        return fi.rename_file(body.path, body.name)
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.post("/move")
def move_files(
    body: TransferBody,
    _admin: User = Depends(require_admin),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    if not body.paths:
        raise HTTPException(400, "No paths")
    _require_tab_access(body.tab, nsfw_unlocked=nsfw_unlocked)
    _require_paths_access(body.paths, nsfw_unlocked=nsfw_unlocked)
    try:
        return {
            "files": fi.move_files(body.paths, body.tab, body.folder or None)
        }
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.post("/copy")
def copy_files(
    body: TransferBody,
    _admin: User = Depends(require_admin),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    if not body.paths:
        raise HTTPException(400, "No paths")
    _require_tab_access(body.tab, nsfw_unlocked=nsfw_unlocked)
    _require_paths_access(body.paths, nsfw_unlocked=nsfw_unlocked)
    try:
        return {
            "files": fi.copy_files(body.paths, body.tab, body.folder or None)
        }
    except Exception as exc:
        raise _http_from_exc(exc) from exc


@router.post("/delete")
def delete_files(
    body: DeleteFilesBody,
    _admin: User = Depends(require_admin),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    if not body.paths:
        raise HTTPException(400, "No paths")
    _require_paths_access(body.paths, nsfw_unlocked=nsfw_unlocked)
    try:
        n = fi.delete_files(body.paths)
        return {"ok": True, "deleted": n}
    except Exception as exc:
        raise _http_from_exc(exc) from exc
