"""Enrich Games catalog cards with DB metadata for filters + about fields."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.games_store import iter_game_leaf_meta, iter_game_work_meta


def _names(raw: object) -> list[str]:
    out: list[str] = []
    if isinstance(raw, str) and raw.strip():
        out.append(raw.strip())
    elif isinstance(raw, list):
        for item in raw:
            if isinstance(item, str) and item.strip():
                out.append(item.strip())
            elif isinstance(item, dict):
                n = (item.get("name") or "").strip()
                if n:
                    out.append(n)
    return out


def _genre_names(about: dict) -> list[str]:
    raw = about.get("genres") or []
    if not isinstance(raw, list):
        return []
    names: list[str] = []
    for g in raw:
        if isinstance(g, str) and g.strip():
            names.append(g.strip())
        elif isinstance(g, dict):
            name = (g.get("name") or "").strip()
            if name:
                names.append(name)
    return names


def enrich_games_catalog(db: Session, catalog: dict) -> dict:
    """Attach genre/developer/publisher fields from GameLeaf onto catalog cards."""
    leaf_by_id: dict[str, dict] = {}
    for row, about in iter_game_leaf_meta(db):
        if row.glk_game_id:
            leaf_by_id[row.glk_game_id] = about

    work_by_slug: dict[str, dict] = {}
    for row, about in iter_game_work_meta(db):
        if row.gwk_slug:
            work_by_slug[row.gwk_slug.casefold()] = about

    def apply_about(card: dict, about: dict) -> None:
        gnames = _genre_names(about)
        if gnames:
            card["genre_names"] = gnames
        developers = _names(about.get("developers") or about.get("studio"))
        publishers = _names(about.get("publishers") or about.get("publisher"))
        directors = _names(
            about.get("directors")
            or about.get("director")
            or about.get("writers")
        )
        if developers:
            card["developers"] = developers
        if publishers:
            card["publishers"] = publishers
        if directors:
            card["directors"] = directors
            card["writers"] = directors
        web_url = str(about.get("web_url") or "").strip()
        if web_url:
            if "://" not in web_url:
                web_url = f"https://{web_url.lstrip('/')}"
            card["web_url"] = web_url
            platform = str(card.get("platform") or "").casefold()
            prefer_web = platform in {"browser", "web", "flash"} or not card.get(
                "has_rom"
            )
            if prefer_web:
                card["open_url"] = web_url
                card["open_mode"] = "web"
                card["open_label"] = "Play game"
                card["has_rom"] = True

    for card in catalog.get("games") or catalog.get("films") or []:
        if not isinstance(card, dict):
            continue
        about = leaf_by_id.get(card.get("id") or "")
        if about:
            apply_about(card, about)

    for card in catalog.get("franchises") or []:
        if not isinstance(card, dict):
            continue
        slug = (card.get("id") or "").casefold()
        about = work_by_slug.get(slug)
        if about:
            apply_about(card, about)
        # Also stamp leaf games nested on the franchise card.
        for leaf in card.get("games") or card.get("films") or []:
            if not isinstance(leaf, dict):
                continue
            leaf_about = leaf_by_id.get(leaf.get("id") or "")
            if leaf_about:
                apply_about(leaf, leaf_about)

    if "films" not in catalog and catalog.get("games"):
        catalog["films"] = catalog["games"]
    return catalog
