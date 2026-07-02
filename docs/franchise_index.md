# Franchise index — design

Cross-module **Related media** for Movies, Series, Books, Games, and (where applicable) Music soundtracks — **without** requiring manual `.lnk` / `.path` files for every link.

**Layout spec:** [media_library_layout.md](./media_library_layout.md)

**Implementation:** `backend/app/franchise_index.py` — Phase 1 scan/save/load done; API and UI pending (see [Implementation phases](#implementation-phases))

---

## Goals

1. **User:** add content once in the canonical module; related items appear on franchise/show/film/game pages automatically.
2. **Disk:** no redundant `Movies/` / `Audio/` / `Books/` portal folders inside every Series or Movie folder.
3. **NAS:** avoid hundreds of symlinks; optional `.path` only for exceptions.
4. **App:** one index built at scan time; UI reads a single **Related media** payload.

---

## Core contract: franchise slug

All entries that share the same **work/franchise folder name** (middle tier) belong to one franchise group:

| Module | Path pattern | Franchise tier |
|--------|--------------|------------------|
| Movies | `Movies/{L}/{Franchise}/{date}. {Film}/` | `{Franchise}` |
| Series | `Series/{L}/{Franchise}/[{date}. {Subseries}/]` | `{Franchise}` |
| Books | `Books/{L}/{Franchise}/{date}. {Vol}/` | `{Franchise}` |
| Games | `Games/{Platform}/{L}/{Franchise}/{date}. {Game}/` | `{Franchise}` |

**Normalization** → `slug`:

1. Trim whitespace
2. Casefold
3. Replace `█` → `'`, `■` → `,` (match band path rules)
4. Collapse repeated spaces
5. Optional: strip leading articles (`The `) — **off by default**; use alias table instead

Example: `Dragon Ball` → `dragon ball`

**Requirement:** the same display name must be used across modules for auto-discovery to work.

---

## Index schema

Cached at `data/franchise_index/index.json` (versioned; rebuild on media mtime or `force=true`).

```json
{
  "index_version": 1,
  "scanned_at": "2026-07-02T…",
  "franchises": {
    "dragon ball": {
      "display_name": "Dragon Ball",
      "letter": "D",
      "entries": [
        {
          "kind": "series",
          "path": "Series/D/Dragon Ball/1989.04.26. Dragon Ball Z/",
          "subseries": "Dragon Ball Z",
          "date_iso": "1989-04-26"
        },
        {
          "kind": "movie",
          "path": "Movies/D/Dragon Ball/2018.12.14. Broly/",
          "title": "Broly",
          "date_iso": "2018-12-14"
        },
        {
          "kind": "book",
          "path": "Books/D/Dragon Ball/1985.12.03. Vol. 01/",
          "title": "Vol. 01"
        },
        {
          "kind": "game",
          "path": "Games/PlayStation 2/D/Dragon Ball/2002.11.10. Dragon Ball Z Budokai/",
          "platform": "PlayStation 2",
          "title": "Dragon Ball Z Budokai"
        }
      ]
    }
  },
  "overrides": [],
  "aliases": {}
}
```

### Entry kinds

| `kind` | Source path |
|--------|-------------|
| `movie` | `Movies/…` |
| `series` | `Series/…` (franchise root or subseries folder) |
| `book` | `Books/…` |
| `game` | `Games/…` |
| `music` | Optional: `Music/…/Audio/…` when franchise folder or tag matches (phase 2) |

Each entry stores **`path`** (relative to media root), **`title`** (parsed from folder name), optional **`date_iso`**, and kind-specific fields (`platform`, `subseries`).

---

## Scan algorithm

Implemented in `build_franchise_index()` (`backend/app/franchise_index.py`):

```
for each module root in (Movies, Series, Books, Games):
    walk letter tier(s)
    for each franchise folder F:
        slug = normalize(F.name)
        register franchise slug
        for each child item folder:
            append entry { kind, path, title, date_iso, … }

merge aliases (franchise_aliases.json / DB)   ← Phase 5
apply overrides (include/exclude edges)       ← Phase 5
write cache via save_franchise_index()
```

Helpers: `normalize_franchise_slug()`, `parse_dated_folder_name()`, `franchise_slug_for_path()`, `related_for_path()`.

**Games:** scan `Games/{Platform}/{Letter}/{Franchise}/…`; franchise key from `{Franchise}`, not platform.

**Series subseries:** `{date}. {Subseries}/` children are entries with `subseries` field; franchise slug still from parent `{Franchise}` folder.

**Deduplication:** one entry per resolved directory path; if `.path` points to same target, merge.

---

## UI: Related media API (planned)

```
GET /api/media/franchise/{slug}/related
GET /api/media/related?path=Series/D/Dragon%20Ball/1989.04.26.%20Dragon%20Ball%20Z/
```

Response groups by kind:

```json
{
  "franchise": { "slug": "dragon ball", "display_name": "Dragon Ball" },
  "from_path": "Series/D/Dragon Ball/1989.04.26. Dragon Ball Z/",
  "movies": [ { "id", "title", "path", "cover_url", "date_iso" } ],
  "books": [],
  "games": [],
  "series": [],
  "music": []
}
```

When viewing a **subseries** folder, default filter:

- **Include:** all entries with same franchise slug
- **Optional filter (phase 2):** bracket tag `[DBZ]`, date range, or `subseries` metadata to limit films

When viewing a **movie**, show sibling films in same `Movies/{L}/{Franchise}/` plus cross-module entries with same slug.

---

## What auto-discovery does **not** cover

| Case | Strategy |
|------|----------|
| **Music artist ≠ movie franchise** (HIM vs *Elvis* biopic) | DB relation, `[about Elvis]` tag, or manual override |
| **Composer OST** (Kageyama ↔ DB) | Music path + credit DB; or `Music/…/Dragon Ball/` franchise folder if used |
| **Name collision** (`Heat`) | Disambiguate in folder name or alias slug |
| **Various Artists** | No franchise slug; playlists / tags only |
| **Subseries-only films** | Tag `[DBZ]` on movie folder, override edge, or subseries filter rules |

---

## Overrides and aliases

### Aliases (`data/franchise_aliases.json` — future)

```json
{
  "dbz": "dragon ball",
  "dragonball": "dragon ball"
}
```

Optional **parent** link for sub-franchise film lines:

```json
{
  "dragon ball z": { "slug": "dragon ball z", "parent": "dragon ball" }
}
```

### Overrides (`data/franchise_overrides.json` — future)

```json
[
  {
    "type": "link",
    "from": "Music/H/HIM/Video/Movies/2022.06.24. Elvis/",
    "to": "Movies/E/Elvis/2022.06.24. Elvis/",
    "reason": "biopic subject"
  },
  {
    "type": "exclude",
    "from": "Series/D/Dragon Ball/1986.02.26. Dragon Ball/",
    "to": "Movies/D/Dragon Ball/2018.12.14. Broly/",
    "reason": "DBZ-era film not on original series page"
  }
]
```

Manual **`.path`** files remain valid; scanner resolves target and registers an override edge if slug differs.

---

## Music artist pages

| Content | Discovery |
|---------|-----------|
| Video categories (local) | `media_tabs_index.py` — existing category scan |
| Related **Movies** / **Series** for franchise artists | Franchise index when artist name ≠ franchise (usually N/A) |
| Biopics / tribute films | **Subject graph** (phase 2): link `band_id` ↔ movie `subject` or folder `[about …]` |
| Library ephemera | Local Library categories only |
| Library **Books** catalog | Franchise index on `Books/{L}/{Work}/` + optional artist alias |

**Music Video categories** `Movies` and `Series` can remain for local files; for franchise content, UI prefers **Related media** panel from index rather than portal folders.

---

## Implementation phases

### Phase 1 — Index builder (backend)

- [x] Implement `build_franchise_index()` in `franchise_index.py`
- [x] Parse paths for Movies, Series, Books, Games per layout doc
- [x] Write cache `data/franchise_index/index.json` (`save_franchise_index` / `load_franchise_index`)
- [x] `related_for_path()` + `franchise_slug_for_path()` helpers
- [ ] CLI or `POST /api/sync/franchise-index?force=true`
- [ ] Unit tests with fixture paths

### Phase 2 — API + cache invalidation

- [ ] `GET /api/media/related?path=…`
- [ ] Hook rebuild into folder sync / media scan pipeline
- [ ] Expose slug on series/movie/book/game overview payloads

### Phase 3 — UI

- [ ] **Related media** panel on Series, Movie, Book, Game pages (when modules exist)
- [ ] Optional panel on Music artist when franchise/subject links exist
- [ ] Subseries filter rules (tags / overrides)

### Phase 4 — Scanner alignment

- [ ] Video/Library tabs: resolve `.path`/symlinks via `resolve_media_entry()`
- [ ] Series folder sync: support `Series/{Letter}/{Franchise}/`
- [ ] Music Video/Library category names: Documentaries, Interviews, Live, Movies, Music Videos, Promo Material, Series / Articles, Books, Interviews, Magazines, Reviews, Scans

### Phase 5 — Aliases & overrides

- [ ] `franchise_aliases.json` loader
- [ ] `franchise_overrides.json` + admin UI (optional)
- [ ] Biopic / subject relations in DB

---

## Code references

| File | Role |
|------|------|
| `backend/app/franchise_index.py` | Index builder, slug normalization, related lookup |
| `docs/media_library_layout.md` | Canonical on-disk layout (all modules) |
| `AGENTS.md` | Agent continuation guide for media library work |
| `backend/app/media_tabs_index.py` | Music Video/Library category scan |
| `backend/app/media_paths_util.py` | `resolve_media_entry()` — symlinks, `.path`, `.lnk` |
| `backend/app/media_index.py` | Music audio index; `media_visibility_flags()` |
| `backend/app/services/sync_folders.py` | Band/Series folder sync (Series letter tier TBD) |

---

## Decisions log

| Date | Decision |
|------|----------|
| 2026-07 | **Default link:** franchise slug from shared `{Franchise}` folder name across modules |
| 2026-07 | **Portals:** optional exceptions only; `.path` preferred on NAS |
| 2026-07 | **Games path:** `Games/{Platform}/{L}/{Franchise}/{date}. {Title}/`; 3-tier OK for one-offs |
| 2026-07 | **Music Video cats:** Documentaries, Interviews, Live, Movies, Music Videos, Promo Material, Series |
| 2026-07 | **Music Library cats:** Articles, Books, Interviews, Magazines, Reviews, Scans |
| 2026-07 | **Movies grouping:** `Movies/{L}/{Work}/{date}. {Film}/` for sequels |
| 2026-07 | **Series:** `Series/{L}/{Franchise}/[{subseries}/]`; single-show skips subseries tier |
