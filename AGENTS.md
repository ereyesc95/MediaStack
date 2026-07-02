# MediaStack — agent continuation guide

Use this file when resuming work on **media library layout**, **cross-module linking**, or **non-music modules**.

## Source of truth

| Document | Purpose |
|----------|---------|
| [docs/media_library_layout.md](docs/media_library_layout.md) | Canonical on-disk paths (Music, Movies, Series, Books, Games) |
| [docs/franchise_index.md](docs/franchise_index.md) | Franchise slug contract, index schema, API/UI phases, decisions log |
| [README.md](README.md) | Music-focused user docs + links to layout docs |

## Test media root

User test library (gitignored):

```
MEDIASTACK_MEDIA_ROOT=C:\Users\reyedu01\AI Projects\MediaStack\Media
```

Contains HIM + Various Artists music, letter-tier Movies/Series/Books/Games scaffolding.

## Architecture summary

- **Music** is artist-centric: `Music/{Letter}/{Artist}/Audio|Video|Library|Gallery/`
- **Movies / Series / Books / Games** use franchise/work folder names as the cross-module key
- **Default linking:** same `{Franchise}` folder name across modules → **Related media** (no portal farms)
- **Exceptions:** `.path` sidecars (NAS), symlinks, or future `franchise_overrides.json` for biopics, collisions, subseries filters
- **Music ≠ movie franchise** (e.g. HIM vs *Elvis* biopic): needs subject/DB links, not folder name alone

## Implementation status (2026-07)

| Area | Status |
|------|--------|
| Music Audio | Done |
| Music Video/Library tabs | Category scan only; no `.path`/symlink resolution |
| `backend/app/franchise_index.py` | **Phase 1 done:** `build_franchise_index()`, save/load cache, `related_for_path()` |
| Franchise API | **Not started** — need `GET /api/media/related?path=…` + sync hook |
| Related media UI | **Not started** |
| Series folder sync | Still expects flat `Series/{Show}/` — **must update** for `Series/{Letter}/{Franchise}/` |
| Movies/Series/Books/Games UI | API stubs only |

## Next work (in order)

1. **Wire franchise index to sync**
   - Add `POST /api/sync/franchise-index?force=true` (or hook into existing folder sync)
   - Call `build_franchise_index(media_root)` → `save_franchise_index()`
   - Invalidate/rebuild when media root mtime changes

2. **Related media API**
   - `GET /api/media/related?path=…` using `load_franchise_index()` + `related_for_path()`
   - Optional: `GET /api/media/franchise/{slug}/related`
   - Enrich response with cover URLs when module scanners exist

3. **UI panel**
   - "Related media" on Series/Movie/Book/Game pages (when built)
   - Optional on Music artist when franchise/subject links exist

4. **Scanner alignment**
   - Video/Library: resolve `.path`/symlinks via `resolve_media_entry()` in `media_paths_util.py`
   - Series sync: walk `Series/{Letter}/{Franchise}/`
   - Export category constants from `franchise_index.py` (`MUSIC_VIDEO_CATEGORIES`, `MUSIC_LIBRARY_CATEGORIES`, `GAME_PLATFORMS`) into scanners

5. **Phase 5**
   - `data/franchise_aliases.json`, `data/franchise_overrides.json`
   - Biopic/subject relations in DB

## Key code files

| File | Role |
|------|------|
| `backend/app/franchise_index.py` | Index builder, slug normalization, related lookup |
| `backend/app/media_tabs_index.py` | Music Video/Library category scan |
| `backend/app/media_paths_util.py` | `resolve_media_entry()` — symlinks, `.path`, `.lnk` |
| `backend/app/media_index.py` | Music audio index |
| `backend/app/services/sync_folders.py` | Band/Series folder sync (Series letter tier TBD) |

## Conventions (do not change without updating docs)

- **Letter tier:** first letter of grouping title (`P/` = Poison Arrow, not a misc bucket)
- **Games letter:** first letter of game title (or franchise when using 4 tiers)
- **Books letter:** work title letter
- **Date folders:** `{YYYY.MM.DD}. {Title}` or `{YYYY}. {Title}`
- **Special chars:** `█` → `'`, `■` → `,` (same as band paths)
- **Franchise slug:** casefold + whitespace normalize; aliases off by default

## Quick dev commands

```powershell
# Rebuild franchise index manually (Python REPL — no CLI yet; run from backend/)
cd backend
python -c "from pathlib import Path; from app.config import settings; from app.franchise_index import build_franchise_index, save_franchise_index; p=save_franchise_index(build_franchise_index(Path(settings.media_root))); print(p)"
```
