# MediaStack

Modern reimplementation of **MediaBinger** — a personal media library and player for music, series, movies, books, and games. MediaStack reads your files from disk, enriches them with legacy database metadata, and serves a fast web UI.

**Stack:** FastAPI (Python) + React 19 + Vite 6 · default API port **8766**

---

## Project status

| Module   | Status |
|----------|--------|
| **Music** | Active development — artist pages, releases, tracklists, playback, lyrics, file tags, quizzes, playlists, gallery |
| Series   | API stubs / browse shell — full UI pending |
| Movies   | API stubs / browse shell — full UI pending |
| Books    | API stubs / browse shell — full UI pending |
| Games    | API stubs / browse shell — full UI pending |

The **music module** is the reference implementation. Folder layout, naming rules, and artwork conventions below apply primarily to music today; other modules will follow similar patterns as they are built.

---

## Requirements

- **Python 3.11+** (3.14 tested)
- **Node.js 18+** and npm (for the dev UI)
- A **media library root** on disk (local path or network share)
- Optional: **Chrome** (opened automatically by `python run.py`)
- Optional: external **media server** for streaming (default `http://127.0.0.1:8887`)

### Python dependencies

Installed automatically on first run, or manually:

```powershell
pip install -r backend/requirements.txt
```

Key packages: FastAPI, Uvicorn, SQLAlchemy, Mutagen (audio duration/tags), httpx, passlib.

### Frontend dependencies

```powershell
cd frontend
npm install
```

---

## Quick start

```powershell
cd "c:\path\to\MediaStack"

# First run: import legacy metadata (bands, releases, tracks, links, etc.)
python run.py --import-sql --import-replace

# Terminal 1 — API (opens browser when frontend/dist exists)
python run.py

# Terminal 2 — UI with hot reload (recommended while developing)
cd frontend
npm run dev
```

| Service | URL |
|---------|-----|
| API | http://127.0.0.1:8766 |
| Dev UI | http://localhost:5174 |
| Production UI | http://127.0.0.1:8766 (when `frontend/dist` is built) |

### Custom hostname

Add to `C:\Windows\System32\drivers\etc\hosts` (as Administrator):

```
127.0.0.1 mediastack
```

Then use **http://mediastack:5174** (restart `npm run dev` after Vite host changes).

### Point at your media library

1. Open the app → **Settings** → set **Media root** to the folder that contains `Music/`, `Series/`, etc.
2. Or set `MEDIASTACK_MEDIA_ROOT` in a `.env` file at the project root.

The path is persisted in user settings and overrides the environment default on startup.

---

## Configuration

Environment variables use the `MEDIASTACK_` prefix (`.env` at project root is supported).

| Variable | Purpose |
|----------|---------|
| `MEDIASTACK_DATABASE_URL` | SQLite default (`data/mediastack.db`) or `mysql+pymysql://user:pass@host/databinger` |
| `MEDIASTACK_MYSQL_IMPORT_URL` | Live MySQL → local DB via `POST /api/import/mysql` |
| `MEDIASTACK_MEDIA_ROOT` | Library root containing `Music/`, `Series/`, etc. |
| `MEDIASTACK_MEDIA_SERVER_URL` | Stream base URL when files are not read locally (default `http://127.0.0.1:8887`) |
| `MEDIASTACK_TMDB_API_KEY` | TMDb (series/movies; or stored in `apiauth` after SQL import) |
| `MEDIASTACK_MUSICBRAINZ_USER_AGENT` | MusicBrainz user-agent for folder sync |
| `MEDIASTACK_LASTFM_API_KEY` | Last.fm (optional) |
| `MEDIASTACK_SETLISTFM_API_KEY` | Setlist.fm (optional) |

### Database import

```powershell
python run.py --import-sql              # merge into SQLite
python run.py --import-sql --import-replace   # drop tables and reimport
```

Source dump: `data/databinger.sql` (legacy MediaBinger / DataBinger schema).

