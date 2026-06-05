"""Seed reference rows from MediaBinger contenttype / menuitems / filters."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ContentType, Filter, MenuItem

CONTENT_TYPES = [
    (100, "Countries", None),
    (200, "Music", None),
    (300, "Movies", None),
    (400, "Series", None),
    (500, "Books", None),
    (600, "Games", None),
]

MENU_ITEMS = [
    (0, "Home", "200", 1),
    (1, "Artists", "200", 2),
    (2, "Playlists", "200", 3),
    (4, "Releases", "20000", 4),
    (10, "Home", "400", 1),
    (11, "Series", "400", 2),
    (12, "Watchlists", "400", 3),
    (13, "Releases", "400000", 4),
]

MUSIC_FILTERS = [
    (0, "Name", "list", 200, 1, "bands", "[bndName,bndID]", 0),
    (1, "Type", "option", 200, 1, "artisttypes", "[atyName,atyID]", 1),
    (7, "Genre", "select", 200, 1, "genres", "[genName,genID]", 7),
]

SERIES_FILTERS = [
    (20, "Name", "list", 400, 11, "series", "[serName,serID]", 0),
    (21, "Genre", "select", 400, 11, "genres", "[genName,genID]", 1),
]

MOVIE_FILTERS = [
    (30, "Title", "list", 300, 6, "movies", "[movTitle,movID]", 0),
]

BOOK_FILTERS = [
    (40, "Title", "list", 500, 16, "books", "[booTitle,booID]", 0),
]

GAME_FILTERS = [
    (50, "Name", "list", 600, 20, "games", "[gamName,gamID]", 0),
]


def seed_reference_data(db: Session) -> None:
    if db.scalar(select(ContentType).limit(1)):
        return
    for cnt_id, name, sort_id in CONTENT_TYPES:
        db.add(ContentType(cnt_id=cnt_id, cnt_name=name, cnt_sort_id=sort_id))
    for mei_id, name, ctype, order in MENU_ITEMS:
        db.add(
            MenuItem(
                mei_id=mei_id,
                mei_name=name,
                mei_fk_contenttype=ctype,
                mei_order=order,
            )
        )
    for row in MUSIC_FILTERS + SERIES_FILTERS + MOVIE_FILTERS + BOOK_FILTERS + GAME_FILTERS:
        db.add(
            Filter(
                fil_id=row[0],
                fil_name=row[1],
                fil_data_type=row[2],
                fil_fk_contenttype=row[3],
                fil_fk_menuitems=row[4],
                fil_parent_table=row[5],
                fil_parent_field=row[6],
                fil_order=row[7],
            )
        )
    db.commit()
