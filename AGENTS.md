# MyStack — agent continuation guide

Use this file when resuming work on **media library layout**, **cross-module linking**, **franchise artwork home**, or **non-music modules**.

After a Cursor workspace rename (folder `MediaStack` → `MyStack`), start here + [AGENT_HANDOFF.txt](AGENT_HANDOFF.txt). Prefer repo docs over chat memory.

## Repo / machine

| Item | Value |
|------|--------|
| Product name | **MyStack** |
| Local folder (expected) | `C:\Users\reyedu01\AI Projects\MyStack` |
| GitHub remote | `https://github.com/ereyesc95/MyStack.git` |
| Default branch | **`master` only** (other remote branches pruned) |
| API port | `8766` |
| Vite port | `5174` (proxies `/api`) |

If the disk folder is still named `MediaStack`, close Cursor and run  
`C:\Users\reyedu01\AI Projects\rename-MediaStack-to-MyStack.ps1`, then open `MyStack`.

## Source of truth

| Document | Purpose |
|----------|---------|
| [docs/media_library_layout.md](docs/media_library_layout.md) | Canonical on-disk paths (Music, Movies, Series, Books, Games) |
| [docs/franchise_index.md](docs/franchise_index.md) | Franchise slug contract, index schema, API/UI phases, decisions log |
| [AGENT_HANDOFF.txt](AGENT_HANDOFF.txt) | Full setup, pitfalls, recent session contracts |
| [README.md](README.md) | Music-focused user docs + links to layout docs |
| `backend/app/artwork_stems.py` | Music artwork stem names (wins over README if conflict) |

## Test media root

User test library (gitignored):

```
MYSTACK_MEDIA_ROOT=C:\Users\reyedu01\AI Projects\MyStack\Media
```

Also set in root `.env` and `set-env.ps1` (gitignored secrets — never commit).  
Contains HIM + Various Artists music, letter-tier Movies/Series/Books/Games scaffolding.

## Architecture summary

- **Music** is artist-centric: `Music/{Letter}/{Artist}/Audio|Video|Library|Gallery/`
- **Movies / Series / Books / Games** use franchise/work folder names as the cross-module key
- **Default linking:** same `{Franchise}` folder name across modules → **Related media** (no portal farms)
- **Exceptions:** `.path` sidecars (NAS), symlinks, or DB franchise aliases/overrides (Setup)
- **Music ≠ movie franchise** (e.g. HIM vs *Elvis* biopic): needs subject/DB links, not folder name alone
- **Soundtrack-bridge:** matching Music artist can appear on franchise **MUSIC** tab / Related (distinct from leaf `[Audio]` embeds)
- **Shared franchise UI:** `frontend/src/components/series/*` powers Series + Movies + Books + Games franchise/leaf chrome

## Franchise artwork home (locked 2026-11)

Visual home for franchise About (left panel, background, logos):

1. **Explicit** franchise home (AppSetting / Manage Catalog) wins.
2. Else first module with franchise-level **`[Artwork]`** in order:  
   **Music → Series → Movies → Books → Games**.
3. **`Gallery/Covers` never decides home** — only a cover-resolution fallback after `[Artwork]`.
4. Cover search order: **`[Artwork]` first**, then `Gallery/Covers`, then bare `Gallery/`.

### Games home `[Artwork]` (Games-only)

When franchise home is **Games**, exactly **one** folder:

`Games/{Platform}/{Letter}/{Franchise}/[Artwork]/`

- Platform = that of the **earliest dated game leaf** (folder date `YYYY.…` / `YYYY.MM.DD.…` only).
- Tie-break: **title**, then **platform**.
- Manage Catalog create / ROM organize: **create / move / replace** so only that one remains.
- Example: earliest leaf `Games/NES/S/Super Mario/1983…. Mario Bros/` → art at  
  `Games/NES/S/Super Mario/[Artwork]/`  
  (not inside the dated leaf; not duplicated under every platform).

Code: `backend/app/games_franchise_artwork.py`, `franchise_identity.py`.

### Browser ≠ Flash

`Browser` and `Flash` are independent platforms. IGDB `Web browser` → Browser only; never scaffold both from shared aliases.  
(`games_igdb.py`, Manage Catalog `canonicalizePlatform`, `catalog_import._canonicalize_igdb_platforms`)

