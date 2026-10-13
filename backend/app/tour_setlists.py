"""Match and cache setlist.fm data for tour shows."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Band, TourShow, TourShowSetlist
from app.services.setlistfm import (
    fold_artist_name,
    search_artists,
    search_setlists,
)
from app.setlist_playlists import (
    build_setlist_tracklist,
    load_artist_setlist_summaries,
    parse_show_summary,
)
from app.tours_index import _media_root, _stable_id

_VENUE_NORM_RE = re.compile(r"[^a-z0-9]+")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm(text: str | None) -> str:
    return _VENUE_NORM_RE.sub("", (text or "").casefold())


def _city_match_score(local_city: str | None, remote_city: str | None) -> int:
    """Score city match; tolerate ``State, City`` leftovers in older rows."""
    if not local_city or not remote_city:
        return 0
    a, b = _norm(local_city), _norm(remote_city)
    if not a or not b:
        return 0
    if a == b:
        return 40
    # "floridafortlauderdale" vs "fortlauderdale"
    if a in b or b in a:
        return 35
    # Compare last comma-separated segment of local city
    local_tail = _norm(local_city.split(",")[-1])
    if local_tail and (local_tail == b or local_tail in b or b in local_tail):
        return 35
    return 0


def _iso_to_setlist_date(date_iso: str | None) -> str | None:
    """YYYY-MM-DD → DD-MM-YYYY for setlist.fm search."""
    if not date_iso or len(date_iso) < 10:
        return None
    try:
        return datetime.strptime(date_iso[:10], "%Y-%m-%d").strftime("%d-%m-%Y")
    except ValueError:
        return None


def _enrich_cached_navigate_bands(db: Session, payload: dict) -> dict:
    """Fill missing navigate_band_id on cached setlist tracks from disk paths."""
    from app.media_index import _band_id_from_content_path
    from app.playlist_tracks import _audio_file_for_play_path, _resolve_track_source_labels

    root = _media_root()
    if not root:
        return payload

    def patch_track(track: dict) -> dict:
        if not isinstance(track, dict):
            return track
        if track.get("navigate_band_id") or not track.get("play_path"):
            return track
        out = dict(track)
        play_path = out["play_path"]
        _, release_rel = _resolve_track_source_labels(play_path, root)
        nav_band_id = None
        if release_rel:
            nav_band_id = _band_id_from_content_path(db, root, root / Path(release_rel))
        if not nav_band_id:
            audio_file = _audio_file_for_play_path(play_path, root)
            if audio_file:
                nav_band_id = _band_id_from_content_path(db, root, audio_file.parent)
        if nav_band_id:
            out["navigate_band_id"] = nav_band_id
        return out

    groups = payload.get("groups")
    if isinstance(groups, list):
        patched_groups = []
        for group in groups:
            if not isinstance(group, dict):
                patched_groups.append(group)
                continue
            g = dict(group)
            tracks = g.get("tracks")
            if isinstance(tracks, list):
                g["tracks"] = [patch_track(t) for t in tracks]
            patched_groups.append(g)
        payload = {**payload, "groups": patched_groups}

    tracks = payload.get("tracks")
    if isinstance(tracks, list):
        payload = {**payload, "tracks": [patch_track(t) for t in tracks]}
    return payload


def get_cached_show_setlist(db: Session, show_id: int) -> dict | None:
    row = (
        db.query(TourShowSetlist)
        .filter(TourShowSetlist.tss_show_id == show_id)
        .one_or_none()
    )
    if not row or not row.tss_tracks_json:
        return None
    try:
        tracks = json.loads(row.tss_tracks_json)
    except json.JSONDecodeError:
        return None
    payload = {
        "setlistfm_id": row.tss_setlistfm_id,
        "fetched_at": row.tss_fetched_at,
        "tracks": tracks.get("tracks") if isinstance(tracks, dict) else tracks,
        "groups": tracks.get("groups") if isinstance(tracks, dict) else None,
        "meta": tracks.get("meta") if isinstance(tracks, dict) else None,
        "empty": not bool(
            (tracks.get("tracks") if isinstance(tracks, dict) else tracks) or []
        ),
    }
    return _enrich_cached_navigate_bands(db, payload)


def _score_summary(show: TourShow, summary: dict) -> int:
    parsed = parse_show_summary(summary)
    if not parsed:
        return -1
    score = 0
    if show.tsh_date_iso and parsed.get("date_iso") == show.tsh_date_iso:
        score += 100
    elif show.tsh_date_iso and parsed.get("date_iso"):
        if show.tsh_date_iso[:7] == parsed["date_iso"][:7]:
            score += 20
        else:
            return -1
    score += _city_match_score(show.tsh_city, parsed.get("city"))
    if show.tsh_venue and _norm(show.tsh_venue) == _norm(parsed.get("venue")):
        score += 50
    elif show.tsh_venue and parsed.get("venue"):
        a, b = _norm(show.tsh_venue), _norm(parsed.get("venue"))
        if a in b or b in a:
            score += 25
    if show.tsh_country and _norm(show.tsh_country) == _norm(parsed.get("country")):
        score += 15
    return score


def _best_from_summaries(show: TourShow, summaries: list[dict]) -> tuple[str | None, int]:
    best_id: str | None = None
    best_score = 0
    for summary in summaries or []:
        score = _score_summary(show, summary)
        if score > best_score:
            best_score = score
            parsed = parse_show_summary(summary)
            best_id = parsed["id"] if parsed else None
    return best_id, best_score


def _search_show_setlists(band: Band, show: TourShow, *, api_key: str) -> list[dict]:
    """Targeted search: MBID+date, then folded / original artist name + date."""
    date_s = _iso_to_setlist_date(show.tsh_date_iso)
    if not date_s:
        return []
    mbid = (band.bnd_code or "").strip()
    city_tail = (show.tsh_city or "").split(",")[-1].strip() or None
    results: list[dict] = []
    seen: set[str] = set()

    def add_batch(batch: list[dict]) -> None:
        for item in batch:
            sid = (item.get("id") or "").strip()
            if sid and sid not in seen:
                seen.add(sid)
                results.append(item)

    if mbid and not mbid.startswith("local-"):
        add_batch(
            search_setlists(api_key=api_key, artist_mbid=mbid, date_dd_mm_yyyy=date_s)
        )
        if city_tail:
            add_batch(
                search_setlists(
                    api_key=api_key,
                    artist_mbid=mbid,
                    date_dd_mm_yyyy=date_s,
                    city_name=city_tail,
                )
            )

    names: list[str] = []
    raw_name = (band.bnd_name or "").strip()
    folded = fold_artist_name(raw_name)
    if raw_name:
        names.append(raw_name)
    if folded and folded.casefold() != raw_name.casefold():
        names.append(folded)

    # If MBID missing/local, resolve via artist search (accent-tolerant)
    if (not mbid or mbid.startswith("local-")) and names:
        for name in names:
            for artist in search_artists(api_key=api_key, artist_name=name):
                artist_mbid = (artist.get("mbid") or "").strip()
                if artist_mbid:
                    add_batch(
                        search_setlists(
                            api_key=api_key,
                            artist_mbid=artist_mbid,
                            date_dd_mm_yyyy=date_s,
                        )
                    )
                    break
            if results:
                break

    for name in names:
        add_batch(
            search_setlists(
                api_key=api_key, artist_name=name, date_dd_mm_yyyy=date_s
            )
        )
        if city_tail:
            add_batch(
                search_setlists(
                    api_key=api_key,
                    artist_name=name,
                    date_dd_mm_yyyy=date_s,
                    city_name=city_tail,
                )
            )

    return results


def match_setlistfm_id(
    db: Session,
    band: Band,
    show: TourShow,
    *,
    api_key: str,
    force: bool = False,
) -> str | None:
    if show.tsh_setlistfm_id and not force:
        return show.tsh_setlistfm_id
    if not api_key:
        return None

    # 1) Fast path: search/setlists by MBID (or folded name) + date
    search_hits = _search_show_setlists(band, show, api_key=api_key)
    best_id, best_score = _best_from_summaries(show, search_hits)

    # 2) Fallback: full artist setlist catalog (paginated)
    mbid = (band.bnd_code or "").strip()
    if best_score < 140 and mbid and not mbid.startswith("local-"):
        summaries = load_artist_setlist_summaries(
            band, api_key=api_key, force=force
        )
        cat_id, cat_score = _best_from_summaries(show, summaries or [])
        if cat_score > best_score:
            best_id, best_score = cat_id, cat_score

    if best_score >= 100 and best_id:
        show.tsh_setlistfm_id = best_id
        db.add(show)
        db.commit()
        return best_id
    return best_id if best_score >= 140 else None


def fetch_and_store_show_setlist(
    db: Session,
    band: Band,
    show: TourShow,
    *,
    api_key: str,
    force: bool = False,
) -> dict:
    """Resolve setlist.fm id, fetch tracks, cache on tour_show_setlists."""
    if not force:
        cached = get_cached_show_setlist(db, show.tsh_id)
        if cached is not None:
            return cached

    setlist_id = match_setlistfm_id(
        db, band, show, api_key=api_key, force=force
    )
    if not setlist_id or not api_key:
        empty = {
            "setlistfm_id": setlist_id,
            "fetched_at": _now(),
            "tracks": [],
            "groups": [],
            "meta": None,
            "empty": True,
        }
        _store(db, show.tsh_id, setlist_id, empty)
        return empty

    root = _media_root() or Path(".")
    tracklist = build_setlist_tracklist(db, band, root, setlist_id, api_key=api_key)
    if not tracklist:
        empty = {
            "setlistfm_id": setlist_id,
            "fetched_at": _now(),
            "tracks": [],
            "groups": [],
            "meta": None,
            "empty": True,
        }
        _store(db, show.tsh_id, setlist_id, empty)
        return empty

    # build_setlist_tracklist returns editions → groups → tracks
    groups: list[dict] = []
    flat: list[dict] = []
    for edition in tracklist.get("editions") or []:
        for group in edition.get("groups") or []:
            groups.append(group)
            flat.extend(group.get("tracks") or [])

    payload = {
        "setlistfm_id": setlist_id,
        "fetched_at": _now(),
        "tracks": flat,
        "groups": groups,
        "meta": {
            "venue": tracklist.get("venue"),
            "city": tracklist.get("city"),
            "tour_name": tracklist.get("tour_name"),
            "event_date": tracklist.get("show_date") or tracklist.get("display_date"),
        },
        "empty": not bool(flat),
    }
    show.tsh_setlistfm_id = setlist_id
    db.add(show)
    _store(db, show.tsh_id, setlist_id, payload)
    return payload


def _store(db: Session, show_id: int, setlist_id: str | None, payload: dict) -> None:
    row = (
        db.query(TourShowSetlist)
        .filter(TourShowSetlist.tss_show_id == show_id)
        .one_or_none()
    )
    if not row:
        row = TourShowSetlist(
            tss_id=_stable_id("setlist", str(show_id)),
            tss_show_id=show_id,
        )
        db.add(row)
    row.tss_setlistfm_id = setlist_id
    row.tss_tracks_json = json.dumps(payload, ensure_ascii=False)
    row.tss_fetched_at = payload.get("fetched_at") or _now()
    db.commit()
