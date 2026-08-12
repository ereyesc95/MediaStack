"""Adult / NSFW genre classification for catalog visibility."""
from __future__ import annotations

# Parent genres whose entire subgenre tree is adult-only.
ADULT_PARENT_GENRES = frozenset(
    {
        "adult",
        "adult print",
    }
)

# Explicit subgenres under Anime / Manga (and anywhere else) that are adult-only.
ADULT_SUBGENRES = frozenset(
    {
        "ecchi",
        "harem",
        "lolicon",
        "yuri",
        "yaoi",
        "reverse harem",
    }
)


def _norm(name: str | None) -> str:
    return (name or "").strip().casefold()


def is_adult_subgenre_name(name: str | None) -> bool:
    return _norm(name) in ADULT_SUBGENRES


def is_adult_parent_genre_name(name: str | None) -> bool:
    return _norm(name) in ADULT_PARENT_GENRES


def is_adult_taxonomy(*, parent_name: str | None, subgenre_name: str | None) -> bool:
    if is_adult_parent_genre_name(parent_name):
        return True
    if is_adult_subgenre_name(subgenre_name):
        return True
    return False


def card_has_adult_genres(
    *,
    genre_names: list[str] | None = None,
    genre_ids: list | None = None,
    parent_genre_names: list[str] | None = None,
) -> bool:
    for n in parent_genre_names or []:
        if is_adult_parent_genre_name(n):
            return True
    for n in genre_names or []:
        if is_adult_subgenre_name(n) or is_adult_parent_genre_name(n):
            return True
    # genre_ids alone cannot decide without DB lookup; callers should pass names.
    _ = genre_ids
    return False


def filter_adult_cards(cards: list[dict], *, nsfw_unlocked: bool) -> list[dict]:
    if nsfw_unlocked:
        return cards
    out: list[dict] = []
    for card in cards:
        if not isinstance(card, dict):
            out.append(card)
            continue
        if card_has_adult_genres(
            genre_names=card.get("genre_names")
            if isinstance(card.get("genre_names"), list)
            else None,
            genre_ids=card.get("genre_ids")
            if isinstance(card.get("genre_ids"), list)
            else None,
            parent_genre_names=card.get("parent_genre_names")
            if isinstance(card.get("parent_genre_names"), list)
            else None,
        ):
            continue
        out.append(card)
    return out


def filter_subgenre_groups(groups: list[dict], *, nsfw_unlocked: bool) -> list[dict]:
    """Drop adult parent groups and adult-named subgenres from filter chips."""
    if nsfw_unlocked:
        return groups
    out: list[dict] = []
    for g in groups or []:
        if not isinstance(g, dict):
            continue
        parent = g.get("name") or g.get("label") or g.get("genre") or ""
        if is_adult_parent_genre_name(str(parent)):
            continue
        items = g.get("items") or g.get("subgenres") or []
        if not isinstance(items, list):
            items = []
        kept = []
        for it in items:
            if not isinstance(it, dict):
                continue
            name = it.get("name") or it.get("label") or ""
            if is_adult_subgenre_name(str(name)):
                continue
            kept.append(it)
        if items and not kept:
            continue
        ng = dict(g)
        if "items" in g:
            ng["items"] = kept
        if "subgenres" in g:
            ng["subgenres"] = kept
        out.append(ng)
    return out
