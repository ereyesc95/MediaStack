"""Letter / search / page slicing for module catalog payloads."""
from __future__ import annotations


def card_letter(card: dict) -> str:
    raw = (card.get("letter") or "").strip().upper()
    if raw and raw != "#":
        ch = raw[0]
        return ch if "A" <= ch <= "Z" else "#"
    name = (card.get("name") or card.get("title") or "").strip()
    if not name:
        return "#"
    ch = name[0].upper()
    return ch if "A" <= ch <= "Z" else "#"


def collect_letters(items: list) -> list[str]:
    letters: set[str] = set()
    for it in items:
        if isinstance(it, dict):
            letters.add(card_letter(it))
    ordered = [c for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" if c in letters]
    if "#" in letters:
        ordered.append("#")
    return ordered


def filter_items(
    items: list,
    *,
    letter: str | None = None,
    search: str | None = None,
) -> list:
    out = [it for it in items if isinstance(it, dict)]
    q = (search or "").strip().casefold()
    if q:
        out = [
            it
            for it in out
            if q in (it.get("name") or it.get("title") or "").casefold()
        ]
    want = (letter or "").strip().upper()
    if want and want != "ALL":
        if want == "#":
            out = [it for it in out if card_letter(it) == "#"]
        else:
            out = [it for it in out if card_letter(it) == want[0]]
    return out


def paginate_items(
    items: list,
    *,
    page: int | None = None,
    page_size: int | None = None,
) -> tuple[list, int]:
    total = len(items)
    if not page or not page_size or page_size <= 0:
        return items, total
    p = max(1, int(page))
    size = max(1, min(int(page_size), 200))
    start = (p - 1) * size
    return items[start : start + size], total


def apply_catalog_paging(
    catalog: dict,
    *,
    list_keys: tuple[str, ...] = ("franchises",),
    letter: str | None = None,
    search: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
) -> dict:
    """Filter/page primary list keys; stamp letters/total metadata.

    Returns a shallow-copied catalog so letter/page slicing cannot mutate a
    shared module catalog cache entry.
    """
    out = dict(catalog)
    primary = list_keys[0] if list_keys else "franchises"
    primary_items = [
        it for it in (out.get(primary) or []) if isinstance(it, dict)
    ]
    letters = collect_letters(primary_items)

    filtered = filter_items(primary_items, letter=letter, search=search)
    paged, total = paginate_items(filtered, page=page, page_size=page_size)
    out[primary] = paged
    out["letters"] = letters
    out["total"] = total
    out["page"] = page or 1
    out["page_size"] = page_size or total or 0

    # Keep secondary lists in sync when letter/search applied (films/games/books).
    # Stamp per-list letters from the unfiltered secondary so Films/Games/Books
    # catalog scopes can show title letters (T…) instead of work letters (S…).
    for key in list_keys[1:]:
        secondary = [it for it in (out.get(key) or []) if isinstance(it, dict)]
        out[f"{key}_letters"] = collect_letters(secondary)
        if not secondary:
            continue
        sec = filter_items(secondary, letter=letter, search=search)
        if page and page_size:
            # Secondary lists (flat films/games) are often browsed independently;
            # still apply the same letter/search, but do not force franchise page size
            # unless the caller only has one key.
            out[key] = sec
            out[f"{key}_total"] = len(sec)
        else:
            out[key] = sec

    return out
