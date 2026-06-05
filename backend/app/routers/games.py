from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.deps import require_admin
from app.models import Game, User
from app.schemas import GameListOut, GameOut

router = APIRouter(prefix="/api/games", tags=["games"])


@router.get("", response_model=GameListOut)
def list_games(
    db: Session = Depends(get_db),
    search: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(48, ge=1, le=200),
):
    items, total = crud.list_games(db, search=search, page=page, page_size=page_size)
    return GameListOut(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=GameOut)
def create_game(
    name: str = Query(...),
    code: str | None = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    max_id = db.scalar(select(func.max(Game.gam_id))) or 0
    row = Game(gam_id=max_id + 1, gam_name=name, gam_code=code)
    db.add(row)
    db.commit()
    return GameOut(id=row.gam_id, name=row.gam_name, code=row.gam_code)
