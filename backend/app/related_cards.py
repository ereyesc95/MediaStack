"""Shared helpers for creator/similar related card lists in meta/about JSON."""
from __future__ import annotations

import re
import uuid


_ABS_URL_RE = re.compile(r"^[a-z][a-z0-9+.-]*:", re.I)


def normalize_external_url(url: str | None) -> str:
    raw = (url or "").strip()
    if not raw:
        return ""
    if _ABS_URL_RE.match(raw):
        return raw
    return f"https://{raw}"


def related_bucket(related: dict, bucket: str) -> list[dict]:
    key = "creator" if bucket == "creator" else "similar"
    items = related.get(key)
    if not isinstance(items, list):
        items = []
        related[key] = items
    return items


def ensure_related(meta: dict) -> dict:
    related = meta.get("related")
    if not isinstance(related, dict):
        related = {}
        meta["related"] = related
    return related


def add_related_card(
    meta: dict,
    *,
    bucket: str,
    title: str,
    tmdb_id: int | str | None = None,
    date_iso: str | None = None,
    poster_url: str | None = None,
    overview: str | None = None,
    via_members: list[str] | None = None,
) -> dict:
    related = ensure_related(meta)
    key = "creator" if bucket == "creator" else "similar"
    items = related_bucket(related, key)
    vias = [
        str(v).strip()
        for v in (via_members or [])
        if v and str(v).strip()
    ]
    want = str(tmdb_id) if tmdb_id is not None else None
    for item in items:
        if want and str(item.get("tmdb_id") or "") == want:
            item["hidden"] = False
            item["manual"] = True
            item["title"] = title.strip() or item.get("title")
            item["name"] = item["title"]
            if date_iso is not None:
                item["date_iso"] = date_iso
            if poster_url is not None:
                item["poster_url"] = poster_url
                item["cover_url"] = poster_url
            if overview is not None:
                item["overview"] = overview
            if vias:
                item["via_members"] = vias
            return item
    card = {
        "id": f"manual-{uuid.uuid4().hex[:10]}",
        "tmdb_id": int(tmdb_id) if str(tmdb_id or "").isdigit() else tmdb_id,
        "title": title.strip(),
        "name": title.strip(),
        "date_iso": date_iso,
        "poster_url": poster_url,
        "cover_url": poster_url,
        "overview": overview,
        "manual": True,
        "hidden": False,
    }
    if vias:
        card["via_members"] = vias
    items.append(card)
    return card


def remove_related_card(
    meta: dict,
    *,
    bucket: str,
    item_id: str | int,
) -> bool:
    related = ensure_related(meta)
    key = "creator" if bucket == "creator" else "similar"
    items = related_bucket(related, key)
    want = str(item_id)
    for item in items:
        ids = {str(item.get("id") or ""), str(item.get("tmdb_id") or "")}
        if want not in ids:
            continue
        if item.get("manual") and not item.get("tmdb_id"):
            items.remove(item)
        else:
            item["hidden"] = True
        related[key] = items
        return True
    return False


def visible_related(meta: dict, bucket: str) -> list[dict]:
    related = meta.get("related") if isinstance(meta.get("related"), dict) else {}
    key = "creator" if bucket == "creator" else "similar"
    return [
        r
        for r in (related.get(key) or [])
        if isinstance(r, dict) and not r.get("hidden")
    ]


def ensure_links(meta: dict) -> list[dict]:
    links = meta.get("links")
    if not isinstance(links, list):
        links = []
        meta["links"] = links
    return links


def add_link_item(
    meta: dict,
    *,
    category: str,
    label: str,
    url: str,
    logo_key: str | None = None,
    logo_url: str | None = None,
) -> dict:
    links = ensure_links(meta)
    raw = normalize_external_url(url)
    item = {
        "id": f"lnk-{uuid.uuid4().hex[:10]}",
        "category": category or "databases",
        "label": (label or "").strip() or "Link",
        "url": raw,
        "logo_key": logo_key,
        "logo_url": logo_url
        or (f"/assets/links/{logo_key}.svg" if logo_key else "/assets/links/link.svg"),
    }
    links.append(item)
    return item


def patch_link_item(
    meta: dict,
    link_id: str,
    *,
    category: str | None = None,
    label: str | None = None,
    url: str | None = None,
    logo_key: str | None = None,
    logo_url: str | None = None,
    clear_logo_key: bool = False,
) -> dict | None:
    links = ensure_links(meta)
    want = str(link_id)
    for item in links:
        if str(item.get("id")) != want:
            continue
        if category is not None:
            item["category"] = category
        if label is not None:
            item["label"] = label.strip() or item.get("label") or "Link"
        if url is not None:
            item["url"] = normalize_external_url(url)
        if clear_logo_key:
            item["logo_key"] = None
        if logo_key is not None:
            item["logo_key"] = logo_key
        if logo_url is not None:
            item["logo_url"] = logo_url
        elif logo_key:
            item["logo_url"] = f"/assets/links/{logo_key}.svg"
        return item
    return None


def delete_link_item(meta: dict, link_id: str) -> bool:
    links = ensure_links(meta)
    want = str(link_id)
    after = [x for x in links if str(x.get("id")) != want]
    if len(after) == len(links):
        return False
    meta["links"] = after
    return True
