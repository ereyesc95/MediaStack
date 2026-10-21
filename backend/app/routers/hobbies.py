"""HobbyStack API — per-profile collections and items."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.hobbies import (
    add_field_option,
    adjust_quantity,
    create_collection,
    delete_collection,
    delete_item,
    delete_items,
    get_collection,
    list_collections,
    list_field_options,
    list_items,
    list_presets,
    save_uploaded_image,
    serialize_collection,
    store_icon_file,
    update_collection,
    upsert_item,
)
from app.hobbies_excel import (
    commit_import,
    export_hobbies_xlsx,
    preview_import,
    template_hobbies_xlsx,
)
from app.models import HobbyItem, User

router = APIRouter(prefix="/api/hobbies", tags=["hobbies"])


class CollectionCreateBody(BaseModel):
    name: str
    preset: str = "generic"


class CollectionUpdateBody(BaseModel):
    name: str | None = None
    clear_icon: bool = False


class ItemBody(BaseModel):
    title: str | None = None
    brand: str | None = None
    theme: str | None = None
    type: str | None = None
    category: str | None = None
    size: str | None = None
    style: str | None = None
    quantity: int | None = 1
    total_slots: int | None = None
    box_size: str | None = None
    missing: list[str] | None = None
    duplicates: list[str] | None = None
    image_path: str | None = None
    image_url: str | None = None
    shop_url: str | None = None
    tutorial_url: str | None = None
    notes: str | None = None


class QtyBody(BaseModel):
    delta: int = -1
    quantity: int | None = None


class BatchDeleteBody(BaseModel):
    ids: list[int] = Field(default_factory=list)


class ImportCommitBody(BaseModel):
    rows: list[dict]


class FieldOptionBody(BaseModel):
    value: str


@router.get("/presets")
def hobbies_presets(_user: User = Depends(get_current_user)):
    return {"presets": list_presets()}


@router.get("/collections")
def hobbies_collections(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {"collections": list_collections(db, user.usr_id)}


@router.post("/collections")
def hobbies_create_collection(
    body: CollectionCreateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return create_collection(
            db, user.usr_id, name=body.name, preset=body.preset
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.get("/collections/{collection_id}")
def hobbies_get_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = get_collection(db, user.usr_id, collection_id)
    if not row:
        raise HTTPException(404, "Collection not found")
    items = list_items(db, user.usr_id, collection_id)
    return serialize_collection(row, item_count=len(items))


@router.put("/collections/{collection_id}")
def hobbies_update_collection(
    collection_id: int,
    body: CollectionUpdateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        result = update_collection(
            db,
            user.usr_id,
            collection_id,
            name=body.name,
            clear_icon=body.clear_icon,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    if not result:
        raise HTTPException(404, "Collection not found")
    return result


@router.delete("/collections/{collection_id}")
def hobbies_delete_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not delete_collection(db, user.usr_id, collection_id):
        raise HTTPException(404, "Collection not found")
    return {"ok": True}


@router.post("/collections/{collection_id}/icon")
async def hobbies_upload_icon(
    collection_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = get_collection(db, user.usr_id, collection_id)
    if not row:
        raise HTTPException(404, "Collection not found")
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
):
    if not get_collection(db, user.usr_id, collection_id):
        raise HTTPException(404, "Collection not found")
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
):
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
):
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
):
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not delete_item(db, user.usr_id, collection_id, item_id):
        raise HTTPException(404, "Item not found")
    return {"ok": True}


@router.post("/collections/{collection_id}/items/delete-batch")
def hobbies_delete_batch(
    collection_id: int,
    body: BatchDeleteBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    n = delete_items(db, user.usr_id, collection_id, body.ids)
    return {"ok": True, "deleted": n}


@router.post("/collections/{collection_id}/items/{item_id}/image")
async def hobbies_upload_item_image(
    collection_id: int,
    item_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    coll = get_collection(db, user.usr_id, collection_id)
    if not coll:
        raise HTTPException(404, "Collection not found")
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
):
    if not get_collection(db, user.usr_id, collection_id):
        raise HTTPException(404, "Collection not found")
    return {"options": list_field_options(db, user.usr_id, collection_id, field)}


@router.post("/collections/{collection_id}/options/{field}")
def hobbies_add_field_option(
    collection_id: int,
    field: str,
    body: FieldOptionBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
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
):
    if not get_collection(db, user.usr_id, collection_id):
        raise HTTPException(404, "Collection not found")
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
):
    if not get_collection(db, user.usr_id, collection_id):
        raise HTTPException(404, "Collection not found")
    raw = await file.read()
    return preview_import(io_bytes(raw))


@router.post("/collections/{collection_id}/import/commit")
def hobbies_import_commit(
    collection_id: int,
    body: ImportCommitBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return commit_import(db, user.usr_id, collection_id, body.rows)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


def io_bytes(data: bytes):
    import io

    return io.BytesIO(data)