## Catalog UX contracts (2026-11)

- **Films letter tabs:** A–Z from **film title** (`films_letters` / title letter), not franchise work letter. Franchises view still uses work letter.
- **Leaf tabs (movie/series/book/game):** hide **AUDIO** / **GAMES** (and similar) when empty after media scan — do not show empty “No … yet” tabs from franchise-level `related.*` alone.
- **NSFW admin:** password `mystack` → admin, NSFW locked; `mystacknsfw` → admin + NSFW unlocked.  
  **Manage Catalog** may search/add adult titles on either; **catalog browse** hides adult-genre items until NSFW unlock.

## Implementation status (2026-11)

| Area | Status |
|------|--------|
| Music Audio / Video / Library / Tours | Done |
| Physical Collection (list/cover/banner/shelf) | Done |
| Listening streaks + Wrapped | Done |
| Series / Movies / Books | Done (franchise + leaf, cast, related, quiz) |
| Games module UI | Done (shared series chrome + quiz + IGDB import) |
| Universes | Done |
| Human-readable URL slugs | Done |
| Staff roles / per-film genres | Done |
| Franchise index Phase 1–5 | Done (aliases/overrides + admin) |
| Soundtrack-bridge / franchise MUSIC | Done |
| Files module | Done |
| Hobbies module | Done |
| Franchise artwork home + Games earliest `[Artwork]` | Done (2026-11) |
| Admin Setup (library, API creds, profiles, play-videos locally) | Done |

## Layout rules (locked 2026-07+)

- **Seasons:** `{YYYY.MM.DD}. Season N/` under show/subseries (prefer current layout doc; `Episodes/` wrapper where documented)
- **Movies:** always `{Work}/{date}. {Film}/` — never leave the feature file at work root
- **Games:** `Games/{Platform}/{Letter}/{Franchise}/{date}. {Game}/`
- **Cross-media:** franchise index Related — no nested portal farms
- **Series audio:** `…/[Audio]/{Albums|…}/` with `.lnk` → Music
- **Golden path:** `Series/D/Dragon Ball/` (+ Movies/Books/Games scaffolding)

## Key code files

| File | Role |
|------|------|
| `backend/app/franchise_index.py` | Index builder, slug, related lookup |
| `backend/app/franchise_identity.py` | Artwork home, music identity, catalog enrich |
| `backend/app/games_franchise_artwork.py` | Games earliest-platform `[Artwork]` ensure/move |
| `backend/app/catalog_import.py` | Manage Catalog create/search (TMDb/IGDB/Books) |
| `backend/app/catalog_paging.py` | Letter paging; `films_letters` for Films scope |
| `backend/app/media_paths_util.py` | `resolve_media_entry()` — symlinks, `.path`, `.lnk` |
| `frontend/src/components/series/*` | Shared franchise/leaf UI |
| `frontend/src/franchiseHome.ts` | Cross-module entry referrer / tab order |
| `frontend/src/routeSlug.ts` / `routeResolve.ts` / `*Route.ts` | URL helpers |

## Conventions (do not change without updating docs)

- **Letter tier:** first letter of grouping title (`H/` = HIM)
- **Games letter:** first letter of game title (or franchise when using 4 tiers)
- **Books letter:** work title letter
- **Films catalog letter:** film **title** first letter
- **Date folders:** `{YYYY.MM.DD}. {Title}` or `{YYYY}. {Title}`
- **Special chars:** `█` → `'`, `■` → `,`
- **Franchise slug:** casefold + whitespace normalize; aliases off by default

## Next work (in order)

1. Opportunistic UX polish as issues surface in day-to-day use
2. Optional later: deeper Files nesting, drag-drop upload, larger Wrapped history backfill

## Quick dev commands

```powershell
# From repo root (after rename: ...\MyStack)
python run.py
# Other terminal:
cd frontend; npm run dev

# Rebuild franchise index (from backend/)
cd backend
python -c "from pathlib import Path; from app.config import settings; from app.franchise_index import build_franchise_index, save_franchise_index; p=save_franchise_index(build_franchise_index(Path(settings.media_root))); print(p)"
```
