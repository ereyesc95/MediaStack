from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.band_library import cover_url_for_track_path, title_from_track_path
from app.config import settings
from app.gallery import pick_playlist_cover, resolve_artist_card
from app.user_playlist import resolve_playlist_cover_url
from app.models import Band, Country, Genre, Playlist, PlaylistData, Reproduction, Subgenre
from app.play_stats import is_quiz_play_title, subgenre_image_url

FEAT_RE = re.compile(r"\s*[\(\[](?:feat\.?|ft\.?|featuring)[^\)\]]*[\)\]]", re.I)

LIBRARY_MOST_PLAYED_NAME = "Most Played"
LIBRARY_MOST_PLAYED_LIMIT = 100
LIBRARY_MOST_PLAYED_DEFAULT_COVER = "/api/assets/playlists/most-played"
DEFAULT_USER_PLAYLIST_COVER = "/api/assets/default/playlist"


def _is_library_most_played(playlist: Playlist) -> bool:
    return (playlist.pla_name or "").strip().casefold() == LIBRARY_MOST_PLAYED_NAME.casefold()


def _library_most_played_paths(db: Session, user_id: int) -> list[tuple[str, int]]:
    """Return (path, play_count) sorted most-to-least, up to LIBRARY_MOST_PLAYED_LIMIT."""
    from app.profile_scope import rep_user_filter

    path_counts: Counter[str] = Counter()
    for row in db.scalars(
        select(Reproduction).where(
            Reproduction.rep_media_type == 200,
            rep_user_filter(user_id),
        )
    ).all():
        path = (row.rep_path or "").strip().replace("\\", "/")
        if not path or is_quiz_play_title(row.rep_title):
            continue
        weight = _dashboard_rep_weight(row)
        if weight > 0:
            path_counts[path] += weight
    return path_counts.most_common(LIBRARY_MOST_PLAYED_LIMIT)


def build_library_most_played_tracks(
    db: Session,
    media_root: Path,
    *,
    user_id: int,
) -> list[dict]:
    from app.playlist_tracks import enrich_playlist_tracks
    from app.profile_scope import rep_user_filter

    ranked = _library_most_played_paths(db, user_id)
    if not ranked:
        return []

    path_meta: dict[str, dict] = {}
    for row in db.scalars(
        select(Reproduction).where(
            Reproduction.rep_media_type == 200,
            rep_user_filter(user_id),
        )
    ).all():
        path = (row.rep_path or "").strip().replace("\\", "/")
        if not path or path in path_meta:
            continue
        artist_name = "Unknown"
        if row.rep_artist_id:
            band = db.get(Band, row.rep_artist_id)
            if band and band.bnd_name:
                artist_name = band.bnd_name
        path_meta[path] = {
            "title": _clean_track_title(_effective_track_title(row)),
            "artist_name": artist_name,
            "release": (row.rep_release or "").strip(),
        }

    raw_tracks: list[dict] = []
    for path, count in ranked:
        candidate = media_root / Path(path.replace("/", "\\"))
        if not candidate.is_file():
            candidate = media_root / Path(path)
        if not candidate.is_file():
            continue
        meta = path_meta.get(path, {})
        raw_tracks.append(
            {
                "title": meta.get("title") or title_from_track_path(path),
                "play_path": path,
                "artist_name": meta.get("artist_name") or "Unknown",
                "cover_url": cover_url_for_track_path(path, media_root),
                "play_count": count,
            }
        )

    tracks = enrich_playlist_tracks(raw_tracks, media_root, db=db)
    for i, raw in enumerate(raw_tracks):
        if i < len(tracks) and raw.get("play_count") is not None:
            tracks[i]["play_count"] = raw["play_count"]
    return tracks


def _clean_track_title(title: str | None) -> str:
    if not title:
        return ""
    t = FEAT_RE.sub("", title)
    t = re.sub(r"\s{2,}", " ", t).strip()
    return t


