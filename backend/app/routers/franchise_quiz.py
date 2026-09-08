"""Shared quiz API for Series, Movies, Books, and future Games franchises."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.franchise_quiz import (
    availability,
    build_catalog,
    build_encyclopedia,
    build_soundtrack,
    encyclopedia_topics,
    load_scores,
    save_score,
)
from app.models import User

router = APIRouter(prefix="/api/franchise-quiz", tags=["franchise-quiz"])


class FranchiseQuizScoreBody(BaseModel):
    quiz_type: str
    score: int
    total: int
    time_ms: int


@router.get("/{slug}/availability")
def quiz_availability(
    slug: str,
    path: str | None = Query(None),
    db: Session = Depends(get_db),
):
    return availability(db, slug, scope_path=path)


@router.get("/{slug}/catalog")
def quiz_catalog(slug: str):
    return build_catalog(slug)


@router.get("/{slug}/encyclopedia/topics")
def quiz_encyclopedia_topics(
    slug: str,
    path: str | None = Query(None),
):
    return encyclopedia_topics(slug, scope_path=path)


@router.get("/{slug}/encyclopedia")
def quiz_encyclopedia(
    slug: str,
    topic: str = Query(..., min_length=1),
    path: str | None = Query(None),
):
    return build_encyclopedia(slug, topic, scope_path=path)


@router.get("/{slug}/soundtrack")
def quiz_soundtrack(
    slug: str,
    topic: str = Query("original"),
    rounds: int = Query(10, ge=1, le=10),
    path: str | None = Query(None),
    db: Session = Depends(get_db),
):
    return build_soundtrack(
        db,
        slug,
        topic=topic,
        scope_path=path,
        rounds=rounds,
    )


@router.get("/{slug}/scores")
def quiz_scores(
    slug: str,
    user: User = Depends(get_current_user),
):
    return load_scores(user.usr_id, slug)


@router.post("/{slug}/scores")
def quiz_save_score(
    slug: str,
    body: FranchiseQuizScoreBody,
    user: User = Depends(get_current_user),
):
    return save_score(
        user.usr_id,
        slug,
        quiz_type=body.quiz_type[:120],
        score=max(0, body.score),
        total=max(0, body.total),
        time_ms=max(0, body.time_ms),
    )
