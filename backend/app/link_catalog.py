"""Link categories, logo keys, and MusicBrainz / legacy type mapping."""
from __future__ import annotations

import re
from urllib.parse import urlparse

LINK_CATEGORIES: tuple[str, ...] = (
    "social",
    "streaming",
    "shopping",
    "downloads",
    "databases",
    "lyrics",
)

LEGACY_TYPE_TO_CATEGORY: dict[int, str] = {
    2: "social",
    3: "streaming",
    4: "shopping",
    5: "downloads",
    6: "databases",
    7: "lyrics",
}

CATEGORY_LABELS: dict[str, str] = {
    "social": "Social Media",
    "streaming": "Streaming",
    "shopping": "Shopping",
    "downloads": "Downloads",
    "databases": "Databases",
    "lyrics": "Lyrics",
}

ADMIN_ONLY_CATEGORIES: frozenset[str] = frozenset({"downloads"})

# Sort tier: 0 = official website, 1 = social giants, 2 = everything else (alpha within tier)
SOCIAL_GIANT_KEYS: frozenset[str] = frozenset(
    {
        "facebook",
        "instagram",
        "x",
        "twitter",
        "youtube",
        "reddit",
        "myspace",
        "tiktok",
        "tumblr",
    }
)

OFFICIAL_KEYS: frozenset[str] = frozenset({"official-website"})

# Built-in catalog: key -> (display name, default category, host fragments)
LINK_CATALOG: dict[str, dict] = {
    "allmusic": {"name": "AllMusic", "category": "databases", "hosts": ["allmusic.com"]},
    "amazon-music": {"name": "Amazon Music", "category": "shopping", "hosts": ["music.amazon.com", "amazon.com/music"]},
    "apple-music": {"name": "Apple Music", "category": "streaming", "hosts": ["music.apple.com", "itunes.apple.com"]},
    "azlyrics": {"name": "AZLyrics", "category": "lyrics", "hosts": ["azlyrics.com"]},
    "bandcamp": {"name": "Bandcamp", "category": "shopping", "hosts": ["bandcamp.com"]},
    "deezer": {"name": "Deezer", "category": "streaming", "hosts": ["deezer.com"]},
    "discogs": {"name": "Discogs", "category": "databases", "hosts": ["discogs.com"]},
    "facebook": {"name": "Facebook", "category": "social", "hosts": ["facebook.com", "fb.com"]},
    "genius": {"name": "Genius", "category": "lyrics", "hosts": ["genius.com"]},
    "imdb": {"name": "IMDb", "category": "databases", "hosts": ["imdb.com"]},
    "instagram": {"name": "Instagram", "category": "social", "hosts": ["instagram.com"]},
    "lastfm": {"name": "Last.fm", "category": "streaming", "hosts": ["last.fm"]},
    "musicbrainz": {"name": "MusicBrainz", "category": "databases", "hosts": ["musicbrainz.org"]},
    "musixmatch": {"name": "Musixmatch", "category": "lyrics", "hosts": ["musixmatch.com"]},
    "muzikum": {"name": "Muzikum", "category": "lyrics", "hosts": ["muzikum.eu"]},
    "myspace": {"name": "MySpace", "category": "social", "hosts": ["myspace.com"]},
    "official-store": {"name": "Official Store", "category": "shopping", "hosts": []},
    "official-website": {"name": "Official Website", "category": "social", "hosts": []},
    "rateyourmusic": {"name": "Rate Your Music", "category": "databases", "hosts": ["rateyourmusic.com"]},
    "reddit": {"name": "Reddit", "category": "social", "hosts": ["reddit.com"]},
    "rutracker": {"name": "RuTracker", "category": "downloads", "hosts": ["rutracker.org"]},
    "secondhandsongs": {"name": "SecondHandSongs", "category": "databases", "hosts": ["secondhandsongs.com"]},
    "setlistfm": {"name": "Setlist.fm", "category": "databases", "hosts": ["setlist.fm"]},
    "songkick": {"name": "Songkick", "category": "shopping", "hosts": ["songkick.com"]},
    "soundcloud": {"name": "SoundCloud", "category": "streaming", "hosts": ["soundcloud.com"]},
    "spotify": {"name": "Spotify", "category": "streaming", "hosts": ["spotify.com", "open.spotify.com"]},
    "thepiratebay": {"name": "The Pirate Bay", "category": "downloads", "hosts": ["thepiratebay.org"]},
    "tidal": {"name": "Tidal", "category": "streaming", "hosts": ["tidal.com"]},
    "tiktok": {"name": "TikTok", "category": "social", "hosts": ["tiktok.com"]},
    "tumblr": {"name": "Tumblr", "category": "social", "hosts": ["tumblr.com"]},
    "twitter": {"name": "X", "category": "social", "hosts": ["twitter.com"]},
    "x": {"name": "X", "category": "social", "hosts": ["x.com"]},
    "viaf": {"name": "VIAF", "category": "databases", "hosts": ["viaf.org"]},
    "wikidata": {"name": "Wikidata", "category": "databases", "hosts": ["wikidata.org"]},
    "wikipedia": {"name": "Wikipedia", "category": "databases", "hosts": ["wikipedia.org"]},
    "worldcat": {"name": "WorldCat", "category": "databases", "hosts": ["worldcat.org"]},
    "youtube": {"name": "YouTube", "category": "streaming", "hosts": ["youtube.com", "youtu.be"]},
    "youtube-music": {"name": "YouTube Music", "category": "streaming", "hosts": ["music.youtube.com"]},
}