def _resolve_subgenre_name(db: Session, sid: int) -> str | None:
    sub = db.get(Subgenre, sid)
    if sub and sub.sgn_name:
        return sub.sgn_name
    return None


def _genre_names(db: Session, genre_ids: str | None) -> list[str]:
    if not genre_ids:
        return []
    names: list[str] = []
    for part in genre_ids.split(";"):
        part = part.strip()
        if not part:
            continue
        try:
            gid = int(part)
        except ValueError:
            continue
        name = _resolve_subgenre_name(db, gid)
        if name:
            names.append(name)
    return names


def _country_info(db: Session, country_field: str | None) -> tuple[str | None, str | None]:
    if not country_field:
        return None, None
    cid = country_field.split("[")[0].strip()
    try:
        row = db.get(Country, int(cid))
        if row:
            return row.cou_name, (row.cou_iso or "").lower() or None
    except ValueError:
        pass
    return None, None


def _effective_track_title(r: Reproduction) -> str:
    raw = r.rep_title or ""
    if is_quiz_play_title(raw) and r.rep_path:
        from_path = title_from_track_path(r.rep_path)
        if from_path:
            return from_path
    return raw


def _dashboard_rep_weight(r: Reproduction) -> int:
    if is_quiz_play_title(r.rep_title):
        return 0
    try:
        return int(r.rep_reproductions or "0")
    except ValueError:
        return 0


def build_dashboard(db: Session, user_id: int) -> dict:
    from app.profile_scope import rep_user_filter

    reps = list(
        db.scalars(
            select(Reproduction)
            .where(
                Reproduction.rep_media_type == 200,
                rep_user_filter(user_id),
            )
            .order_by(Reproduction.rep_id.desc())
            .limit(300)
        ).all()
    )

    def plays(r: Reproduction) -> int:
        return _dashboard_rep_weight(r)

    reps_sorted = sorted(
        [r for r in reps if plays(r) > 0 and not is_quiz_play_title(r.rep_title)],
        key=plays,
        reverse=True,
    )

    media_root = Path(settings.media_root) if settings.media_root else None

    top_tracks = []
    for r in reps_sorted[:10]:
        artist_name = None
        if r.rep_artist_id:
            band = db.get(Band, r.rep_artist_id)
            artist_name = band.bnd_name if band else None
        raw_title = _effective_track_title(r)
        cover_url = (
            cover_url_for_track_path(r.rep_path, media_root) if media_root else None
        )
        top_tracks.append(
            {
                "id": r.rep_id,
                "title": _clean_track_title(raw_title),
                "title_full": raw_title,
                "artist_id": r.rep_artist_id,
                "artist_name": artist_name,
                "artist_name_full": artist_name,
                "play_count": plays(r),
                "path": r.rep_path,
                "release": r.rep_release,
                "cover_url": cover_url,
            }
        )

    artist_counts: Counter[int] = Counter()
    for r in reps:
        if r.rep_artist_id and plays(r) > 0 and not is_quiz_play_title(r.rep_title):
            artist_counts[r.rep_artist_id] += plays(r)

    top_artists = []
    for aid, count in artist_counts.most_common(10):
        band = db.get(Band, aid)
        if not band:
            continue
        card = resolve_artist_card(band.bnd_name, orientation="landscape")
        top_artists.append(
            {
                "id": band.bnd_id,
                "name": band.bnd_name,
                "play_count": count,
                "photo_url": card.photo_url,
                "logo_url": card.logo_url,
                "icon_url": card.icon_url,
                "show_name_on_hover": False,
            }
        )

    genre_counts: Counter[int] = Counter()
    country_counts: Counter[int] = Counter()
    for aid in artist_counts:
        band = db.get(Band, aid)
        if not band:
            continue
        weight = artist_counts[aid]
        for part in (band.bnd_fk_subgenres or "").split(";"):
            part = part.strip()
            if part.isdigit():
                genre_counts[int(part)] += weight
        cid = _parse_country_id(band.bnd_fk_countries)
        if cid:
            country_counts[cid] += weight

    top_genres = []
    for gid, count in genre_counts.most_common(10):
        name = _resolve_subgenre_name(db, gid)
        if name:
            top_genres.append(
                {
                    "id": gid,
                    "name": name,
                    "play_count": count,
                    "image_url": subgenre_image_url(name),
                }
            )

    top_countries = []
    for cid, count in country_counts.most_common(10):
        row = db.get(Country, cid)
        if row and row.cou_name:
            top_countries.append(
                {
                    "id": cid,
                    "name": row.cou_name,
                    "iso": (row.cou_iso or "").lower(),
                    "play_count": count,
                }
            )

    return {
        "top_tracks": top_tracks,
        "top_artists": top_artists,
        "top_genres": top_genres,
        "top_countries": top_countries,
    }


