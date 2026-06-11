"""Generate monochrome link SVG icons for frontend/public/assets/links."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "frontend" / "public" / "assets" / "links"

ICONS: dict[str, str] = {
    "link": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12a5 5 0 0 1 5-5h3v2H8.9a3 3 0 1 0 0 6h3v2h-3a5 5 0 0 1-5-5zm7.1 0a5 5 0 0 1 5-5h3v2h-3a3 3 0 1 0 0 6h3v2h-3a5 5 0 0 1-5-5zm-2 0h4v2h-4v-2z"/></svg>',
    "official-website": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M2 12h20M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    "facebook": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 22v-8h2.8l.4-3.2H13.5V9.1c0-.9.3-1.6 1.7-1.6H16.7V4.4c-.3 0-1.4-.1-2.7-.1-2.7 0-4.5 1.6-4.5 4.6V10.8H7v3.2h2.5V22h4z"/></svg>',
    "instagram": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3.5"/><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none"/></svg>',
    "x": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4l7.2 9.6L4.2 20H7l5.4-7.1L16.7 20H20l-7.6-10.1L19.5 4h-2.9l-5 6.6L7.8 4H4z"/></svg>',
    "youtube": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C17.9 5 12 5 12 5s-5.9 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C6.1 19 12 19 12 19s5.9 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15.5v-7l6 3.5-6 3.5z"/></svg>',
    "spotify": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.4 14.3a.8.8 0 0 1-1.1.2c-3-1.8-6.8-2.2-11.3-1.2a.8.8 0 1 1-.4-1.5c4.9-1.1 9.1-.6 12.6 1.4a.8.8 0 0 1 .2 1.1zm1.6-3.5a1 1 0 0 1-1.3.3c-3.4-2-8.6-2.6-12.6-1.4a1 1 0 0 1-.6-1.9c4.6-1.4 10.4-.7 14.4 1.8a1 1 0 0 1 .1 1.2zm.2-3.7a1.2 1.2 0 0 1-1.6.4C13.7 7.7 8.2 7.4 4.8 8.6a1.2 1.2 0 0 1-.7-2.3c4-1.3 10.2-1 14.2 1.5a1.2 1.2 0 0 1 .4 1.7z"/></svg>',
    "reddit": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm5.5 11.5c0 .5-.4.9-.9.9s-.9-.4-.9-.9.4-.9.9-.9.9.4.9.9zM9.5 13c.8 1.2 2.4 2 4 2s3.2-.8 4-2c.3.3.8.5 1.2.5.9 0 1.6-.7 1.6-1.6s-.7-1.6-1.6-1.6c-.8 0-1.5.6-1.6 1.3-1.3-.9-3-1.4-4.8-1.4s-3.5.5-4.8 1.4c-.1-.7-.8-1.3-1.6-1.3-.9 0-1.6.7-1.6 1.6s.7 1.6 1.6 1.6c.4 0 .9-.2 1.2-.5z"/></svg>',
    "myspace": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm8 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM4 20c0-2.8 2.5-4 4-4s4 1.2 4 4H4zm8 0c0-2.8 2.5-4 4-4s4 1.2 4 4h-8z"/></svg>',
    "discogs": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5" fill="var(--bg-elevated,#111)"/></svg>',
    "wikipedia": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20L7 4h2.2l2.2 11.5L13.6 4H16l3 16h-2.3l-1.6-9.5L13 20h-2l-1.9-9.5L7.3 20H4z"/></svg>',
    "musicbrainz": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l8 4v10l-8 4-8-4V7l8-4zm0 2.2L6.5 8.2v7.6L12 18.8l5.5-3V8.2L12 5.2z"/></svg>',
    "apple-music": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 5.5c-2.8-.7-5.7-.4-8.3.8v11.2c2.3-1.2 4.9-1.5 7.4-.9V9.2c-2.1-.1-4.2.3-6.1 1.3V7.4c2.5-1 5.2-1.2 7-1v10.8z"/></svg>',
    "deezer": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h2v3H5v-3zm4-2h2v5H9v-5zm4-2h2v7h-2V12zm4-2h2v9h-2V10zm4 0h2v9h-2V10z"/></svg>',
    "tidal": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 16l4-4 4 4 4-4 4 4v2l-4-4-4 4-4-4-4 4v-2zM4 8l4-4 4 4 4-4 4 4v2l-4-4-4 4-4-4-4 4V8z"/></svg>',
    "lastfm": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 17l-3-5h14l-3 5H8zm1.5-7L5 4h14l-4.5 6h-5z"/></svg>',
    "soundcloud": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18H6.5a3.5 3.5 0 1 1 0-7c.3 0 .6 0 .9.1A4.5 4.5 0 0 1 20.5 11 4 4 0 0 1 17 18h-1.2a3 3 0 0 0-4.8 0z"/></svg>',
    "youtube-music": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l5.5-3.5L10 8.5z" fill="var(--bg-elevated,#111)"/></svg>',
    "bandcamp": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l6-12h10l-6 12H4z"/></svg>',
    "amazon-music": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 18.5c-3.5 0-6.5-1.2-6.5-2.8 0-1.2 2.2-2.3 5.2-2.5v1.2c-2 .2-3.5.9-3.5 1.6s1.8 1.4 4.8 1.4 4.8-.6 4.8-1.4-1.5-1.4-3.5-1.6v-1.2c3 .2 5.2 1.3 5.2 2.5 0 1.6-3 2.8-6.5 2.8zM7 8h10l-1 2H8L7 8z"/></svg>',
    "official-store": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8l2-4h12l2 4v12H4V8z"/><path d="M9 12a3 3 0 1 0 6 0"/></svg>',
    "genius": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l7 4v12l-7 4-7-4V6l7-4zm0 3.5L7.5 8.5V16L12 18.5 16.5 16V8.5L12 5.5z"/></svg>',
    "allmusic": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h12v2H6V4zm0 5h12v2H6V9zm0 5h8v2H6v-2zm0 5h12v2H6v-2z"/></svg>',
}

ALIASES = {
    "twitter": "x",
    "azlyrics": "genius",
    "musixmatch": "genius",
    "muzikum": "genius",
    "imdb": "allmusic",
    "rateyourmusic": "discogs",
    "secondhandsongs": "musicbrainz",
    "setlistfm": "musicbrainz",
    "songkick": "official-store",
    "viaf": "wikipedia",
    "wikidata": "musicbrainz",
    "worldcat": "wikipedia",
    "rutracker": "link",
    "thepiratebay": "link",
    "tiktok": "instagram",
    "tumblr": "x",
}


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    written: set[str] = set()
    for name, svg in ICONS.items():
        (ROOT / f"{name}.svg").write_text(svg, encoding="utf-8")
        written.add(name)
    for alias, src in ALIASES.items():
        if alias in written:
            continue
        (ROOT / f"{alias}.svg").write_text(ICONS[src], encoding="utf-8")
        written.add(alias)
    print(f"wrote {len(written)} icons to {ROOT}")


if __name__ == "__main__":
    main()
