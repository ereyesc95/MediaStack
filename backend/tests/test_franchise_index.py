"""Franchise index slug / scan / related unit tests with tmp fixtures."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.franchise_index import (
    build_franchise_index,
    canonical_franchise_slug,
    franchise_slug_for_path,
    normalize_franchise_slug,
    parse_dated_folder_name,
    related_for_path,
    save_franchise_index,
)
from app.media_paths_util import (
    entry_display_name,
    resolve_media_entry,
    resolve_named_child,
)


def test_normalize_franchise_slug_special_chars():
    assert normalize_franchise_slug("  Dragon  Ball  ") == "dragon ball"
    assert normalize_franchise_slug("Don█t Panic") == "don't panic"
    assert normalize_franchise_slug("Hello■ World") == "hello, world"


def test_parse_dated_folder_name():
    date, title = parse_dated_folder_name("1986.12.20. Movie Title")
    assert date == "1986-12-20"
    assert title == "Movie Title"
    date, title = parse_dated_folder_name("2010. Heartache")
    assert date == "2010-01-01"
    assert title == "Heartache"


def test_canonical_alias_one_hop(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "data"
    data.mkdir()
    (data / "franchise_aliases.json").write_text(
        json.dumps({"DBZ": "Dragon Ball", "dbz": "Dragon Ball"}),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "app.franchise_index.DATA_DIR", data, raising=True
    )
    assert canonical_franchise_slug("DBZ") == "dragon ball"
    assert canonical_franchise_slug("Dragon Ball") == "dragon ball"


def test_build_index_movies_series_related(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    media = tmp_path / "Media"
    film = (
        media
        / "Movies"
        / "D"
        / "Dragon Ball"
        / "1986.12.20. Dragon Ball Movie"
    )
    film.mkdir(parents=True)
    (film / "movie.mp4").write_bytes(b"x")
    season = (
        media
        / "Series"
        / "D"
        / "Dragon Ball"
        / "1986.02.26. Season 1"
    )
    season.mkdir(parents=True)
    book = media / "Books" / "D" / "Dragon Ball" / "1986. Book One"
    book.mkdir(parents=True)

    data = tmp_path / "data"
    data.mkdir()
    monkeypatch.setattr("app.franchise_index.DATA_DIR", data, raising=True)

    index = build_franchise_index(media)
    assert "dragon ball" in index.franchises
    group = index.franchises["dragon ball"]
    kinds = {e.kind for e in group.entries}
    assert "movie" in kinds
    assert "series" in kinds
    assert "book" in kinds

    film_rel = "Movies/D/Dragon Ball/1986.12.20. Dragon Ball Movie"
    related = related_for_path(index, film_rel)
    assert related.get("series")
    assert related.get("books")
    assert not any(
        e["path"].casefold() == film_rel.casefold()
        for bucket in related.values()
        for e in bucket
    )

    assert franchise_slug_for_path(index, film_rel) == "dragon ball"
    out = save_franchise_index(index)
    assert out.is_file()


def test_exclude_override(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    media = tmp_path / "Media"
    a = media / "Movies" / "D" / "Dragon Ball" / "1986.12.20. Film A"
    b = media / "Series" / "D" / "Dragon Ball"
    a.mkdir(parents=True)
    (a / "a.mp4").write_bytes(b"x")
    b.mkdir(parents=True)

    data = tmp_path / "data"
    data.mkdir()
    film_rel = "Movies/D/Dragon Ball/1986.12.20. Film A"
    series_rel = "Series/D/Dragon Ball"
    (data / "franchise_overrides.json").write_text(
        json.dumps(
            [
                {
                    "type": "exclude",
                    "from": film_rel,
                    "to": series_rel,
                }
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr("app.franchise_index.DATA_DIR", data, raising=True)

    index = build_franchise_index(media)
    related = related_for_path(index, film_rel)
    series_paths = [e["path"].casefold() for e in related.get("series") or []]
    assert series_rel.casefold() not in series_paths


def test_resolve_named_child_path_sidecar(tmp_path: Path):
    media = tmp_path / "Media"
    real = media / "Movies" / "H" / "HIM" / "Documentaries"
    real.mkdir(parents=True)
    (real / "2010. Doc").mkdir()
    portal_parent = media / "Music" / "H" / "HIM" / "Video"
    portal_parent.mkdir(parents=True)
    sidecar = portal_parent / "Documentaries.path"
    sidecar.write_text("Movies/H/HIM/Documentaries", encoding="utf-8")

    assert entry_display_name(sidecar) == "Documentaries"
    resolved = resolve_media_entry(sidecar, media_root=media)
    assert resolved == real.resolve()
    hit = resolve_named_child(
        portal_parent, "Documentaries", media_root=media
    )
    assert hit == real.resolve()


def test_series_letter_sync_iter(tmp_path: Path):
    from app.services.sync_folders import _iter_series_franchise_dirs

    series = tmp_path / "Series"
    db = series / "D" / "Dragon Ball"
    db.mkdir(parents=True)
    dirs = _iter_series_franchise_dirs(series)
    assert any(p.name == "Dragon Ball" for p in dirs)
