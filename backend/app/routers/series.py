from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.schemas import EpisodeOut, SeasonOut, SeriesListOut, SeriesOut

router = APIRouter(prefix="/api/series", tags=["series"])


@router.get("", response_model=SeriesListOut)
def list_series(
    db: Session = Depends(get_db),
    search: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(48, ge=1, le=200),
):
    items, total = crud.list_series(db, search=search, page=page, page_size=page_size)
    return SeriesListOut(items=items, total=total, page=page, page_size=page_size)


@router.get("/{series_id}", response_model=SeriesOut)
def get_series(series_id: int, db: Session = Depends(get_db)):
    row = crud.get_series(db, series_id)
    if not row:
        raise HTTPException(404, "Series not found")
    return crud.series_to_out(row)


@router.get("/{series_id}/seasons", response_model=list[SeasonOut])
def series_seasons(series_id: int, db: Session = Depends(get_db)):
    if not crud.get_series(db, series_id):
        raise HTTPException(404, "Series not found")
    return crud.list_seasons(db, series_id)


@router.get("/seasons/{season_id}/episodes", response_model=list[EpisodeOut])
def season_episodes(season_id: int, db: Session = Depends(get_db)):
    return crud.list_episodes(db, season_id)
