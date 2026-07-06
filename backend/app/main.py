from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from app.config import settings
from app.database import SessionLocal, init_db
from app.frontend_static import mount_frontend
from app.models import Band, Book, Game, Movie, Release, Series, Track
from app.paths import database_file, resolve_frontend_dist
from app.routers import (
    assets,
    auth,
    books,
    games,
    import_router,
    media,
    metadata,
    movies,
    music,
    playback,
    series,
    settings as settings_router,
    spotify,
    sync,
)

RECORDSTACK_PORTS = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:8765",
    "http://127.0.0.1:8765",
    "http://localhost:8766",
    "http://127.0.0.1:8766",
    "http://recordstack.localhost:8000",
    "http://recordstack.localhost:8765",
    "http://recordstack.localhost:8766",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="MediaStack", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + RECORDSTACK_PORTS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assets.router)
app.include_router(auth.router)
app.include_router(metadata.router)
app.include_router(music.router)
app.include_router(spotify.router)
app.include_router(playback.router)
app.include_router(series.router)
app.include_router(movies.router)
app.include_router(books.router)
app.include_router(games.router)
app.include_router(import_router.router)
app.include_router(sync.router)
app.include_router(media.router)
app.include_router(settings_router.router)


@app.get("/api/health")
def health():
    dist = resolve_frontend_dist()
    db_path = database_file()
    stats: dict = {}
    try:
        db = SessionLocal()
        try:
            stats = {
                "bands": db.scalar(select(func.count()).select_from(Band)) or 0,
                "releases": db.scalar(select(func.count()).select_from(Release)) or 0,
                "tracks": db.scalar(select(func.count()).select_from(Track)) or 0,
                "series": db.scalar(select(func.count()).select_from(Series)) or 0,
                "movies": db.scalar(select(func.count()).select_from(Movie)) or 0,
                "books": db.scalar(select(func.count()).select_from(Book)) or 0,
                "games": db.scalar(select(func.count()).select_from(Game)) or 0,
            }
        finally:
            db.close()
    except Exception as exc:
        stats = {"error": str(exc)}
    return {
        "status": "ok",
        "frontend": dist is not None,
        "database_path": str(db_path),
        "counts": stats,
    }


_dist = resolve_frontend_dist()
if _dist:
    mount_frontend(app, _dist)
