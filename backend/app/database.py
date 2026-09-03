from collections.abc import Generator

from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import settings

_is_sqlite = settings.database_url.startswith("sqlite")
_connect_args: dict = {}
_engine_kwargs: dict = {}
if _is_sqlite:
    # Wait for a writer instead of failing immediately when the artist page
    # is still importing lineup / related rows.
    _connect_args = {"check_same_thread": False, "timeout": 30}
    _engine_kwargs["poolclass"] = NullPool

engine = create_engine(
    settings.database_url, connect_args=_connect_args, **_engine_kwargs
)

if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_on_connect(dbapi_conn, _connection_record) -> None:
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

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
        from app.artist_import_guide import ensure_artist_user_guide_template
        from app.staff_roles import ensure_staff_roles
        from app.universes import migrate_legacy_universe_members

        ensure_artist_user_guide_template(db)
        ensure_staff_roles(db)
        migrate_legacy_universe_members(db)
    finally:
        db.close()
