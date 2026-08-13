# MyStack — agent continuation guide

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
MYSTACK_MEDIA_ROOT=C:\Users\reyedu01\AI Projects\MediaStack\Media
```

Contains HIM + Various Artists music, letter-tier Movies/Series/Books/Games scaffolding.

## Architecture summary

- **Music** is artist-centric: `Music/{Letter}/{Artist}/Audio|Video|Library|Gallery/`
- **Movies / Series / Books / Games** use franchise/work folder names as the cross-module key
- **Default linking:** same `{Franchise}` folder name across modules → **Related media** (no portal farms)
- **Exceptions:** `.path` sidecars (NAS), symlinks, or future `franchise_overrides.json` for biopics, collisions, subseries filters
- **Music ≠ movie franchise** (e.g. HIM vs *Elvis* biopic): needs subject/DB links, not folder name alone

## Implementation status (2026-08)

| Area | Status |
|------|--------|
| Music Audio / Video / Library | Done |
| Series / Movies / Books modules | Done (franchise + leaf pages, cast, related, NSFW) |
| Universes | Done (multi-module hubs + SFW filter) |
| Human-readable URL slugs | Done (dual-parse legacy + slug; see README) |
| Staff roles (Original / Dub / Hybrid) | Done (`staff_roles` + `/api/series/staff-roles`) |
| Per-film NSFW genres | Done (`movies_catalog_meta` leaf genres) |
| `backend/app/franchise_index.py` | Phase 1–2: scan/save/load + `GET /api/media/related` |
| Games module UI | Placeholders |

## Series / Movies / Books files

| File | Role |
|------|------|
| `backend/app/series_index.py` / `movies_index.py` / `books_index.py` | Catalog + leaf detail |
| `backend/app/staff_roles.py` | Canonical staff role seed + visibility types |
| `backend/app/adult_content.py` | NSFW card filtering |
| `frontend/src/routeSlug.ts` / `routeResolve.ts` / `franchiseRoute.ts` | Slug URL helpers |
| `frontend/src/*Route.ts` | Module path parse/build |
| `frontend/src/components/series/*` | Shared franchise/leaf UI (also used by Movies/Books) |

## Layout rules (locked 2026-07)

- **Seasons:** `{YYYY.MM.DD}. Season N/` under show/subseries (no `Seasons/` wrapper)
- **Movies:** always `{Work}/{date}. {Film}/` — never leave the feature file at work root
- **Cross-media:** franchise index Related panel for Movies/Books/Games — no nested portal farms
- **Series audio:** `…/[Audio]/{Albums|…}/` with `.lnk` shortcuts to Music releases (`[By Artist]` or Various Artists)
- **Golden path fixture:** `Series/D/Dragon Ball/` (+ Movies/Books/Games scaffolding)

## Next work (in order)

1. Pass display titles into more `push*Route` call sites so slug URLs appear immediately (not only after resolve)
2. Enrich related API with cover URLs; hook franchise-index rebuild into media scan
3. **Phase 5** — aliases/overrides; biopic/subject DB links
4. Games module UI (same franchise patterns)
5. Title-collision disambiguation for slug leaves (date/hash fallback)

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
