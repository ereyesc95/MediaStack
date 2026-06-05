from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.schemas import MovieListOut

router = APIRouter(prefix="/api/movies", tags=["movies"])


@router.get("", response_model=MovieListOut)
def list_movies(
    db: Session = Depends(get_db),
    search: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(48, ge=1, le=200),
):
    items, total = crud.list_movies(db, search=search, page=page, page_size=page_size)
    return MovieListOut(items=items, total=total, page=page, page_size=page_size)
