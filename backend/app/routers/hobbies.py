"""HobbyStack API — per-profile collections and items."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_nsfw_unlocked
from app.hobbies import (
    add_field_option,
    adjust_quantity,
    create_collection,
    create_custom_collection,
    delete_collection,
    delete_item,
    delete_items,
    ensure_collection_for_preset,
    field_catalog_payload,
    get_collection,
    list_collections,
    list_field_options,
    list_franchise_theme_options,
    list_hobby_themes,
    list_items,
    list_items_by_theme,
    list_presets,
    require_collection_access,
    save_uploaded_image,
    serialize_collection,
    store_icon_file,
    update_collection,
    upsert_item,
)
from app.profiles import is_admin_role
from app.hobbies_excel import (
    commit_import,
    export_hobbies_xlsx,
    preview_import,
    template_hobbies_xlsx,
)
from app.models import HobbyItem, User

router = APIRouter(prefix="/api/hobbies", tags=["hobbies"])


class CollectionMetaBody(BaseModel):
    year: int | None = None
    brand: str | None = None
    theme: str | None = None
    missing: list[str] | str | None = None
    duplicates: list[str] | str | None = None
    shop_url: str | None = None
    tutorial_url: str | None = None


class CollectionCreateBody(BaseModel):
    name: str
    preset: str = "custom"
    fields: list[str] | None = None
    custom_fields: list[dict] | None = None
    limited: bool = False
    collection_total: int | None = None
    meta: CollectionMetaBody | None = None
    pdf_enabled: bool = False
    allow_missing_item_conflicts: bool = False


class CollectionEnsureBody(BaseModel):
    preset: str


class CollectionUpdateBody(BaseModel):
    name: str | None = None
    clear_icon: bool = False
    private: bool | None = None
    fields: list[str] | None = None
    custom_fields: list[dict] | None = None
    set_fields: bool = False
    limited: bool | None = None
    collection_total: int | None = None
    set_collection_total: bool = False
    meta: CollectionMetaBody | None = None
    set_meta: bool = False
    pdf_enabled: bool | None = None
    allow_missing_item_conflicts: bool = False


class CustomFieldDef(BaseModel):
    key: str | None = None
    label: str


def _accessible_collection(
    db: Session,
    user: User,
    collection_id: int,
    *,
    nsfw_unlocked: bool,
):
    try:
        return require_collection_access(
            get_collection(db, user.usr_id, collection_id),
            nsfw_unlocked=nsfw_unlocked,
        )
    except (LookupError, PermissionError) as exc:
        raise HTTPException(404, "Collection not found") from exc


class ItemBody(BaseModel):
    model_config = {"extra": "allow"}

    title: str | None = None
    brand: str | None = None
    theme: str | None = None
    type: str | None = None
    category: str | None = None
    size: str | None = None
    style: str | None = None
    quantity: int | None = 1
    total_slots: int | None = None
    year: int | None = None
    box_size: str | None = None
    missing: list[str] | None = None
    duplicates: list[str] | None = None
    image_path: str | None = None
    image_url: str | None = None
    shop_url: str | None = None
    tutorial_url: str | None = None
    notes: str | None = None
    extra: dict | None = None


class QtyBody(BaseModel):
    delta: int = -1
    quantity: int | None = None


class BatchDeleteBody(BaseModel):
    ids: list[int] = Field(default_factory=list)


class ImportCommitBody(BaseModel):
    rows: list[dict]


class FieldOptionBody(BaseModel):
    value: str


def _http_from_hobby_value_error(exc: ValueError) -> HTTPException:
    msg = str(exc)
    if msg.startswith("MISSING_ITEM_CONFLICT:"):
        tags = [t for t in msg.split(":", 1)[1].split(",") if t]
        return HTTPException(
            status_code=409,
            detail={
                "code": "MISSING_ITEM_CONFLICT",
                "message": (
                    "Some Missing tags match existing items: "
                    + ", ".join(tags)
                ),
                "conflicts": tags,
            },
        )
    return HTTPException(400, msg)


@router.get("/presets")
def hobbies_presets(_user: User = Depends(get_current_user)):
    return {"presets": list_presets()}


@router.get("/field-catalog")
def hobbies_field_catalog(_user: User = Depends(get_current_user)):
    return field_catalog_payload()


@router.get("/franchise-options")
def hobbies_franchise_options(_user: User = Depends(get_current_user)):
    """Books/Games franchise folder names for Theme dropdowns."""
    return {"options": list_franchise_theme_options()}


@router.get("/themes")
def hobbies_themes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    return {
        "themes": list_hobby_themes(
            db, user.usr_id, nsfw_unlocked=nsfw_unlocked
        )
    }


@router.get("/themes/items")
def hobbies_theme_items(
    theme: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    return {
        "theme": theme.strip(),
        "items": list_items_by_theme(
            db, user.usr_id, theme, nsfw_unlocked=nsfw_unlocked
        ),
    }


@router.get("/collections")
def hobbies_collections(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    collections, hidden = list_collections(
        db, user.usr_id, nsfw_unlocked=nsfw_unlocked
    )
    return {
        "collections": collections,
        "hidden_private_presets": hidden,
    }


@router.post("/collections")
def hobbies_create_collection(
    body: CollectionCreateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        preset = (body.preset or "custom").strip().casefold()
        meta = body.meta.model_dump() if body.meta is not None else None
        if preset in ("custom", "generic"):
            return create_custom_collection(
                db,
                user.usr_id,
                name=body.name,
                fields=body.fields,
                custom_fields=body.custom_fields,
                limited=body.limited,
                collection_total=body.collection_total,
                meta=meta,
                pdf_enabled=body.pdf_enabled,
                allow_missing_item_conflicts=body.allow_missing_item_conflicts,
            )
        return create_collection(
            db,
            user.usr_id,
            name=body.name,
            preset=preset,
            fields=body.fields,
            custom_fields=body.custom_fields,
            limited=body.limited,
            collection_total=body.collection_total,
            meta=meta,
            pdf_enabled=body.pdf_enabled,
            allow_missing_item_conflicts=body.allow_missing_item_conflicts,
        )
    except ValueError as e:
        raise _http_from_hobby_value_error(e) from e


@router.post("/collections/custom")
async def hobbies_create_custom_collection(
    name: str = Query(..., min_length=1),
    fields: str | None = Query(None),
    custom_fields: str | None = Query(None),
    limited: bool = Query(False),
    collection_total: int | None = Query(None),
    meta: str | None = Query(None),
    pdf_enabled: bool = Query(False),
    icon: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a named custom collection; optional icon upload."""
    import json as _json

    field_list: list[str] | None = None
    if fields:
        try:
            parsed = _json.loads(fields)
            if isinstance(parsed, list):
                field_list = [str(x) for x in parsed]
        except _json.JSONDecodeError as e:
            raise HTTPException(400, "Invalid fields JSON") from e
    custom_defs: list[dict] | None = None
    if custom_fields:
        try:
            parsed = _json.loads(custom_fields)
            if isinstance(parsed, list):
                custom_defs = [x for x in parsed if isinstance(x, dict)]
        except _json.JSONDecodeError as e:
            raise HTTPException(400, "Invalid custom_fields JSON") from e
    meta_obj: dict | None = None
    if meta:
        try:
            parsed = _json.loads(meta)
            if isinstance(parsed, dict):
                meta_obj = parsed
        except _json.JSONDecodeError as e:
            raise HTTPException(400, "Invalid meta JSON") from e
    icon_path = None
    if icon is not None and icon.filename:
        data = await icon.read()
        if data:
            ext = Path(icon.filename).suffix or ".png"
            icon_path = store_icon_file(name.strip(), data, ext)
    try:
        return create_custom_collection(
            db,
            user.usr_id,
            name=name,
            fields=field_list,
            custom_fields=custom_defs,
            icon_path=icon_path,
            limited=limited,
            collection_total=collection_total,
            meta=meta_obj,
            pdf_enabled=pdf_enabled,
        )
    except ValueError as e:
        raise _http_from_hobby_value_error(e) from e


