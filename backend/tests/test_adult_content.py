"""NSFW / adult genre classification unit tests."""
from __future__ import annotations

from app.adult_content import (
    card_has_adult_genres,
    is_adult_parent_genre_name,
    is_adult_subgenre_name,
    is_adult_taxonomy,
)


def test_adult_parody_is_adult_subgenre():
    assert is_adult_subgenre_name("Adult Parody")
    assert is_adult_subgenre_name("adult parody")


def test_regular_subgenres_not_adult():
    assert not is_adult_subgenre_name("Action")
    assert not is_adult_subgenre_name("Comedy")
    assert not is_adult_subgenre_name("")


def test_adult_parent_genres():
    assert is_adult_parent_genre_name("Adult")
    assert is_adult_parent_genre_name("Adult Print")
    assert not is_adult_parent_genre_name("Animation")


def test_adult_prefix_catch_all():
    assert is_adult_subgenre_name("Adult Something New")
    assert is_adult_subgenre_name("adult-experimental")


def test_card_has_adult_genres_names():
    assert card_has_adult_genres(genre_names=["Action", "Adult Parody"])
    assert not card_has_adult_genres(genre_names=["Action", "Drama"])


def test_card_has_adult_via_extra_db_names():
    assert card_has_adult_genres(
        genre_names=["Custom Adult Label"],
        extra_adult_subgenres={"custom adult label"},
    )
    assert not card_has_adult_genres(
        genre_names=["Custom Adult Label"],
        extra_adult_subgenres={"other"},
    )


def test_card_parent_genre_names():
    assert card_has_adult_genres(parent_genre_names=["Adult"])
    assert not card_has_adult_genres(parent_genre_names=["Comedy"])


def test_taxonomy_combo():
    assert is_adult_taxonomy(parent_name="Animation", subgenre_name="Hentai")
    assert is_adult_taxonomy(parent_name="Adult", subgenre_name="Anything")
    assert not is_adult_taxonomy(parent_name="Animation", subgenre_name="Mecha")