---

## Media library layout (music)

All music paths are relative to **media root**.

```
Media/
└── Music/
    └── {Letter}/                 # First letter of artist name (e.g. H, B, #)
        └── {Artist Name}/        # Must match band name in DB (case-insensitive)
            ├── Audio/
            │   ├── Albums/
            │   ├── Extended Plays/
            │   ├── Compilations/
            │   ├── Soundtracks/
            │   ├── Live Albums/
            │   └── Singles/
            └── Gallery/
                ├── Photos/
                ├── Logos/
                └── Covers/
```

**Example artist path:**

```
Music/B/Bon Jovi/Audio/Albums/1995.11.21. These Days/...
Music/H/HIM/Audio/Albums/1997.11.03. Greatest Lovesongs Vol. 666/...
```

Folder names are matched case-insensitively. Special characters in DB names (`█` → `'`, `■` → `,`) are normalized when resolving paths.

### Audio categories

| Folder key | Display name |
|------------|--------------|
| `Albums` | Album |
| `Extended Plays` | EP |
| `Compilations` | Compilation |
| `Soundtracks` | Soundtrack |
| `Live Albums` | Live album |
| `Singles` | Single |

---

## Release folder structure

A **release** is one album/EP/single folder, usually date-prefixed:

```
{YYYY}.{MM}.{DD}. {Album Title}/
```

Month/day are optional:

```
1997.11.03. Greatest Lovesongs Vol. 666/
1995. These Days/
```

### Editions

Multiple editions live as **sibling subfolders** inside the release:

```
1997.11.03. Greatest Lovesongs Vol. 666/
├── 1997.11.03. Standard Edition/
│   ├── [Artwork]/
│   ├── 01. Song One.flac
│   └── 02. Song Two.flac
└── 2014.02.14. Deluxe/
    ├── [Artwork]/
    ├── Disc 1/
    │   ├── 01. Song One.flac
    │   └── 02. Song Two.flac
    └── Disc 2/
        ├── 01. Bonus Track.flac
        └── 02. Another Bonus.flac
```

**Edition folder rules** (the word `Edition` is optional):

- **Date-prefixed** sibling folder (e.g. `2014.02.14. Deluxe`, `2025.10.12. Remastered`)
- **Any sibling folder** that contains audio files, disc/side/tape groups, or a `[Artwork]` subfolder — e.g. `Deluxe`, `Remastered`, `Japanese Pressing`
- Name ending in `Edition` still works (e.g. `Standard Edition`, `Deluxe Edition`) but is **not required**
- A folder literally named `Standard Edition` is preferred as the default edition when present; otherwise the earliest date-prefixed edition is used

If audio files sit directly in the release root (no edition subfolders), the release root is scanned as a single edition.

### Discs, sides, and tapes

Multi-disc releases use **group subfolders** inside an edition:

| Pattern | Example | Notes |
|---------|---------|-------|
| Numbered disc | `01. Disc 01/` | Preferred for sorted disc order |
| Loose disc | `Disc 1/`, `Disc 2/` | Also supported |
| Vinyl sides | `01. Side A/`, `02. Side B/` | |
| Vinyl (flat) | `A1. Track.flac`, `A2. …`, `B1. …` in the edition folder | No side subfolders — grouped as Side A / Side B automatically |
| Tapes | `01. Tape 01/`, `01. Cassette 01/` | |

The tracklist UI shows group headers (Disc 1, Disc 2, …) and can assign **per-disc artwork**.

**Per-disc images:** place `Disc 01.png`, `Disc 02.png`, etc. in the edition’s `[Artwork]/` folder.

- Tracks on **Disc 1** use the matching disc image.
- If **Disc 2** has no image, playback falls back to the **standard edition** disc — not Disc 1’s image.

### Box sets

A compilation is labeled **Box set** only when its folder name includes the bracket tag **`[Box Set]`** (case-insensitive):