_HOST_TO_KEY: dict[str, str] = {}
for key, meta in LINK_CATALOG.items():
    for host in meta.get("hosts") or []:
        _HOST_TO_KEY[host.lower()] = key


def catalog_entries() -> list[dict]:
    return [
        {"key": k, "name": v["name"], "category": v["category"]}
        for k, v in sorted(LINK_CATALOG.items(), key=lambda x: x[1]["name"].lower())
    ]


def normalize_url(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return ""
    if not u.startswith(("http://", "https://")):
        u = f"https://{u}"
    parsed = urlparse(u)
    host = (parsed.netloc or "").lower().removeprefix("www.")
    path = (parsed.path or "").rstrip("/")
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{parsed.scheme}://{host}{path}{query}".lower()


def _parse_legacy_type_id(type_name: str) -> int | None:
    m = re.search(r"\((\d+)\)\s*$", type_name)
    return int(m.group(1)) if m else None


def clean_label(type_name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (type_name or "").strip())


def resolve_logo_key(type_name: str, url: str) -> str | None:
    label = clean_label(type_name).lower()
    if "official website" in label or label == "official site":
        return "official-website"
    if "official store" in label:
        return "official-store"
    for key, meta in LINK_CATALOG.items():
        if meta["name"].lower() == label or key.replace("-", " ") == label.replace("-", " "):
            return key
        if label and label in meta["name"].lower():
            return key
    host = urlparse(normalize_url(url)).netloc.removeprefix("www.")
    for frag, key in _HOST_TO_KEY.items():
        if frag in host:
            return key
    return None


def resolve_category(type_name: str, url: str, logo_key: str | None) -> str:
    if logo_key and logo_key in LINK_CATALOG:
        return LINK_CATALOG[logo_key]["category"]
    tid = _parse_legacy_type_id(type_name)
    if tid and tid in LEGACY_TYPE_TO_CATEGORY:
        return LEGACY_TYPE_TO_CATEGORY[tid]
    typ = clean_label(type_name).lower()
    if any(k in typ for k in ("facebook", "instagram", "twitter", "social", "myspace", "reddit", "tiktok", "tumblr")):
        return "social"
    if "official website" in typ or typ == "official site":
        return "social"
    if any(k in typ for k in ("stream", "spotify", "deezer", "tidal", "youtube", "soundcloud", "last.fm")):
        return "streaming"
    if any(k in typ for k in ("purchase", "store", "bandcamp", "itunes", "amazon", "ticket", "songkick")):
        return "shopping"
    if any(k in typ for k in ("lyric", "genius", "musixmatch", "muzikum", "az")):
        return "lyrics"
    if any(k in typ for k in ("download", "rutracker", "pirate")):
        return "downloads"
    host = urlparse(normalize_url(url)).netloc
    for frag, key in _HOST_TO_KEY.items():
        if frag in host and key in LINK_CATALOG:
            return LINK_CATALOG[key]["category"]
    return "databases"


def sort_tier(logo_key: str | None, label: str) -> int:
    key = (logo_key or "").lower()
    lab = label.lower()
    if key in OFFICIAL_KEYS or "official website" in lab:
        return 0
    if key in SOCIAL_GIANT_KEYS:
        return 1
    return 2


def is_famous(logo_key: str | None, label: str) -> bool:
    key = (logo_key or "").lower()
    if key in OFFICIAL_KEYS:
        return False
    if key in SOCIAL_GIANT_KEYS:
        return True
    if key and key in LINK_CATALOG and key not in ("official-website", "official-store"):
        return True
    return False


def default_label(type_name: str, logo_key: str | None) -> str:
    cleaned = clean_label(type_name)
    if cleaned:
        return cleaned
    if logo_key and logo_key in LINK_CATALOG:
        return LINK_CATALOG[logo_key]["name"]
    return "Link"