def _parse_country_id(field: str | None) -> int | None:
    if not field:
        return None
    part = field.split("[")[0].strip()
    try:
        return int(part)
    except ValueError:
        return None


def list_artist_cards(
    db: Session,
    *,
    user_id: int,
    search: str = "",
    letter: str = "",
    orientation: str = "landscape",
    page: int = 1,
    page_size: int = 48,
    filter_mode: str = "name",
    member_count: int | None = None,
    member: str = "",
    member_artist_id: int | None = None,
    continent_id: int | None = None,
    country_id: int | None = None,
    start_decade: int | None = None,
    end_decade: int | None = None,
    subgenre_id: int | None = None,
    gender: str = "",
    label: str = "",
    producer: str = "",
) -> tuple[list[dict], int]:
    from app.music_filters import _play_counts, filter_bands, sort_bands

    rows = list(db.scalars(select(Band)).all())
    play_counts = (
        _play_counts(db, user_id) if filter_mode == "most_played" else None
    )
    rows = filter_bands(
        db,
        rows,
        search=search,
        letter=letter,
        filter_mode=filter_mode,
        member_count=member_count,
        member=member,
        member_artist_id=member_artist_id,
        continent_id=continent_id,
        country_id=country_id,
        start_decade=start_decade,
        end_decade=end_decade,
        subgenre_id=subgenre_id,
        gender=gender,
        label=label,
        producer=producer,
    )
    rows = sort_bands(rows, filter_mode=filter_mode, play_counts=play_counts)

    total = len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start : start + page_size]
    items = []
    for b in page_rows:
        card = resolve_artist_card(b.bnd_name, orientation=orientation)
        items.append(
            {
                "id": b.bnd_id,
                "code": b.bnd_code,
                "name": b.bnd_name,
                "starting_dates": b.bnd_starting_dates,
                "photo_url": card.photo_url,
                "logo_url": card.logo_url,
                "icon_url": card.icon_url,
                "era_year": card.era_year,
                "show_name_on_hover": card.show_name_on_hover or not card.photo_url,
                "play_count": play_counts.get(b.bnd_id, 0) if play_counts else None,
            }
        )
    return items, total