```
2005.01.14. Debut Box [Box Set]/
├── Album One.lnk          → shortcut to another release folder
├── Album Two.lnk
└── [Artwork]/
```

Compilations **without** `[Box Set]` stay **Compilation**, even if they contain `.lnk` files, loose audio, or multiple editions.

Inside a box set, each `.lnk` shortcut becomes its own **tracklist section**. The app resolves each link by **filename** (order prefix kept, bracket suffixes become `: Edition Name`):

1. Look up the release title across **Studio Albums → EPs → Singles → Compilations → Live Albums**
2. If the link has no edition bracket, use **Standard Edition** (or the first dated edition)
3. If the link has `[Remastered Edition]` etc., match that edition folder on the found release
4. If nothing matches, the section header still appears (dimmed) with no playable tracks

Compilation folders with `.lnk` files follow the same rules. Local audio files in the compilation folder appear in their own section. `.lnk` targets are **not** scanned twice (no duplicate Standard Edition blocks).

On the artist **Audio → Compilations** tab, when both regular compilations and box sets exist, a sub-bar appears (**RELEASES** / **BOX SETS**) — same pattern as **OFFICIAL** / **UNOFFICIAL** on live albums.

---

## `[Artwork]` folder

Every edition (or release root) should have a **`[Artwork]`** subfolder — name is case-insensitive.

### Expected filenames (stems)

| File stem | Purpose |
|-----------|---------|
| `Cover - Front` | Main cover (playback, cards, gallery) |
| `Cover - Album` | Alternate main cover stem (same role as `Cover - Front`) |
| `Cover - Back` | Back cover (background layers) |
| `Cover - Inner` | Inner sleeve (background layers) |
| `Animation - Album` | Animated album cover (`.mp4`, `.webm`, …); legacy `Cover - Animation` still supported |
| `Canvas - Album` | Spotify-style canvas video |
| `Cover - {Track Title}` | Track-specific static cover (overrides album front on that track) |
| `Animation - {Track Title}` | Track-specific animated cover |
| `Canvas - {Track Title}` | Track-specific canvas video |
| `Disc`, `Disc 01`, `Disc 02`, `Vinyl`, `CD` | Rotating disc art |
| `Logo`, `Icon` | Branding |
| `Photocard - Portrait Front`, etc. | K-pop-style flip cards on the release overview |
| `Photo - Portrait`, `Photo - Landscape` | Various Artists fallback when no photocards exist |
| `Wallpaper - Portrait`, `Wallpaper - Landscape` | Photocard backs (VA) or era-gallery backs |
| `Spotify`, `QR` | Optional extras |

**Supported image formats:** `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.bmp`

**Supported video formats (animation/canvas):** `.mp4`, `.webm`, `.mov`, `.m4v`

If no disc image exists, the app uses `assets/system/default/disc.png`.

### Release overview photocards

Photocards on the release **Overview** tab resolve in this order:

1. **Dedicated** `Photocard - …` stems in `[Artwork]`
2. **Various Artists only:** `Photo - …` fronts with `Wallpaper - …` backs (wallpaper-only if no photos)
3. **Other artists:** era-matched **gallery** photos (portrait + landscape)
4. **Last resort:** `Cover - Front` / `Cover - Back` as a **single** square-corner flip card when nothing else is available

Layout: description on the left, photocards on the right; **lineup** sits below the description in a glass panel (same as releases with singles).

### Lyrics

Synced lyrics (`.lrc`) are resolved in this order:

1. **Database** — `track_overrides` table (`troLyricsLrc` / `troLyricsPlain`), keyed by `play_path`
2. Next to the audio file (`Song.flac` → `Song.lrc`)
3. `[Artwork]/Lyrics/{same stem as audio}.lrc`

Example (legacy file layout):

```
[Artwork]/Lyrics/01. Wicked Game.lrc
```

Fetched or edited lyrics are stored in the database so they stay with the track without extra folders.

**In the app:**

