"""Import legacy databinger.sql into the active database (SQLite or MySQL)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.database import Base, engine
from app.paths import LEGACY_SQL

INSERT_RE = re.compile(r"^INSERT INTO `(\w+)`", re.IGNORECASE)

LOOKUP_TABLES = frozenset({
    "continents",
    "countries",
    "artisttypes",
    "subgenres",
    "genres",
    "artists",
    "artistparticipations",
    "companies",
})

IMPORT_TABLES = frozenset({
    "contenttype",
    "menuitems",
    "filters",
    "bands",
    "releases",
    "tracks",
    "playlists",
    "playlistdata",
    "reproductions",
    "series",
    "seasons",
    "episodes",
    "movies",
    "books",
    "bookseries",
    "user",
    "apiauth",
    "genres",
    "subgenres",
    "artists",
    "artisttypes",
    "continents",
    "countries",
    "companies",
    "games",
}) | LOOKUP_TABLES


@dataclass
class ImportResult:
    tables: dict[str, int] = field(default_factory=dict)
    skipped_statements: int = 0
    errors: list[str] = field(default_factory=list)


def _iter_insert_statements(sql_path: Path, tables: frozenset[str]):
    buffer: list[str] = []
    table: str | None = None
    with sql_path.open(encoding="utf-8", errors="replace") as fh:
        for line in fh:
            m = INSERT_RE.match(line.strip())
            if m:
                if buffer and table and table in tables:
                    yield table, "".join(buffer)
                table = m.group(1).lower()
                buffer = [line]
            elif buffer:
                buffer.append(line)
            if buffer and line.rstrip().endswith(";"):
                if table and table in tables:
                    yield table, "".join(buffer)
                buffer = []
                table = None


def _mysql_strings_to_sqlite(stmt: str) -> str:
    """Convert MySQL-style \\' escapes inside quoted strings to SQLite ''."""
    out: list[str] = []
    i = 0
    in_string = False
    quote = ""
    while i < len(stmt):
        ch = stmt[i]
        if not in_string and ch in ("'", '"'):
            in_string = True
            quote = ch
            out.append(ch)
            i += 1
            continue
        if in_string and ch == "\\" and i + 1 < len(stmt):
            nxt = stmt[i + 1]
            if nxt == quote or nxt == "\\" or nxt == "n" or nxt == "r" or nxt == "t":
                if nxt == quote:
                    out.append(quote + quote)
                elif nxt == "n":
                    out.append("\\n")
                elif nxt == "r":
                    out.append("\\r")
                elif nxt == "t":
                    out.append("\\t")
                else:
                    out.append("\\\\")
                i += 2
                continue
        if in_string and ch == quote:
            if i + 1 < len(stmt) and stmt[i + 1] == quote:
                out.append(quote + quote)
                i += 2
                continue
            in_string = False
            quote = ""
            out.append(ch)
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _sqlite_stmt(stmt: str) -> str:
    s = _mysql_strings_to_sqlite(stmt.strip().rstrip(";"))
    if "INSERT INTO" in s.upper() and "OR IGNORE" not in s.upper():
        s = s.replace("INSERT INTO", "INSERT OR IGNORE INTO", 1)
    return s


def import_from_sql_file(
    sql_path: Path | None = None,
    *,
    replace: bool = False,
    eng: Engine | None = None,
) -> ImportResult:
    path = sql_path or LEGACY_SQL
    if not path.is_file():
        raise FileNotFoundError(f"SQL dump not found: {path}")

    eng = eng or engine
    result = ImportResult()

    if replace:
        Base.metadata.drop_all(bind=eng)
    Base.metadata.create_all(bind=eng)

    is_sqlite = eng.dialect.name == "sqlite"
    existing = set(inspect(eng).get_table_names())

    with eng.begin() as conn:
        if is_sqlite:
            conn.execute(text("PRAGMA foreign_keys=OFF"))
        for table, stmt in _iter_insert_statements(path, IMPORT_TABLES):
            if table not in existing:
                result.skipped_statements += 1
                continue
            try:
                sql = _sqlite_stmt(stmt) if is_sqlite else stmt
                conn.execute(text(sql))
                result.tables[table] = result.tables.get(table, 0) + 1
            except Exception as exc:
                result.errors.append(f"{table}: {exc}")
                if len(result.errors) > 20:
                    break
        if is_sqlite:
            conn.execute(text("PRAGMA foreign_keys=ON"))

    return result


def import_tables_from_sql(
    tables: frozenset[str],
    *,
    sql_path: Path | None = None,
    eng: Engine | None = None,
) -> ImportResult:
    path = sql_path or LEGACY_SQL
    if not path.is_file():
        return ImportResult(errors=[f"SQL dump not found: {path}"])

    eng = eng or engine
    result = ImportResult()
    is_sqlite = eng.dialect.name == "sqlite"
    existing = set(inspect(eng).get_table_names())

    with eng.begin() as conn:
        if is_sqlite:
            conn.execute(text("PRAGMA foreign_keys=OFF"))
        for table, stmt in _iter_insert_statements(path, tables):
            if table not in existing:
                result.skipped_statements += 1
                continue
            try:
                sql = _sqlite_stmt(stmt) if is_sqlite else stmt
                conn.execute(text(sql))
                result.tables[table] = result.tables.get(table, 0) + 1
            except Exception as exc:
                result.errors.append(f"{table}: {exc}")
                if len(result.errors) > 20:
                    break
        if is_sqlite:
            conn.execute(text("PRAGMA foreign_keys=ON"))
    return result


def copy_from_mysql(source_url: str, *, replace: bool = False) -> ImportResult:
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session

    src = create_engine(source_url)
    result = ImportResult()
    if replace:
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    from app import models  # noqa: F401

    model_by_table = {m.class_.__tablename__: m.class_ for m in Base.registry.mappers}

    src_tables = set(inspect(src).get_table_names())
    with Session(src) as s_src, Session(engine) as s_dst:
        if replace:
            for tbl in reversed(Base.metadata.sorted_tables):
                s_dst.execute(tbl.delete())
            s_dst.commit()
        for table_name in IMPORT_TABLES:
            if table_name not in src_tables or table_name not in model_by_table:
                continue
            model = model_by_table[table_name]
            from sqlalchemy.inspection import inspect as sa_inspect

            rows = s_src.scalars(select(model)).all()
            for row in rows:
                data = {
                    attr.key: getattr(row, attr.key)
                    for attr in sa_inspect(row).mapper.column_attrs
                }
                s_dst.merge(model(**data))
            result.tables[table_name] = len(rows)
        s_dst.commit()
    return result
