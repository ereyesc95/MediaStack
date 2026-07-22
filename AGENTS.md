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
| Music Video/Library tabs | Done (`.lnk` / `.path` resolved; Play/Read card actions) |
| `backend/app/franchise_index.py` | **Phase 1–2:** scan/save/load + `GET /api/media/related` |
| `backend/app/routers/media.py` | Related media API |
| `backend/app/routers/sync.py` | `POST /api/sync/franchise-index` |
| Related media UI | **Not started** (needed for Series v1) |
| Series folder sync | Letter-tier `Series/{Letter}/{Franchise}/` (+ legacy flat) |
| Layout docs | Updated: dated seasons, nested films, no `[Extras]` / portal farms |
| Series module UI | Catalog → franchise/subseries → seasons → episodes (new tab); Gallery + Related |
| Movies/Books/Games UI | Placeholders |

## Series module files

| File | Role |
|------|------|
| `backend/app/series_index.py` | Catalog + franchise/folder detail + gallery scan |
| `backend/app/routers/series.py` | `/catalog`, `/franchises/{id}`, `/folder`, `/gallery` |
| `frontend/src/components/series/SeriesModule.tsx` | Catalog shell |
| `frontend/src/components/series/SeriesFranchisePage.tsx` | Overview / Gallery / Related |

## Layout rules (locked 2026-07)

- **Seasons:** `{YYYY.MM.DD}. Season N/` under show/subseries (no `Seasons/` wrapper)
- **Movies:** always `{Work}/{date}. {Film}/` — never leave the feature file at work root
- **Cross-media:** franchise index Related panel only — no nested `Audio/Series/Books/Games/[Extras]` under Movies/Series
- **Golden path fixture:** `Series/D/Dragon Ball/` (+ Movies/Books/Games scaffolding)

## Next work (in order)

1. **Series polish** — URL routes, cover enrichment on Related entries, TMDb metadata later
2. Enrich related API with cover URLs when Series/Movies scanners exist
3. Hook franchise-index rebuild into media scan pipeline
4. **Phase 5** — aliases/overrides; biopic/subject DB links
5. Movies / Books / Games modules (same patterns)

## Key code files

| File | Role |
|------|------|
| `backend/app/franchise_index.py` | Index builder, slug normalization, related lookup |
| `backend/app/media_tabs_index.py` | Music Video/Library category scan |
| `backend/app/media_paths_util.py` | `resolve_media_entry()` — symlinks, `.path`, `.lnk` |
| `backend/app/media_index.py` | Music audio index |
| `backend/app/services/sync_folders.py` | Band/Series folder sync (letter-tier Series) |

## Conventions (do not change without updating docs)

- **Letter tier:** first letter of grouping title (`H/` = HIM, not a misc bucket)
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