@router.post("/collections/ensure")
def hobbies_ensure_collection(
    body: CollectionEnsureBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    """Open-or-create the single collection for a preset (one per profile)."""
    try:
        return ensure_collection_for_preset(
            db, user.usr_id, body.preset, nsfw_unlocked=nsfw_unlocked
        )
    except PermissionError as e:
        raise HTTPException(404, "Collection not found") from e
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.get("/collections/{collection_id}")
def hobbies_get_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    row = _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    items = list_items(db, user.usr_id, collection_id)
    return serialize_collection(row, item_count=len(items))


@router.put("/collections/{collection_id}")
def hobbies_update_collection(
    collection_id: int,
    body: CollectionUpdateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    if body.private is not None:
        if not is_admin_role(user.usr_role_id):
            raise HTTPException(403, "Admin profile required")
        if not nsfw_unlocked:
            raise HTTPException(403, "NSFW unlock required")
    try:
        result = update_collection(
            db,
            user.usr_id,
            collection_id,
            name=body.name,
            clear_icon=body.clear_icon,
            private=body.private,
            fields=body.fields,
            custom_fields=body.custom_fields,
            set_fields=body.set_fields
            or body.fields is not None
            or body.custom_fields is not None,
            limited=body.limited,
            collection_total=(
                body.collection_total
                if body.set_collection_total or body.limited is not None
                else ...
            ),
            meta=body.meta.model_dump() if body.meta is not None else None,
            set_meta=body.set_meta or body.meta is not None,
            pdf_enabled=body.pdf_enabled,
            allow_missing_item_conflicts=body.allow_missing_item_conflicts,
        )
    except ValueError as e:
        raise _http_from_hobby_value_error(e) from e
    if not result:
        raise HTTPException(404, "Collection not found")
    return result


@router.delete("/collections/{collection_id}")
def hobbies_delete_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    if not delete_collection(db, user.usr_id, collection_id):
        raise HTTPException(404, "Collection not found")
    return {"ok": True}


@router.post("/collections/{collection_id}/icon")
async def hobbies_upload_icon(
    collection_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    row = _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    name = file.filename or "icon.png"
    ext = "." + name.rsplit(".", 1)[-1] if "." in name else ".png"
    filename = store_icon_file(row.hbc_name, data, ext)
    result = update_collection(
        db, user.usr_id, collection_id, icon_path=filename
    )
    return result


@router.get("/collections/{collection_id}/items")
def hobbies_list_items(
    collection_id: int,
    q: str | None = None,
    type: str | None = Query(None, alias="type"),
    size: str | None = None,
    style: str | None = None,
    theme: str | None = None,
    category: str | None = None,
    sort: str = "title",
    order: str = "asc",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    return {
        "items": list_items(
            db,
            user.usr_id,
            collection_id,
            q=q,
            type_filter=type,
            size_filter=size,
            style_filter=style,
            theme_filter=theme,
            category_filter=category,
            sort=sort,
            order=order,
        )
    }


@router.post("/collections/{collection_id}/items")
def hobbies_create_item(
    collection_id: int,
    body: ItemBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    try:
        return upsert_item(
            db, user.usr_id, collection_id, body.model_dump(exclude_unset=True)
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.put("/collections/{collection_id}/items/{item_id}")
def hobbies_update_item(
    collection_id: int,
    item_id: int,
    body: ItemBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    try:
        return upsert_item(
            db,
            user.usr_id,
            collection_id,
            body.model_dump(exclude_unset=True),
            item_id=item_id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.post("/collections/{collection_id}/items/{item_id}/quantity")
def hobbies_adjust_qty(
    collection_id: int,
    item_id: int,
    body: QtyBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    try:
        if body.quantity is not None:
            return upsert_item(
                db,
                user.usr_id,
                collection_id,
                {"quantity": body.quantity},
                item_id=item_id,
            )
        return adjust_quantity(
            db, user.usr_id, collection_id, item_id, body.delta
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.delete("/collections/{collection_id}/items/{item_id}")
def hobbies_delete_item(
    collection_id: int,
    item_id: int,
    restore_missing: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    result = delete_item(
        db,
        user.usr_id,
        collection_id,
        item_id,
        restore_missing=restore_missing,
    )
    if not result:
        raise HTTPException(404, "Item not found")
    return result


@router.post("/collections/{collection_id}/items/delete-batch")
def hobbies_delete_batch(
    collection_id: int,
    body: BatchDeleteBody,
    restore_missing: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    n = delete_items(
        db,
        user.usr_id,
        collection_id,
        body.ids,
        restore_missing=restore_missing,
    )
    return {"ok": True, "deleted": n}


@router.post("/collections/{collection_id}/items/{item_id}/image")
async def hobbies_upload_item_image(
    collection_id: int,
    item_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    coll = _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    row = db.get(HobbyItem, item_id)
    if not row or row.hbi_user_id != user.usr_id or row.hbi_collection_id != collection_id:
        raise HTTPException(404, "Item not found")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    name = file.filename or "image.png"
    ext = "." + name.rsplit(".", 1)[-1] if "." in name else ".png"
    stem = (
        row.hbi_style
        or row.hbi_title
        or row.hbi_type
        or f"item-{item_id}"
    )
    filename = save_uploaded_image(
        collection_name=coll.hbc_name, stem=str(stem), data=data, ext=ext
    )
    return upsert_item(
        db,
        user.usr_id,
        collection_id,
        {"image_path": filename},
        item_id=item_id,
    )


@router.get("/collections/{collection_id}/options/{field}")
def hobbies_field_options(
    collection_id: int,
    field: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    return {"options": list_field_options(db, user.usr_id, collection_id, field)}


@router.post("/collections/{collection_id}/options/{field}")
def hobbies_add_field_option(
    collection_id: int,
    field: str,
    body: FieldOptionBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    try:
        opts = add_field_option(
            db, user.usr_id, collection_id, field, body.value
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"options": opts}


@router.get("/collections/{collection_id}/export.xlsx")
def hobbies_export(
    collection_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    data = export_hobbies_xlsx(db, user.usr_id, collection_id)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="hobby-{collection_id}.xlsx"'
        },
    )


@router.get("/template.xlsx")
def hobbies_template(_user: User = Depends(get_current_user)):
    data = template_hobbies_xlsx()
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="hobby-template.xlsx"'},
    )


@router.post("/collections/{collection_id}/import/preview")
async def hobbies_import_preview(
    collection_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    raw = await file.read()
    return preview_import(io_bytes(raw))


@router.post("/collections/{collection_id}/import/commit")
def hobbies_import_commit(
    collection_id: int,
    body: ImportCommitBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    nsfw_unlocked: bool = Depends(get_nsfw_unlocked),
):
    _accessible_collection(
        db, user, collection_id, nsfw_unlocked=nsfw_unlocked
    )
    try:
        return commit_import(db, user.usr_id, collection_id, body.rows)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


def io_bytes(data: bytes):
    import io

    return io.BytesIO(data)
