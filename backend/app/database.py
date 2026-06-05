from collections.abc import Generator

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

_connect_args: dict = {}
if settings.database_url.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}

engine = create_engine(settings.database_url, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from sqlalchemy import select

    from app import models  # noqa: F401
    from app.models import Band, ContentType
    from app.seed import seed_reference_data

    from app.schema_migrate import migrate_schema

    Base.metadata.create_all(bind=engine)
    migrate_schema(engine)
    db = SessionLocal()
    try:
        has_data = db.scalar(select(Band.bnd_id).limit(1)) is not None
        has_meta = db.scalar(select(ContentType.cnt_id).limit(1)) is not None
        if not has_meta and not has_data:
            seed_reference_data(db)
        elif not has_meta:
            seed_reference_data(db)
        from app.seed_music import ensure_music_lookup_data
        from app.profiles import ensure_profiles

        ensure_music_lookup_data(db)
        ensure_profiles(db)
    finally:
        db.close()
