"""IGDB helpers for Games — platform-aware match + cover selection."""
from __future__ import annotations

from app.franchise_index import GAME_PLATFORMS, normalize_franchise_slug
from app.services.igdb import get_game as igdb_get_game, search_games

# Our folder platform → IGDB platform.name aliases (casefold match / substring).
_IGDB_PLATFORM_ALIASES: dict[str, tuple[str, ...]] = {
    "Amiga": ("amiga",),
    "Arcade": ("arcade",),
    "Browser": ("web browser", "browser", "html5", "web"),
    "Commodore 64": ("commodore c64/128", "commodore 64", "c64"),
    "Flash": ("flash", "web browser", "browser"),
    "Game Boy": ("game boy",),
    "Game Boy Advance": ("game boy advance", "gba"),
    "Game Boy Color": ("game boy color", "gbc"),
    "Mac": ("mac", "mac os", "macos"),
    "Nintendo 3DS": ("nintendo 3ds", "new nintendo 3ds", "3ds"),
    "Nintendo 64": ("nintendo 64", "n64"),
    "Nintendo DS": ("nintendo ds", "nintendo dsi"),
    "Nintendo Entertainment System": (
        "nintendo entertainment system",
        "nes",
        "famicom",
    ),
    "Nintendo Switch": ("nintendo switch",),
    "Nintendo Wii": ("wii",),
    "Nintendo Wii U": ("wii u",),
    "PC": (
        "pc (microsoft windows)",
        "pc",
        "steamvr",
        "windows",
        "linux",
    ),
    "PlayStation": ("playstation", "playstation 1", "ps1", "psx"),
    "PlayStation 2": ("playstation 2", "ps2"),
    "PlayStation 3": ("playstation 3", "ps3"),
    "PlayStation 4": ("playstation 4", "ps4"),
    "PlayStation 5": ("playstation 5", "ps5"),
    "PlayStation Portable": ("playstation portable", "psp"),
    "PlayStation Vita": ("playstation vita", "ps vita", "psvita"),
    "Sega 32X": ("sega 32x", "32x"),
    "Sega CD": ("sega cd", "mega-cd"),
    "Sega Dreamcast": ("dreamcast",),
    "Sega Genesis": ("sega mega drive/genesis", "genesis", "mega drive"),
    "Sega Master System": ("sega master system", "master system"),
    "Sega Saturn": ("sega saturn", "saturn"),
    "Super Nintendo": (
        "super nintendo entertainment system",
        "snes",
        "super famicom",
    ),
    "Xbox": ("xbox",),
    "Xbox 360": ("xbox 360",),
    "Xbox One": ("xbox one",),
    "Xbox Series": ("xbox series x|s", "xbox series x", "xbox series s"),
}


def igdb_aliases_for_platform(platform: str | None) -> set[str]:
    name = (platform or "").strip()
    if not name:
        return set()
    canon = next(
        (p for p in GAME_PLATFORMS if p.casefold() == name.casefold()),
        name,
    )
    aliases = _IGDB_PLATFORM_ALIASES.get(canon) or (canon.casefold(),)
    return {a.casefold() for a in aliases if a}


def igdb_platforms_match(platform: str | None, igdb_platforms: list | None) -> bool:
    aliases = igdb_aliases_for_platform(platform)
    if not aliases:
        return False
    names = [
        str(p).strip().casefold()
        for p in (igdb_platforms or [])
        if str(p).strip()
    ]
    if not names:
        return False
    for alias in aliases:
        for n in names:
            if n == alias or alias in n or n in alias:
                return True
    return False


def _title_key(value: str | None) -> str:
    return normalize_franchise_slug(value or "") or (value or "").casefold()


def score_igdb_hit(
    hit: dict,
    *,
    title: str | None,
    platform: str | None,
) -> tuple[int, int, str]:
    """Higher score is better. Tie-break: shorter name, then provider id."""
    want = _title_key(title)
    got = _title_key(hit.get("name") or hit.get("title"))
    score = 0
    if want and got == want:
        score += 100
    elif want and got and (want in got or got in want):
        score += 40
    if platform and igdb_platforms_match(platform, hit.get("platforms") or []):
        score += 80
    elif platform:
        score -= 10  # prefer not picking an obvious wrong-platform port
    name = str(hit.get("name") or "")
    return (score, -len(name), str(hit.get("provider_id") or ""))


def pick_best_igdb_hit(
    hits: list[dict],
    *,
    title: str | None = None,
    platform: str | None = None,
) -> dict | None:
    if not hits:
        return None
    ranked = sorted(
        hits,
        key=lambda h: score_igdb_hit(h, title=title, platform=platform),
        reverse=True,
    )
    best = ranked[0]
    # If we have a platform and the best score has no platform bonus, still
    # return it as the default fallback cover/metadata source.
    return best


async def resolve_igdb_game_for_platform(
    *,
    title: str,
    platform: str | None = None,
    provider_id: str | None = None,
    limit: int = 12,
) -> dict | None:
    """
    Prefer an IGDB game that lists ``platform``; fall back to provider_id /
    best title match (default cover).
    """
    hits: list[dict] = []
    pid = str(provider_id or "").strip()
    if pid:
        try:
            game = await igdb_get_game(pid)
            if game:
                hits.append(game)
        except Exception:
            pass
    q = (title or "").strip()
    if q:
        try:
            searched = await search_games(q, limit=limit)
            for h in searched:
                hid = str(h.get("provider_id") or "")
                if hid and not any(
                    str(x.get("provider_id") or "") == hid for x in hits
                ):
                    hits.append(h)
        except Exception:
            pass
    if not hits:
        return None
    return pick_best_igdb_hit(hits, title=title, platform=platform)


async def resolve_cover_for_platform(
    *,
    title: str,
    platform: str | None,
    provider_id: str | None = None,
    fallback_url: str | None = None,
) -> str | None:
    """Cover URL for ``platform`` when IGDB has one; else ``fallback_url``."""
    hit = await resolve_igdb_game_for_platform(
        title=title,
        platform=platform,
        provider_id=provider_id,
    )
    if hit and igdb_platforms_match(platform, hit.get("platforms") or []):
        url = (hit.get("cover_url") or "").strip()
        if url:
            return url
    # No platform-specific art — keep caller fallback (default cover).
    if fallback_url:
        return fallback_url
    return (hit.get("cover_url") if hit else None) or None
