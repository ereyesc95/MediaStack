from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.models import ContentType
from app.schemas import ContentTypeOut, FilterOut, MenuItemOut, ModuleNavOut

router = APIRouter(prefix="/api/metadata", tags=["metadata"])

MODULE_SLUGS = {
    "music": 200,
    "series": 400,
    "movies": 300,
    "books": 500,
    "games": 600,
    "countries": 100,
}


@router.get("/content-types", response_model=list[ContentTypeOut])
def content_types(db: Session = Depends(get_db)):
    return crud.list_content_types(db)


@router.get("/modules/{slug}", response_model=ModuleNavOut)
def module_nav(slug: str, db: Session = Depends(get_db)):
    ctype_id = MODULE_SLUGS.get(slug.lower())
    if ctype_id is None:
        raise HTTPException(404, f"Unknown module: {slug}")
    row = db.get(ContentType, ctype_id)
    if not row:
        raise HTTPException(404, "Content type not seeded")
    return ModuleNavOut(
        content_type=ContentTypeOut(
            id=row.cnt_id, name=row.cnt_name, sort_id=row.cnt_sort_id
        ),
        menu_items=crud.list_menu_items(db, ctype_id),
        filters=crud.list_filters(db, ctype_id),
    )


@router.get("/modules/{slug}/menu", response_model=list[MenuItemOut])
def module_menu(slug: str, db: Session = Depends(get_db)):
    ctype_id = MODULE_SLUGS.get(slug.lower())
    if ctype_id is None:
        raise HTTPException(404, f"Unknown module: {slug}")
    return crud.list_menu_items(db, ctype_id)


@router.get("/modules/{slug}/filters", response_model=list[FilterOut])
def module_filters(
    slug: str,
    menu_item_id: int | None = None,
    db: Session = Depends(get_db),
):
    ctype_id = MODULE_SLUGS.get(slug.lower())
    if ctype_id is None:
        raise HTTPException(404, f"Unknown module: {slug}")
    return crud.list_filters(db, ctype_id, menu_item_id)