- **Synced** / **Not synced** badges in the lyrics view show whether timestamped LRC is available.
- Synced lyrics highlight the active line and auto-scroll during playback.
- The same song title on different editions of one release shares synced LRC (opening or playing any edition uses lyrics stored for that title).
- Admins: **Track data → Fetch lyrics** bulk-fetches synced LRC from [LRCLIB](https://lrclib.net); **Set lyrics** uploads `.lrc` files per song (applies to every edition of that title on the release). Clicking **Not synced** (admin only) opens the same Set lyrics modal.
- Plain-text edits keep existing synced LRC unless you replace it via Set lyrics or a new upload.

### Official videos (YouTube)

YouTube links are stored in **`track_overrides`** (`troYoutubeUrl`), keyed by `play_path`. Resolution order:

1. Database override for that `play_path`
2. Legacy `[Artwork]/YouTube.txt` (or similar) beside the track
3. `tracks.traVideo` in the database (matched by title)
4. Single inheritance — if the album track shares a title with a file under `Audio/Singles/`, the single’s link may apply

Admins can bulk-fetch official videos from MusicBrainz (**Track data → Get videos**) or set links manually (**Set video**). Playback opens YouTube in a new tab (autoplay) and pauses local audio.

### Write file tags (admin)

Embed ID3/Vorbis/MP4 metadata into **local audio files** on disk from release and track data (**Track data → Write file tags** on a release page).

**Always written:** title, artist, album artist, album, year, track number, disc number, genre.

**Tag rules (defaults in the preview table, all editable before write):**

- **Title** — bracket suffixes from filenames become parentheses, e.g. `Wicked Game [Chris Isaak cover]` → `Wicked Game (Chris Isaak cover)`. `feat.` tags are omitted from the title.
- **Artist** — album artist plus featured guests, e.g. `HIM feat. Sanna-June Hyde`.
- **Album** — release title only for **Standard Edition** or when the edition name matches the album title (date prefixes on edition folders are stripped). Non-standard editions append `: Edition Name` without the folder date, e.g. `Greatest Lovesongs Vol. 666: Remastered Edition`.
- **Writers** — pre-filled from track credits; editable per row and embedded as composer tags when present.
- **Lyrics** — optional per track (checked by default when lyrics exist in the app); sourced from DB / shared release LRC / sidecar `.lrc` files.
- **Cover art** — optional global embed; click the cover thumbnail to pick an image (native file dialog opens in the release `[Artwork]` folder, defaulting to **Cover - Front**).

**Table controls:**

- Left checkbox per row — include or skip that file on write (checked by default).
- Only **direct audio tracks** from the release tracklist are listed (`.lnk` shortcuts and **B-sides** sections are excluded — tag B-side files from their single release page).
- **Write file tags** is available on tablet and desktop only (hidden on phones).

**Supported write formats:** `.mp3`, `.flac`, `.ogg`, `.opus`, `.m4a`, `.mp4`, `.aac` (via Mutagen).

---

## Audio file naming

### Track number prefix

Use a numeric prefix for track order:

```
01. Blaze of Glory.flac
02. This Ain't a Love Song.flac
10. Something Else.flac
```

The prefix (`01. `) is stripped for **display title** and matching. Without a prefix, files are ordered alphabetically and numbered sequentially.

**Vinyl side prefixes** (`A1. `, `B2. `, … `Z10. `) are also stripped for display titles (tracklist, left panel, song quiz). They still define side grouping and per-side track order when files sit flat in an edition folder.

### Supported audio formats

`.mp3` · `.flac` · `.wav` · `.wma` · `.aac`

### `.lnk` shortcuts

Windows `.lnk` files may point to audio elsewhere (useful for box sets or shared tracks). The resolver follows the link target.

---

## Bracket suffixes `[...]`

Tags after the title in **square brackets** drive playlists, version detection, and UI labels. Separate multiple tags with **`;`**.

```
02. This Ain't a Love Song [Live].flac
03. Always [Acoustic].flac
04. Bed of Roses [Remix; feat. DJ Example].flac
```

### Version / playlist tags

Recognized for **system playlists** and **alternate versions**:

| Tag | Effect |
|-----|--------|
| `Acoustic` | Acoustic playlist / version label |
| `Remix`, `Mix` | Remixes playlist (substring match on tag text) |
| `Live` | Live version |
| `Radio edit`, `Extended edit`, … | Treated like versions (shown under release date in the track panel) |
| `Demo` | Demos playlist |
| `Instrumental` | Instrumentals playlist |
| `B-Side`, `B Side` | B-sides playlist |
| `Bonus` | Bonus tracks playlist |
| `Cover` | Covers playlist (or `Artist Name cover`) |
| `A Cappella` | A cappella playlist |
| `Tribute` | Tributes playlist |
| `feat. Artist` | Features playlist (own library) |
| `with Artist` | Appearances on other artists’ releases |

**Edition-only tags** (no bracket tag required):

| Source | Playlist |
|--------|----------|
| Tracks in non-standard editions not on the standard edition | **Bonus Tracks** |
| Non-A-side files under `Audio/Singles/` | **B-Sides** |
| A-side singles whose title is not on any album/EP/compilation/soundtrack/live album | **Standalones** |

**Cross-library playlists:**

| Playlist | Rule |
|----------|------|
| **Appearances** | Other artists’ files whose `[…]` tags mention the band (incl. `feat.` / `with`) |
| **Collaborations** | Appearances where the band is explicitly featured (`feat. …`) |
| **Writing Credits** | Tracks on other artists/projects credited to band members (incl. solo monikers linked via lineup) |
| **Most Played** | Local tracks sorted by play count for the current profile |
| **Top Tracks** | From `bndTop100` / `bndTopTracks` matched to local files |
| **Setlists** | setlist.fm (requires MusicBrainz ID + API key); year/show picker when opening |

Opening a system playlist shows a **tracklist-only page** (release-style left panel + track list; no Overview/Gallery tabs). Route: `/music/artist/{id}/audio/playlist/{slug}`.

Default playlist card art lives in `assets/system/playlists/{slug}.png` (512×512 gradient tiles served at `/api/assets/system/playlists/{slug}`). Regenerate or add covers there when introducing new system playlist slugs.

### Language adaptations

Link a translated title to its original song:

```
Como Yo Nadie Te Ha Amado [Spanish; of This Ain't a Love Song].flac
```

| Tag | Effect |
|-----|--------|
| `Spanish`, `French`, `German`, … | Shown as “Spanish Version”, etc. |
| `of {Original Title}` | Links to the original — appears in **Versions** for both songs |

**Versions** are also matched by:

- Same normalized title (brackets stripped)
- `traAltName` in the database (if populated)

### Folder / album bracket tags

Album or single **folder names** may also carry brackets:

```
2020.01.01. Some Album [by Original Artist; unofficial]
```

| Tag | Meaning |
|-----|---------|
| `by Artist` | Tribute / source artist |
| `with Artist` | Split or collaboration context |
| `unofficial` | Marked unofficial — artist Audio tab shows an **OFFICIAL** / **UNOFFICIAL** sub-bar for that category |
| `box set` | Marks a compilation as a **box set** (see above) |
| `of Title` | Work linkage (same as track-level) |

Bracket suffixes are **removed from displayed titles** (release cards, type lines, **Taken from …**, box-set edition labels, etc.). Tags still drive filtering and metadata.

---

## Singles and B-sides

Singles live under:

```
Music/{Letter}/{Artist}/Audio/Singles/{Parent Album or Era}/
└── {YYYY}.{MM}.{DD}. {Single Title}/
    ├── 1998.02.03. Standard Edition/    # optional dated edition
    │   ├── [Artwork]/
    │   └── 01. Track.flac
    └── 2025.10.12. Deluxe Edition/       # another edition with its own date
        ├── [Artwork]/
        └── 01. Track.flac
```

When a single is tied to an album, its tracks can appear under a **B-sides** section on the parent release tracklist.

- B-side tracks are numbered **1, 2, 3…** within each single group (filename prefixes are not shown as track numbers).
- Each **single edition** keeps its own release date; the left panel shows the date for the edition actually playing.
- While a B-side plays, the left panel shows **Taken from the {Single Title} single** (or **{Single}: {Edition} single** when editions differ). The title is clickable and opens that single in-app — same pattern as **Versions → Taken from {release}**.

**Playback artwork:** if an album track shares a title with a single, playback may use the single’s `[Artwork]` (e.g. `Wicked Game` on an album → single cover).

**Track-specific `[Artwork]`** (when not playing from a single edition):

1. `Cover - {Track Title}` — static cover (top tracks, tracklist thumbnails, playback)
2. `Animation - {Track Title}` — animated cover; if missing but a track cover exists, album `Animation - Album` is suppressed
3. `Canvas - {Track Title}` — canvas video; same suppression rule as animation

Album defaults: `Cover - Front` / `Cover - Album`, `Animation - Album` (legacy `Cover - Animation` still read), `Canvas - Album`.

---

## Music module features

- **Home dashboard** — recent plays, shortcuts; **cover-based theme** while a track plays (restores on pause/stop; menu theme choice is remembered)
- **Artist page** — bio, lineup, discography, singles, **system playlists** (Audio tab), gallery, word cloud, quizzes (song quiz strips vinyl prefixes like the tracklist)
- **Release page** — unified tracklist across editions + B-sides, cover/disc/canvas playback, gallery, credits, lyrics, versions; left panel release date follows the playing track’s edition
- **Per-track playback art** — cover, disc, canvas, and background from the track’s source `[Artwork]` (track-specific stems override album animation/canvas); edition `Logo.png` in the top bar when applicable
- **Top tracks & tracklist covers** — single edition → `Cover - {title}` in `[Artwork]` → album front; singles matched by title under `Audio/Singles/`
- **Writer links** — “Written by” names open in-app when the artist has a local folder, matching **band aliases** (`bndOtherNames`, e.g. Ville Valo → VV)
- **Playback themes** — home and artist top tracks sample cover colors while playing; changing theme via the menu while playing defers the visual switch until pause/stop, then resumes cover colors on play
- **Track actions** — Lyrics, Versions, Add to playlist, and YouTube (when a link exists) above the player bar
- **Versions panel** — acoustic/live/remix/**edit** plus language adaptations via `of` tags; playing a version from another release shows **Taken from {release}** in the left panel (clickable in-app navigation)
- **Lyrics** — inline synced LRC with active-line highlight and auto-scroll; **Synced** / **Not synced** badges; admin fetch (LRCLIB), `.lrc` upload (**Set lyrics**), and plain edit (preserves existing LRC); stored in DB via `track_overrides`
- **YouTube** — per-track official video links in DB (multiple URLs per track supported); bulk fetch, manual set, picker when several exist, open in new tab with autoplay
- **Playlists** — user playlists (`plaType` 200) + **artist system playlists** scanned from disk (suffix tags, singles, editions, cross-library, play counts); alphabetical grid under Audio → Playlists; add-to-playlist modal with create-and-add
- **Song quiz** — audio stops on score screen; page audio cleared when entering quiz; writer/artist name resolution uses same alias rules as release credits
- **Release admin menu** — Track data (**Fetch lyrics**, **Set lyrics**, **Fetch videos**, **Set Official Videos**, **Write file tags**), Edit release (About, metadata, description), styled modals with inner-only scrollbars
- **Search** — in-library media search per artist
- **Playback** — play logging, auto-advance to next track, stream via local file or media server

### Mobile landscape (phones, ≤900px width)

Phone **landscape** uses dedicated layouts (`usePhoneLayout`, scoped CSS classes). Portrait, tablet, and desktop layouts are unchanged.

- **Home** — horizontally scrolling dashboard panes (10 items); On Repeat auto-scrolls to the active track
- **Artist** — lineup and audio discography five per row; gallery five columns; scrollable About tab with beat-reactive photo glow; member modal uses side-by-side photo and info
- **Release** — split tracklist and track panel; scrollable panels; cover, disc, and canvas playback in the left panel when a track is playing; gallery sub-bars and full-width five-column photo grid

### Track overrides (`track_overrides`)

Per-track data keyed by **`play_path`** (stable across renames if path unchanged):

| Column | Purpose |
|--------|---------|
| `troPlayPath` | Primary key — relative path to audio file |
| `troYoutubeUrl` | Official video URL or video ID |
| `troLyricsLrc` | Synced lyrics (LRC text) |
| `troLyricsPlain` | Plain lyrics fallback |

Created automatically on schema migrate. Prefer DB storage over `[Artwork]` subfolders for lyrics and YouTube links going forward.

---

## Building for production

```powershell
cd frontend
npm run build
```

Then `python run.py` serves the built UI from `frontend/dist` at port 8766.

---

## API overview

| Area | Prefix |
|------|--------|
| Auth / profiles | `/api/auth` |
| Settings | `/api/settings` |
| Music | `/api/music` |
| Playback / stream / lyrics | `/api/music/play`, `/stream`, `/lyrics` |
| Track YouTube (get/set/fetch) | `/api/music/youtube`, `.../youtube/fetch` |
| Write file tags (admin) | `POST /api/music/bands/{id}/releases/{id}/write-file-tags` (+ `pick-cover`, `cover-preview`) |
| Series | `/api/series` |
| Movies / Books / Games | `/api/movies`, `/api/books`, `/api/games` |
| Import | `/api/import` |
| Folder sync | `/api/sync` |

CORS is configured for local Vite dev (`5174`) and RecordStack (`8000` / `8765`).

---

## Common issues

### Artist or release not found

- Artist folder name must match `bands.bnd_name` in the database (case-insensitive).
- Run folder sync: `POST /api/sync/folders` to link new folders to MusicBrainz IDs.
- Ensure **media root** in Settings points at the correct drive/path.

### Wrong cover, disc, or canvas

- Check `[Artwork]` filenames match expected stems (`Cover - Front`, not `front.jpg`).
- For multi-disc editions, use `Disc 01.png`, `Disc 02.png`. Missing disc images fall back to standard edition.
- Per-track playback uses the **edition/single** that owns the file; verify folder placement.

### Track order wrong

- Add `01.`, `02.`, … prefixes to file names.
- Disc/side subfolders must use recognized naming (`Disc 1`, `01. Disc 01`, …), or use flat vinyl names (`A1.`, `B1.`, …).

### Versions not linking

- Acoustic/live/remix: same base title + bracket tag, e.g. `Song [Live]`.
- Language versions: use `of Original Title` in brackets on the translated file.
- Optional: set `traAltName` in the database to the canonical title.

### Lyrics missing

- Place `.lrc` beside the audio file or under `[Artwork]/Lyrics/` with the **full audio stem** as the filename.
- Bracket suffixes in the filename are kept for LRC lookup variants.

### API port already in use

```powershell
# Windows — free port 8766 then restart
$p = (Get-NetTCPConnection -LocalPort 8766 -State Listen).OwningProcess | Select-Object -Unique
$p | ForEach-Object { Stop-Process -Id $_ -Force }
python run.py --no-browser
```

---

## RecordStack

MediaStack shares DNA with **RecordStack** (compatible stack, cross-origin API calls). They can run side by side on different ports.

---

## License / legacy

Metadata and schema originate from the MediaBinger / DataBinger project (`data/databinger.sql`). MediaStack is a clean-room UI and API rewrite on top of that data plus your on-disk library layout.
