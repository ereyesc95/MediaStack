# Media library layout

Canonical on-disk layout for MediaStack. All paths are relative to **media root** (`MEDIASTACK_MEDIA_ROOT`).

**Related:** [Franchise index design](./franchise_index.md) — how cross-module “Related media” is discovered without manual portal files.

---

## Top-level modules

```
Media/
├── Music/{Letter}/{Artist}/       ← artist-centric (bands, composers, VA)
├── Movies/{Letter}/{Work}/        ← film franchises & standalone films
├── Series/{Letter}/{Franchise}/   ← TV / franchise hub (optional subseries)
├── Books/{Letter}/{Work}/         ← publications (manga volumes, editions)
└── Games/{Platform}/{Letter}/{Franchise}/   ← platform-first, then franchise
```

| Tier | Rule |
|------|------|
| **`{Letter}`** | First letter of the **grouping title** (artist, work, franchise, or game title). Use `#` for non-alpha. |
| **Item folders** | `{YYYY.MM.DD}. {Title}` or `{YYYY}. {Title}`; bracket tags optional. |
| **Filenames** | Flexible — numeric prefix (`01.`), date prefix, vinyl side (`A1.`), or title as filename (same rules as Audio). |
| **`[Artwork]/`** | Inside each **item** folder (release edition, film, episode batch, book volume, game). Not beside `Seasons/` or at letter tier. |
| **Categories** | Subfolders under `Video/` and `Library/` (Music only). **Omit** a category folder if unused — the app hides that sub-tab. |

---

## Music — `Music/{Letter}/{Artist}/`

### Audio

Unchanged from README — categories under `Audio/`:

`Albums`, `Extended Plays`, `Compilations`, `Soundtracks`, `Live Albums`, `Singles`

Portals: compilation `.lnk` / `.path` / symlinks (resolved via `resolve_media_entry()` in `media_paths_util.py`).

### Video — Pattern A (category → item)

Categories sorted **A–Z** (only folders that exist are shown):

| Category | Content |
|----------|---------|
| **Documentaries** | Artist-focused documentaries (local files) |
| **Interviews** | Interview recordings |
| **Live** | Concerts, TV performances, streams (merged former “Concerts”) |
| **Movies** | Optional local items; **related films** also via franchise index |
| **Music Videos** | Official / promo MVs |
| **Promo Material** | EPKs, promos, TV spots |
| **Series** | Optional local items; **related series** also via franchise index |

```
Music/H/HIM/Video/
├── Documentaries/2010. Heartache and Ghosts/
│   ├── [Artwork]/Cover - Front.jpg
│   └── 01. Opening.mkv
├── Interviews/2010.01.10. Interview with HIM by Loudwire/
│   └── 01. Loudwire interview.mp4
├── Live/2014.02.14. Live at Studio/
│   └── A1. Intro.mkv
├── Music Videos/1998.02.03. Wicked Game/
│   └── 1998.02.03. Wicked Game [Official].mp4
└── Promo Material/2005.09.23. Dark Light Promo/
    └── 01. EPK segment 1.mp4
```

Do **not** rely on fixed names like `video.mp4`.

### Library — Pattern A (category → item)

Categories sorted **A–Z** (only folders that exist are shown):

| Category | Content |
|----------|---------|
| **Articles** | Clippings, saved web articles |
| **Books** | Ephemera; **catalog** lives in `Books/` module (franchise index links both) |
| **Interviews** | Transcripts, text interviews |
| **Magazines** | Feature scans (non-catalog) |
| **Reviews** | Press reviews |
| **Scans** | Tickets, passes, flyers |

```
Music/H/HIM/Library/
├── Articles/2007.03. Kerrang feature/
│   └── 2007.03.15. Kerrang - HIM article.pdf
├── Interviews/2010.01.10. Loudwire transcript/
│   └── 01. Transcript.pdf
└── Scans/2005. Summer tour pass/
    └── pass front.jpg
```

### Gallery

`Gallery/Photos/`, `Gallery/Logos/`, `Gallery/Covers/` — see README.

---

## Movies — `Movies/{Letter}/{Work}/{date}. {Film Title}/`

Middle folder **`{Work}`** groups sequels (movie “franchise”) or equals the film name for standalones.

```
Movies/M/Mission Impossible/
├── 1996.05.22. Mission Impossible/
│   ├── [Artwork]/…
│   └── 1996.05.22. Mission Impossible.mkv
├── 2000.05.24. Mission Impossible II/
└── 2023.07.12. Mission Impossible - Dead Reckoning Part One/

Movies/P/Poison Arrow/
└── 2000.01.01. Poison Arrow/
    ├── [Artwork]/…
    └── 2000.01.01. Poison Arrow.mkv
```

**Related media** (Audio soundtracks, Series tie-ins, Books novelizations, Games) is discovered via **franchise index** — no requirement for `Audio/`, `Series/`, or `Books/` subfolders on disk unless used as optional overrides.

---

## Series — `Series/{Letter}/{Franchise}/…`

### Multi-subseries franchise

