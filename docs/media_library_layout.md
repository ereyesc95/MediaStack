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
| **`[Artwork]`** | Inside franchise / subseries / item folders as needed (covers, posters, logos). Not at the letter tier. |
| **Categories** | Subfolders under `Video/` and `Library/` (**Music only**). Omit unused categories. |
| **`[Extras]`** | **Not used.** Cross-module media is never nested under Movies/Series/Books/Games. |

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

Optional: a `.lnk` / `.path` under Music Video may point at a Movies or Series work folder so the artist page can open that title. Prefer **Related media** (franchise index) when the franchise name already matches.

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

**Always nest each film** in its own `{date}. {Film Title}/` folder (even for single-film works). Do **not** leave the feature file loose under `{Work}/`.

```
Movies/M/Mission Impossible/
├── [Artwork]/…                    ← optional franchise-wide key art
├── 1996.05.22. Mission Impossible/
│   ├── [Artwork]/…
│   └── 1996.05.22. Mission Impossible.mkv
├── 2000.05.24. Mission Impossible II/
└── 2023.07.12. Mission Impossible - Dead Reckoning Part One/

Movies/H/HIM/
└── 2005.11.05. Poison Arrow/
    ├── [Artwork]/…
    └── 2005.11.05. Poison Arrow.mp4

Movies/A/Austin Powers/
├── [Artwork]/…
├── 1997.05.02. Austin Powers - International Man of Mystery/
│   ├── [Artwork]/…
│   └── 1997.05.02. ….mp4
└── 2002.07.26. Austin Powers in Goldmember/
    ├── [Artwork]/…
    └── 2002.07.26. ….mp4
```

**Related media** (soundtracks, series, books, games) is discovered via the **franchise index** when `{Work}` names match across modules. Do **not** create `Audio/`, `Series/`, `Books/`, `Games/`, or `[Extras]/` siblings under a movie folder.

---

## Series — `Series/{Letter}/{Franchise}/…`

### Season folders (required shape)

Seasons are **dated folders** directly under the show or subseries (no `Seasons/` wrapper):

```
{YYYY.MM.DD}. Season 1/
{YYYY.MM.DD}. Season 2/
Specials/                         ← optional undated specials bucket
```

Episode files live inside each season folder (numeric or date prefixes allowed).

### Multi-subseries franchise

Subseries folders are dated: `{YYYY.MM.DD}. {Subseries Title}/`.

```
Series/D/Dragon Ball/
├── [Artwork]/                              ← franchise-wide logos / key art
├── 1986.02.26. Dragon Ball/
│   ├── [Artwork]/
│   ├── 1986.02.26. Season 1/
│   │   └── 01. ….mkv
│   └── 1987.04.15. Season 2/
├── 1989.04.26. Dragon Ball Z/
│   ├── [Artwork]/
│   ├── 1989.04.26. Season 1/
│   └── Specials/
└── 1996.02.07. Dragon Ball GT/
    ├── [Artwork]/
    └── 1996.02.07. Season 1/
```

Related movies / manga / games live under `Movies/`, `Books/`, and `Games/` with the same franchise folder name (`Dragon Ball`); the app shows them in **Related media**.

### Single show / miniseries

No subseries tier — seasons sit directly under the franchise/show folder:

```
Series/T/Twin Peaks/
├── [Artwork]/
├── 1990.04.08. Season 1/
│   └── 01. Pilot.mkv
├── 1990.09.30. Season 2/
└── Specials/
```

Films tied to the show are canonical under **`Movies/{Letter}/{Work}/…`** with the same franchise name.

---

## Books — `Books/{Letter}/{Work Title}/{date}. {Volume or Edition}/`

(The Books **module** root is `Books/`, not `Library/`. Music’s `Library/` tab is artist ephemera only.)

```
Books/D/Dragon Ball/
├── [Artwork]/…
├── 1985.12.03. Vol. 01/
│   ├── [Artwork]/…
│   └── 01. Chapter 1.cbz
└── 2022.01.01. Vol. 1-3 Omnibus/

Books/H/Harry Potter/
├── [Artwork]/…
├── 1997.06.26. Philosopher's Stone/
│   ├── [Artwork]/…
│   └── 1997.06.26. Philosopher's Stone.epub
└── 2016.07.31. Cursed Child/
    ├── [Artwork]/…
    └── 2016.07.31. Cursed Child.epub
```

Magazine issues as catalog entries:

```
Books/K/Kerrang/2007.03.15. Issue 1234/
```

---

## Games — `Games/{Platform}/{Letter}/{Franchise}/{date}. {Game Title}/`

Platform-first browsing; **`{Letter}`** = first letter of **game title** (or franchise when using four tiers).

Use platform vocabulary names (e.g. `Nintendo Wii`, not `Wii`).

```
Games/PlayStation 2/D/Dragon Ball/2002.11.10. Dragon Ball Z Budokai/
├── [Artwork]/Cover.jpg
└── 2002.11.10. Dragon Ball Z Budokai.iso

Games/Nintendo Wii/S/Super Mario/2010.05.23. Super Mario Galaxy 2/
├── [Artwork]/…
└── 2010.05.23. Super Mario Galaxy 2.wbfs
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

When `{Work}` / `{Franchise}` folder names match across modules (after normalization), the app shows **Related media** without `.lnk` / `.path` portal farms and without nested `Audio/` / `Series/` / `Books/` / `Games/` / `[Extras]/` folders.

Example: `Dragon Ball` under `Series/D/`, `Movies/D/`, `Books/D/`, and `Games/*/D/Dragon Ball/`.

See [franchise_index.md](./franchise_index.md).

### Optional: manual portals

Use **`.path`** sidecars (preferred on NAS/Linux) or **symlinks** when:

- Franchise names differ but content is related
- Biopics (`Music/H/HIM` ↔ `Movies/E/Elvis`) — use **subject** rules or overrides, not folder name alone
- Subseries-specific film subsets need explicit curation
- Music artist Video should deep-link a specific Movies/Series title

`.path` file body = relative path from media root, e.g.:

```
Movies/H/HIM/2005.11.05. Poison Arrow/
```

Windows **`.lnk`** is supported; prefer `.path` for cross-module links on NAS.

---

## App implementation status (layout vs code)

| Area | Scanner / UI status |
|------|---------------------|
| Music Audio | Implemented |
| Music Video / Library tabs | Category grid; `.lnk` / `.path` resolved for items |
| Franchise index | Phase 1–2 — scan/save/load + related API; UI panel pending |
| Movies / Series / Books / Games modules | Series module in progress; others API stubs |
| Series folder sync | Letter-tier `Series/{Letter}/{Franchise}/` |

---

## Naming discipline checklist

1. One **canonical spelling** per franchise (`Dragon Ball`, not mixed `DBZ` / `Dragonball` in the franchise tier).
2. Register **aliases** in DB or `data/franchise_aliases.json` when needed (future).
3. Disambiguate collisions in folder names: `Heat (1995)` vs `Heat (2013)`.
4. **Music** uses **artist** names; link to films via subject/metadata, not artist folder name alone.
5. Omit empty Music Video/Library categories — do not create placeholder folders.
6. Do **not** nest other modules’ catalogs under Movies/Series/Books/Games.
