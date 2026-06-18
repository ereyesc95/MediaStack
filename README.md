# MediaStack

Modern reimplementation of **MediaBinger** — a personal media library and player for music, series, movies, books, and games. MediaStack reads your files from disk, enriches them with legacy database metadata, and serves a fast web UI.

**Stack:** FastAPI (Python) + React 19 + Vite 6 · default API port **8766**

---

## Project status

| Module   | Status |
|----------|--------|
| **Music** | Active development — artist pages, releases, tracklists, playback, lyrics, quizzes, playlists, gallery |
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
└── 2014.02.14. Deluxe Edition/
    ├── [Artwork]/
    ├── Disc 1/
    │   ├── 01. Song One.flac
    │   └── 02. Song Two.flac
    └── Disc 2/
        ├── 01. Bonus Track.flac
        └── 02. Another Bonus.flac
```

**Edition folder rules:**

- Name ends with `Edition` (e.g. `Standard Edition`, `Deluxe Edition`, `Japanese Edition`)
- Or is date-prefixed (treated as an edition)
- A folder literally named `Standard Edition` is preferred as the default edition
- Date-prefixed names ending in `Standard Edition` are also recognized

If audio files sit directly in the release root (no edition subfolders), the release root is scanned as a single edition.

### Discs, sides, and tapes

Multi-disc releases use **group subfolders** inside an edition:

| Pattern | Example | Notes |
|---------|---------|-------|
| Numbered disc | `01. Disc 01/` | Preferred for sorted disc order |
| Loose disc | `Disc 1/`, `Disc 2/` | Also supported |
| Vinyl sides | `01. Side A/`, `02. Side B/` | |
| Tapes | `01. Tape 01/`, `01. Cassette 01/` | |

The tracklist UI shows group headers (Disc 1, Disc 2, …) and can assign **per-disc artwork**.

**Per-disc images:** place `Disc 01.png`, `Disc 02.png`, etc. in the edition’s `[Artwork]/` folder.

- Tracks on **Disc 1** use the matching disc image.
- If **Disc 2** has no image, playback falls back to the **standard edition** disc — not Disc 1’s image.

### Box sets

Releases that contain `.lnk` shortcuts to other album folders are treated as **box sets**. Each link becomes its own edition group in the tracklist.

---

## `[Artwork]` folder

Every edition (or release root) should have a **`[Artwork]`** subfolder — name is case-insensitive.

### Expected filenames (stems)

| File stem | Purpose |
|-----------|---------|
| `Cover - Front` | Main cover (playback, cards, gallery) |
| `Cover - Back` | Back cover (background layers) |
| `Cover - Inner` | Inner sleeve (background layers) |
| `Cover - Animation` | Animated cover (`.mp4`, `.webm`, …) |
| `Canvas - Album` | Spotify-style canvas video |
| `Disc`, `Disc 01`, `Disc 02`, `Vinyl`, `CD` | Rotating disc art |
| `Logo`, `Icon` | Branding |
| `Photocard - Portrait Front`, etc. | K-pop-style photocards (gallery) |
| `Spotify`, `QR` | Optional extras |

**Supported image formats:** `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.bmp`

**Supported video formats (animation/canvas):** `.mp4`, `.webm`, `.mov`, `.m4v`

If no disc image exists, the app uses `assets/system/default/disc.png`.

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

### Official videos (YouTube)

YouTube links are stored in **`track_overrides`** (`troYoutubeUrl`), keyed by `play_path`. Resolution order:

1. Database override for that `play_path`
2. Legacy `[Artwork]/YouTube.txt` (or similar) beside the track
3. `tracks.traVideo` in the database (matched by title)
4. Single inheritance — if the album track shares a title with a file under `Audio/Singles/`, the single’s link may apply

Admins can bulk-fetch official videos from MusicBrainz (**Track data → Get videos**) or set links manually (**Set video**). Playback opens YouTube in a new tab (autoplay) and pauses local audio.

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
| `Remix` | Remixes playlist |
| `Live` | Live version |
| `Demo` | Demos playlist |
| `Instrumental` | Instrumentals playlist |
| `B-Side`, `B Side` | B-sides playlist |
| `Bonus` | Bonus tracks playlist |
| `Cover` | Covers playlist (or `Artist Name cover`) |
| `A Cappella` | A cappella playlist |
| `Tribute` | Tributes playlist |
| `feat. Artist` | Features / collaborations |
| `with Artist` | Collaborations / appearances |

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
| `unofficial` | Marked unofficial |
| `of Title` | Work linkage (same as track-level) |

---

## Singles and B-sides

Singles live under:

```
Music/{Letter}/{Artist}/Audio/Singles/{Parent Album or Era}/
└── {YYYY}.{MM}.{DD}. {Single Title}/
    └── Standard Edition/          # or dated edition folder
        ├── [Artwork]/
        └── 01. Track.flac
```

When a single is tied to an album, its tracks can appear under a **B-sides** section on the parent release tracklist.

**Playback artwork:** if an album track shares a title with a single, playback may use the single’s `[Artwork]` (e.g. `Wicked Game` on an album → single cover).

---

## Music module features

- **Home dashboard** — recent plays, shortcuts
- **Artist page** — bio, lineup, discography, singles, playlists, gallery, word cloud, quizzes
- **Release page** — unified tracklist across editions + B-sides, cover/disc/canvas playback, gallery, credits, lyrics, versions
- **Per-track playback art** — cover, disc, canvas, and background from the track’s source `[Artwork]`
- **Track actions** — Lyrics, Versions, Add to playlist, and YouTube (when a link exists) above the player bar
- **Versions panel** — acoustic/live/remix plus language adaptations via `of` tags; playing a version from another release shows **Taken from {release}** in the left panel (clickable in-app navigation)
- **Lyrics** — inline synced LRC, on-demand fetch, edit modal; stored in DB via `track_overrides`
- **YouTube** — per-track official video links in DB; bulk fetch, manual set, open in new tab with autoplay
- **Playlists** — user playlists (`plaType` 200) + suffix-based system templates (`plaType` 201: Remixes, Acoustic, …); add-to-playlist modal with create-and-add
- **Release admin menu** — Track data (lyrics/videos), Edit release (About, metadata, description), styled modals with inner-only scrollbars
- **Search** — in-library media search per artist
- **Playback** — play logging, auto-advance to next track, stream via local file or media server

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
- Disc/side subfolders must use recognized naming (`Disc 1`, `01. Disc 01`, …).

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