```
Series/D/Dragon Ball/
├── [Artwork]/
├── 1986.02.26. Dragon Ball/
│   ├── [Artwork]/
│   ├── Seasons/Season 01/01. ….mkv
│   ├── Specials/…
│   └── (related Movies/Books/Games via franchise index)
└── 1989.04.26. Dragon Ball Z/
    ├── Seasons/Season 01/…
    └── Specials/…
```

Use **`Seasons/Season NN/`** consistently (avoid duplicate flat `Season 01/` at show root).

### Single show / one season / miniseries

No `{date}. Subseries/` tier — seasons live directly under the show folder:

```
Series/T/Twin Peaks/
├── [Artwork]/
├── Seasons/
│   ├── Season 01/01. Pilot.mkv
│   └── Season 02/…
└── Specials/…
```

Films tied to the show (e.g. *Fire Walk With Me*) are canonical under **`Movies/{Letter}/{Work}/…`** with the same **`{Work}`** franchise name; the franchise index links them.

---

## Books — `Books/{Letter}/{Work Title}/{date}. {Volume or Edition}/`

```
Books/D/Dragon Ball/
├── 1985.12.03. Vol. 01/
│   ├── [Artwork]/…
│   └── 01. Chapter 1.cbz
└── 2022.01.01. Vol. 1-3 Omnibus/

Books/H/HIM - Heartache and Ghosts/
├── 2010. Heartache and Ghosts/
│   └── book.pdf
└── 2014.02.14. Remastered Edition/
    └── book.pdf
```

Magazine issues as catalog entries:

```
Books/K/Kerrang/2007.03.15. Issue 1234/
```

---

## Games — `Games/{Platform}/{Letter}/{Franchise}/{date}. {Game Title}/`

Platform-first browsing; **`{Letter}`** = first letter of **game title** (or franchise when using four tiers).

```
Games/PlayStation 2/D/Dragon Ball/2002.11.10. Dragon Ball Z Budokai/
├── [Artwork]/Cover.jpg
└── 2002.11.10. Dragon Ball Z Budokai.iso

Games/Nintendo Entertainment System/S/Super Mario/1985.09.13. Super Mario Bros/
└── 1985.09.13. Super Mario Bros.nes
```

**One-off games** (no meaningful franchise tier) — three-tier exception:

```
Games/PC/P/Poison Arrow/2000.01.01. Poison Arrow/
```

### Platform folder names (vocabulary)

Use consistent display names:

- **Nintendo:** Nintendo Entertainment System, Super Nintendo, Nintendo 64, Game Boy, Game Boy Color, Game Boy Advance, Nintendo DS, Nintendo 3DS, Nintendo Wii, Nintendo Wii U, Nintendo Switch
- **Sega:** Sega Master System, Sega Genesis, Sega CD, Sega 32X, Sega Saturn, Sega Dreamcast
- **Sony:** PlayStation, PlayStation 2, PlayStation 3, PlayStation 4, PlayStation 5, PlayStation Portable, PlayStation Vita
- **Microsoft:** Xbox, Xbox 360, Xbox One, Xbox Series
- **Other:** PC, Mac, Arcade, Flash, Browser, Amiga, Commodore 64

---

## Cross-module linking

### Default: franchise index (automatic)

When `{Work}` / `{Franchise}` folder names match across modules (after normalization), the app shows **Related media** without `.lnk` / `.path` portal farms.

Example: `Dragon Ball` under `Series/D/`, `Movies/D/`, `Books/D/`, and `Games/*/D/Dragon Ball/`.

See [franchise_index.md](./franchise_index.md).

### Optional: manual portals

Use **`.path`** sidecars (preferred on NAS/Linux) or **symlinks** when:

- Franchise names differ but content is related
- Biopics (`Music/H/HIM` ↔ `Movies/E/Elvis`) — use **subject** rules or overrides, not folder name alone
- Subseries-specific film subsets need explicit curation

`.path` file body = relative path from media root, e.g.:

```
Movies/R/2019.05.22. Rocketman/
```

Windows **`.lnk`** is supported for Audio today; prefer `.path` for cross-module links on NAS.

---

## App implementation status (layout vs code)

| Area | Scanner / UI status |
|------|---------------------|
| Music Audio | Implemented |
| Music Video / Library tabs | Category grid; **directories only** (no `.path` yet) |
| Franchise index | **Phase 1** — `build_franchise_index()` scans disk; cache at `data/franchise_index/index.json`; API/UI pending |
| Movies / Series / Books / Games modules | API stubs; layout spec ahead of UI |
| Series folder sync | Expects flat `Series/{Show}/` today — **needs update** for `Series/{Letter}/` |

---

## Naming discipline checklist

1. One **canonical spelling** per franchise (`Dragon Ball`, not mixed `DBZ` / `Dragonball` in the franchise tier).
2. Register **aliases** in DB or `data/franchise_aliases.json` when needed (future).
3. Disambiguate collisions in folder names: `Heat (1995)` vs `Heat (2013)`.
4. **Music** uses **artist** names; link to films via subject/metadata, not artist folder name.
5. Omit empty Video/Library categories — do not create placeholder folders.
