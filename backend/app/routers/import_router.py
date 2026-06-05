from fastapi import APIRouter, Depends, Query

from app.config import settings
from app.deps import require_admin
from app.models import User
from app.import_databinger import copy_from_mysql, import_from_sql_file
from app.paths import LEGACY_SQL
from app.schemas import ImportResultOut

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/sql", response_model=ImportResultOut)
def import_sql(
    replace: bool = Query(False),
    sql_path: str | None = None,
    _admin: User = Depends(require_admin),
):
    from pathlib import Path

    path = Path(sql_path) if sql_path else LEGACY_SQL
    result = import_from_sql_file(path, replace=replace)
    return ImportResultOut(
        tables=result.tables,
        skipped_statements=result.skipped_statements,
        errors=result.errors,
    )


@router.post("/mysql", response_model=ImportResultOut)
def import_mysql(
    replace: bool = Query(False),
    _admin: User = Depends(require_admin),
):
    source = settings.mysql_import_url
    if not source:
        from fastapi import HTTPException

        raise HTTPException(
            400,
            "Set MEDIASTACK_MYSQL_IMPORT_URL (e.g. mysql+pymysql://root:pass@localhost/databinger)",
        )
    result = copy_from_mysql(source, replace=replace)
    return ImportResultOut(
        tables=result.tables,
        skipped_statements=result.skipped_statements,
        errors=result.errors,
    )
