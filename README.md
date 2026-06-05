# MediaStack

Modern reimplementation of **MediaBinger**, using the **RecordStack** stack (FastAPI + React 19 + Vite 6), API port **8766**.

## Quick start

```powershell
cd "c:\Users\reyedu01\AI Projects\MediaStack"

# Import legacy databinger.sql (first time)
python run.py --import-sql --import-replace

# API
python run.py --no-browser

# UI dev
cd frontend && npm run dev
```

- API: http://127.0.0.1:8766  
- UI dev: http://localhost:5174 or http://mediastack:5174 (after hosts entry below)

### Custom hostname `mediastack`

Add to `C:\Windows\System32\drivers\etc\hosts` (as Administrator):

```
127.0.0.1 mediastack
```

Then open **http://mediastack:5174** (restart `npm run dev` after changing Vite config).

## Environment

| Variable | Purpose |
|----------|---------|
| `MEDIASTACK_DATABASE_URL` | SQLite default or `mysql+pymysql://user:pass@host/databinger` |
| `MEDIASTACK_MYSQL_IMPORT_URL` | Copy live MySQL → local DB via `POST /api/import/mysql` |
| `MEDIASTACK_MEDIA_ROOT` | Library root for folder sync (`Music/`, `Series/`) |
| `MEDIASTACK_MEDIA_SERVER_URL` | Stream base URL (default `http://127.0.0.1:8887`) |
| `MEDIASTACK_TMDB_API_KEY` | TMDb key (or stored in `apiauth` after SQL import) |
| `MEDIASTACK_MUSICBRAINZ_USER_AGENT` | MusicBrainz user-agent string |

## Features implemented

### 1. SQL / MySQL import

- `python run.py --import-sql` — stream `data/databinger.sql` into SQLite  
- `python run.py --import-sql --import-replace` — drop and reimport  
- `POST /api/import/sql?replace=false`  
- `POST /api/import/mysql?replace=false` — requires `MEDIASTACK_MYSQL_IMPORT_URL`  

### 2. Folder sync (MusicBrainz + TMDb)

- `POST /api/sync/folders` — scan `MEDIASTACK_MEDIA_ROOT` for new artist/series folders  
- `POST /api/sync/folders/background` — run in background  
- Music: MusicBrainz artist MBID → `bands.bndCode`  
- Series: TMDb TV id → `series.serCode`  

### 3. Playback, lyrics, scrobbling

- `POST /api/music/play` — resolve stream URL + log play  
- `GET /api/music/stream?path=...` — local file or redirect to media server  
- `GET /api/music/lyrics?artist=&title=` — lyrics.ovh  
- `GET /api/music/reproductions` — recent play history  
- `GET /api/music/playlist-tracks/{id}`  

### 4. bcrypt passwords

- New users: `POST /api/auth/register` (bcrypt)  
- Legacy Base64 passwords still work; upgraded to bcrypt on first successful login  

### 5. Movies, Books, Games modules

- `GET /api/movies`, `/api/books`, `/api/games`  
- Hub UI browse for all content types  
- `games` table added for MediaStack (legacy had no dump table)  

## API map

| Area | Prefix |
|------|--------|
| Auth | `/api/auth` |
| Metadata | `/api/metadata` |
| Music | `/api/music` |
| Playback | `/api/music/play`, `/stream`, `/lyrics`, `/reproductions` |
| Series | `/api/series` |
| Movies / Books / Games | `/api/movies`, `/api/books`, `/api/games` |
| Import | `/api/import` |
| Sync | `/api/sync` |

## RecordStack

CORS allows cross-calls between RecordStack (8000/8765) and MediaStack (8766).