def list_user_playlists(db: Session, *, user_id: int, is_admin: bool) -> list[dict]:
    del is_admin
    media_root = Path(settings.media_root) if settings.media_root else None
    rows = db.scalars(
        select(Playlist)
        .where(Playlist.pla_type == 200)
        .order_by(Playlist.pla_name)
    ).all()
    out = []
    for p in rows:
        custom_cover = resolve_playlist_cover_url(p)
        if _is_library_most_played(p) and media_root:
            mp_tracks = build_library_most_played_tracks(
                db, media_root, user_id=user_id
            )
            track_count = len(mp_tracks)
            cover = (
                custom_cover
                or (mp_tracks[0].get("cover_url") if mp_tracks else None)
                or LIBRARY_MOST_PLAYED_DEFAULT_COVER
            )
        else:
            from app.playlist_snapshot import is_snapshot_playlist

            first = db.scalars(
                select(PlaylistData).where(PlaylistData.pld_playlist == p.pla_id).limit(1)
            ).first()
            if is_snapshot_playlist(p):
                cover = custom_cover or DEFAULT_USER_PLAYLIST_COVER
            else:
                artist = (first.pld_artist.strip() if first else "") or None
                cover = custom_cover or pick_playlist_cover(
                    artist, first.pld_release if first else None
                ) or DEFAULT_USER_PLAYLIST_COVER
            track_count = len(
                db.scalars(
                    select(PlaylistData).where(PlaylistData.pld_playlist == p.pla_id)
                ).all()
            )
        out.append(
            {
                "id": p.pla_id,
                "name": p.pla_name,
                "type_id": p.pla_type,
                "description": p.pla_description,
                "cover_url": cover,
                "track_count": track_count,
                "source": p.pla_source,
                "spotify_id": p.pla_spotify_id,
                "kind": p.pla_kind or "local",
            }
        )
    return out


def playlist_tracks(
    db: Session, playlist_id: int, *, user_id: int | None = None
) -> list[dict]:
    playlist = db.get(Playlist, playlist_id)
    if (
        playlist
        and _is_library_most_played(playlist)
        and user_id is not None
        and settings.media_root
    ):
        tracks = build_library_most_played_tracks(
            db, Path(settings.media_root), user_id=user_id
        )
        return [
            {
                "id": i + 1,
                "title": t.get("title") or "",
                "artist": t.get("artist_name") or "Unknown",
                "release": t.get("album_title") or "",
                "path": t.get("play_path") or "",
            }
            for i, t in enumerate(tracks)
        ]

    rows = db.scalars(
        select(PlaylistData)
        .where(PlaylistData.pld_playlist == playlist_id)
        .order_by(PlaylistData.pld_sort_order, PlaylistData.pld_id)
    ).all()
    return [
        {
            "id": r.pld_id,
            "title": r.pld_title.strip(),
            "artist": r.pld_artist.strip(),
            "release": r.pld_release.strip(),
            "path": r.pld_path.strip(),
            "album": (r.pld_album or "").strip() or None,
            "year": (r.pld_year or "").strip() or None,
            "unavailable": bool(r.pld_unavailable),
        }
        for r in rows
    ]


def _playlist_neighbors(
    playlists: list[dict], playlist_id: int
) -> tuple[dict | None, dict | None]:
    ordered = sorted(playlists, key=lambda p: (p.get("name") or "").casefold())
    ids = [p["id"] for p in ordered]
    if playlist_id not in ids or len(ids) < 2:
        return None, None
    idx = ids.index(playlist_id)
    prev = ordered[(idx - 1) % len(ordered)]
    nxt = ordered[(idx + 1) % len(ordered)]
    return (
        {"slug": str(prev["id"]), "name": prev.get("name") or str(prev["id"])},
        {"slug": str(nxt["id"]), "name": nxt.get("name") or str(nxt["id"])},
    )


def get_user_playlist_detail(
    db: Session,
    media_root: Path,
    playlist_id: int,
    *,
    user_id: int,
    is_admin: bool,
) -> dict | None:
    from app.playlist_tracks import apply_snapshot_duration, enrich_playlist_tracks

    playlist = db.get(Playlist, playlist_id)
    if not playlist or playlist.pla_type != 200:
        return None

    if _is_library_most_played(playlist):
        tracks = build_library_most_played_tracks(db, media_root, user_id=user_id)
        all_playlists = list_user_playlists(db, user_id=user_id, is_admin=is_admin)
        prev, nxt = _playlist_neighbors(all_playlists, playlist_id)
        custom_cover = resolve_playlist_cover_url(playlist)
        cover = (
            custom_cover
            or (tracks[0].get("cover_url") if tracks else None)
            or LIBRARY_MOST_PLAYED_DEFAULT_COVER
        )
        return {
            "id": playlist.pla_id,
            "slug": str(playlist.pla_id),
            "name": playlist.pla_name or LIBRARY_MOST_PLAYED_NAME,
            "description": playlist.pla_description,
            "cover_url": cover,
            "editable": False,
            "tracks": tracks,
            "prev": prev,
            "next": nxt,
        }

    rows = db.scalars(
        select(PlaylistData)
        .where(PlaylistData.pld_playlist == playlist_id)
        .order_by(PlaylistData.pld_sort_order, PlaylistData.pld_id)
    ).all()

    from app.user_playlist import _youtube_query, _tracks_editable
    from app.playlist_snapshot import is_snapshot_playlist, load_snapshots_for_entries, snapshot_to_api

    entry_ids = [r.pld_id for r in rows]
    snapshots = load_snapshots_for_entries(db, entry_ids)
    is_snapshot = is_snapshot_playlist(playlist)

    from app.library_track_match import normalize_play_path

    match_index = None
    if is_snapshot:
        from app.library_track_match import LibraryTrackIndex
        from app.playlist_snapshot import snapshot_match_fields

        match_index = LibraryTrackIndex(media_root, db=db)

    used_paths: set[str] = set()
    raw_tracks: list[dict] = []
    for r in rows:
        snap = snapshots.get(r.pld_id)
        snap_api = snapshot_to_api(snap) if snap else None
        path = (r.pld_path or "").strip()
        unavailable = bool(r.pld_unavailable) or not path
        norm_path = normalize_play_path(path) if path else ""

        if is_snapshot and match_index:
            match_title, match_artist, match_album = snapshot_match_fields(db, r.pld_id, r)
            snap_year = None
            if snap and snap.pts_release_date:
                snap_year = str(snap.pts_release_date).strip()[:4]
            elif r.pld_year and r.pld_year.isdigit():
                snap_year = r.pld_year
            rematched = match_index.match(
                title=match_title,
                artist=match_artist,
                album=match_album,
                year=snap_year,
                exclude_paths=used_paths,
            )
            if rematched:
                path = rematched.path
                norm_path = normalize_play_path(path)
                unavailable = False
                used_paths.add(norm_path)
            else:
                # Rematch is authoritative for snapshot rows — do not keep a
                # previously mis-assigned path (e.g. Fuel → Apocalyptica file).
                unavailable = True
                path = ""
                norm_path = ""

        release_date = None
        if snap and snap.pts_release_date:
            release_date = snap.pts_release_date
        elif r.pld_year and r.pld_year.isdigit():
            release_date = f"{r.pld_year}-01-01"
        if unavailable:
            snap_title = (snap.pts_snapshot_title if snap else None) or ""
            raw_tracks.append(
                {
                    "entry_id": r.pld_id,
                    "title": (snap_title or r.pld_title or "").strip() or "Unknown",
                    "play_path": None,
                    "artist_name": (
                        (snap.pts_snapshot_artist if snap else None)
                        or (r.pld_artist or "").strip()
                        or None
                    ),
                    "album_title": (
                        (snap.pts_snapshot_album if snap else None)
                        or (r.pld_album or r.pld_release or "").strip()
                        or None
                    ),
                    "release_date": release_date,
                    "cover_url": None,
                    "unavailable": True,
                    "youtube_query": _youtube_query(
                        snap_title or r.pld_title or "",
                        (snap.pts_snapshot_artist if snap else None) or r.pld_artist,
                        (snap.pts_snapshot_album if snap else None) or r.pld_album or r.pld_release,
                    ),
                    "snapshot": snap_api,
                }
            )
            continue
        cover = cover_url_for_track_path(path, media_root)
        raw_tracks.append(
            {
                "entry_id": r.pld_id,
                "title": (r.pld_title or "").strip() or title_from_track_path(path),
                "play_path": path,
                "artist_name": (r.pld_artist or "").strip() or None,
                "album_title": (r.pld_album or r.pld_release or "").strip() or None,
                "release_date": release_date,
                "cover_url": cover,
                "unavailable": False,
                "snapshot": snap_api,
            }
        )

    available_raw = [t for t in raw_tracks if not t.get("unavailable")]
    enriched = enrich_playlist_tracks(available_raw, media_root, db=db)
    enriched_by_entry = {
        t.get("entry_id"): t for t in enriched if t.get("entry_id") is not None
    }

    tracks: list[dict] = []
    for raw in raw_tracks:
        if raw.get("unavailable"):
            tracks.append(apply_snapshot_duration(raw))
            continue
        merged = dict(enriched_by_entry.get(raw.get("entry_id")) or raw)
        merged["entry_id"] = raw.get("entry_id")
        merged["unavailable"] = False
        if raw.get("artist_name"):
            merged["artist_name"] = raw["artist_name"]
        # Prefer disk-resolved edition album label over snapshot/DB album.
        if not merged.get("album_title") and raw.get("album_title"):
            merged["album_title"] = raw["album_title"]
        # Prefer edition folder date when it matches (or is nearer); keep snapshot year only as fill.
        if not merged.get("release_date") and raw.get("release_date"):
            merged["release_date"] = raw["release_date"]
        if merged.get("year") is None and merged.get("release_date"):
            yr = str(merged["release_date"])[:4]
            if yr.isdigit():
                merged["year"] = yr
        tracks.append(merged)

    if is_snapshot:
        seen_paths: set[str] = set()
        deduped: list[dict] = []
        for track in tracks:
            if track.get("unavailable") or not track.get("play_path"):
                deduped.append(track)
                continue
            norm = normalize_play_path(track["play_path"])
            if norm in seen_paths:
                continue
            seen_paths.add(norm)
            deduped.append(track)
        tracks = deduped

    all_playlists = list_user_playlists(db, user_id=user_id, is_admin=is_admin)
    prev, nxt = _playlist_neighbors(all_playlists, playlist_id)

    custom_cover = resolve_playlist_cover_url(playlist)
    from app.playlist_snapshot import is_snapshot_playlist

    if is_snapshot_playlist(playlist):
        cover = custom_cover or DEFAULT_USER_PLAYLIST_COVER
    else:
        first = rows[0] if rows else None
        artist = (first.pld_artist.strip() if first else "") or None
        cover = custom_cover or pick_playlist_cover(artist, first.pld_release if first else None)
        if not cover:
            for t in tracks:
                if t.get("cover_url"):
                    cover = t["cover_url"]
                    break
        if not cover:
            cover = DEFAULT_USER_PLAYLIST_COVER

    return {
        "id": playlist.pla_id,
        "slug": str(playlist.pla_id),
        "name": playlist.pla_name or "Playlist",
        "description": playlist.pla_description,
        "cover_url": cover,
        "has_custom_cover": bool(custom_cover),
        "source": playlist.pla_source,
        "spotify_id": playlist.pla_spotify_id,
        "kind": playlist.pla_kind or "local",
        "editable": True,
        "tracks_editable": _tracks_editable(playlist),
        "snapshot_filters": is_snapshot,
        "tracks": tracks,
        "prev": prev,
        "next": nxt,
    }


def artists_by_genre(db: Session, genre_name: str, limit: int = 48) -> list[dict]:
    rows = db.scalars(select(Band).order_by(Band.bnd_name)).all()
    matched = []
    for b in rows:
        if any(n.lower() == genre_name.lower() for n in _genre_names(db, b.bnd_fk_subgenres)):
            matched.append(b)
    items = []
    for b in matched[:limit]:
        card = resolve_artist_card(b.bnd_name, orientation="landscape")
        items.append(
            {
                "id": b.bnd_id,
                "name": b.bnd_name,
                "photo_url": card.photo_url,
                "logo_url": card.logo_url,
                "icon_url": card.icon_url,
                "era_year": card.era_year,
                "show_name_on_hover": card.show_name_on_hover,
            }
        )
    return items
