"""Quiz payloads and per-profile score storage."""
from __future__ import annotations

import json
import random
import re
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.band_library import (
    AUDIO_EXTS,
    _collect_audio_files,
    _track_title_from_filename,
)
from app.release_tracklist import _track_number
from app.band_overview import _build_lineup, _is_solo
from app.config import settings
from app.gallery import _artist_dir
from app.media_index import get_audio_index, parse_bracket_tags
from app.media_paths_util import safe_relative
from app.models import Band
from app.paths import DATA_DIR
from app.system_playlists import EXCLUDE_ORIGINALS, _track_tags

QUIZ_SCORES_DIR = DATA_DIR / "quiz_scores"
ORIGINAL_CATEGORIES = ("albums", "extended_plays", "soundtracks")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_guess(text: str) -> str:
    import unicodedata

    t = text.casefold().strip()
    t = "".join(
        c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn"
    )
    t = t.replace("'", "").replace("'", "").replace("`", "")
    t = re.sub(r"\s+", " ", t)
    return t


def _matches_guess(guess: str, answer: str) -> bool:
    return _normalize_guess(guess) == _normalize_guess(answer)


def _scores_path(user_id: int, band_id: int) -> Path:
    QUIZ_SCORES_DIR.mkdir(parents=True, exist_ok=True)
    return QUIZ_SCORES_DIR / f"{user_id}_{band_id}.json"


def load_scores(user_id: int, band_id: int) -> dict:
    path = _scores_path(user_id, band_id)
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_score(
    user_id: int,
    band_id: int,
    *,
    quiz_type: str,
    score: int,
    total: int,
    time_ms: int,
) -> dict:
    data = load_scores(user_id, band_id)
    key = quiz_type
    prev = data.get(key, {})
    prev_best = prev.get("best_score", 0)
    new_best_score = max(prev_best, score)

    if score > prev_best:
        new_best_total = total
        new_best_time = time_ms
    elif score == prev_best:
        new_best_total = prev.get("best_total", total)
        prev_time = prev.get("best_time_ms", 0) or 0
        if score == total and total > 0:
            new_best_time = (
                min(prev_time, time_ms)
                if prev_time > 0
                else time_ms
            )
        else:
            new_best_time = prev_time or time_ms
    else:
        new_best_total = prev.get("best_total", total)
        new_best_time = prev.get("best_time_ms", time_ms)

    entry = {
        "last_score": score,
        "last_total": total,
        "last_time_ms": time_ms,
        "played_at": _now(),
        "best_score": new_best_score,
        "best_total": new_best_total,
        "best_time_ms": new_best_time,
    }
    data[key] = entry
    path = _scores_path(user_id, band_id)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return entry


def _tracks_in_release_folder(media_root: Path, folder_rel: str) -> list[dict]:
    folder = media_root / Path(folder_rel.replace("\\", "/"))
    if not folder.is_dir():
        return []
    files: list[Path] = []
    for path in folder.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in AUDIO_EXTS:
            continue
        if not _track_tags_ok_original(path.stem):
            continue
        files.append(path)
    files.sort(key=lambda p: (_track_number(p.name, 9999), p.name.lower()))
    tracks: list[dict] = []
    seen: set[str] = set()
    for path in files:
        title = _track_title_from_filename(path)
        key = title.casefold()
        if key in seen:
            continue
        seen.add(key)
        tracks.append(
            {"title": title, "number": _track_number(path.name, len(tracks) + 1)}
        )
    return tracks


def build_discography_quiz(db: Session, band_id: int) -> dict | None:
    band = db.get(Band, band_id)
    if not band or not settings.media_root:
        return None
    media_root = Path(settings.media_root)
    audio = get_audio_index(db, band, force=False)
    releases_out: list[dict] = []
    for rel in audio.get("releases") or []:
        if rel.get("category") not in ORIGINAL_CATEGORIES:
            continue
        if not rel.get("official", True):
            continue
        folder = rel.get("folder_path") or ""
        if not folder:
            continue
        tracks = _tracks_in_release_folder(media_root, folder)
        if not tracks:
            continue
        releases_out.append(
            {
                "id": rel.get("id"),
                "title": rel.get("title") or "",
                "cover_url": rel.get("cover_url"),
                "tracks": [{"title": t["title"], "number": t["number"], "hidden": True} for t in tracks],
            }
        )
    if not releases_out:
        return {"releases": [], "is_solo": _is_solo(db, band)}
    return {"releases": releases_out, "is_solo": _is_solo(db, band)}


def build_lineup_quiz(db: Session, band_id: int, media_root: Path) -> dict | None:
    band = db.get(Band, band_id)
    if not band:
        return None
    if _is_solo(db, band):
        return {"members": [], "disabled": True}
    lineup = _build_lineup(db, band, media_root)
    seen: set[str] = set()
    members: list[dict] = []
    for m in lineup.get("all") or []:
        name = (m.get("name") or "").strip()
        key = _normalize_guess(name)
        if not key or key in seen:
            continue
        seen.add(key)
        members.append(
            {
                "id": m.get("id"),
                "name": name,
                "photo_url": m.get("photo_url"),
                "years": m.get("years"),
                "roles": m.get("roles") or [],
                "is_deceased": bool(m.get("is_deceased")),
            }
        )
    return {"members": members, "disabled": False}


def _enrich_track_candidate(media_root: Path, audio_file: Path, title: str, path: str) -> dict:
    from app.band_library import _find_cover_front_artwork, _release_date_for_track

    track_dir = audio_file.parent
    return {
        "title": title,
        "play_path": path,
        "cover_url": _find_cover_front_artwork(track_dir, media_root),
        "release_date": _release_date_for_track(audio_file),
    }


def build_songs_quiz(db: Session, band_id: int, *, rounds: int = 10) -> dict | None:
    band = db.get(Band, band_id)
    if not band or not settings.media_root:
        return None
    media_root = Path(settings.media_root)
    artist_dir = _artist_dir(media_root, band.bnd_name)
    if not artist_dir:
        return {"question": None}
    candidates: list[dict] = []
    for audio_file in _collect_audio_files(artist_dir):
        if not _track_tags_ok_original(audio_file.stem):
            continue
        path = safe_relative(audio_file, media_root)
        if not path:
            continue
        candidates.append(
            _enrich_track_candidate(
                media_root,
                audio_file,
                _track_title_from_filename(audio_file),
                path,
            )
        )
    # One unique correct track per round; need at least 3 tracks to build choices.
    by_path: dict[str, dict] = {}
    for c in candidates:
        by_path.setdefault(c["play_path"], c)
    candidates = list(by_path.values())
    if len(candidates) < 3:
        return {"questions": [], "rounds": 0}

    # Cap rounds to available unique tracks (default 10 when library is large enough).
    rounds = max(1, min(rounds, len(candidates), 20))
    questions: list[dict] = []
    used: set[str] = set()

    for _ in range(rounds):
        pool = [c for c in candidates if c["play_path"] not in used]
        if not pool:
            break
        correct = random.choice(pool)
        used.add(correct["play_path"])
        distractors = [c for c in candidates if c["play_path"] != correct["play_path"]]
        random.shuffle(distractors)
        choice_pool: list[dict] = [correct]
        seen_paths = {correct["play_path"]}
        for pick in distractors:
            if pick["play_path"] in seen_paths:
                continue
            seen_paths.add(pick["play_path"])
            choice_pool.append(pick)
            if len(choice_pool) >= 3:
                break
        if len(choice_pool) < 3:
            continue
        random.shuffle(choice_pool)
        qidx = len(questions)
        questions.append(
            {
                "play_path": correct["play_path"],
                "correct_title": correct["title"],
                "choices": [
                    {
                        "id": f"{qidx}-{ci}",
                        "play_path": c["play_path"],
                        "title": c["title"],
                        "cover_url": c.get("cover_url"),
                        "release_date": c.get("release_date"),
                    }
                    for ci, c in enumerate(choice_pool[:3])
                ],
            }
        )

    return {"questions": questions, "rounds": len(questions)}


def _track_tags_ok_original(stem: str) -> bool:
    tags = _track_tags(stem)
    for tag in tags:
        if any(ex in tag for ex in EXCLUDE_ORIGINALS):
            return False
    return True


def check_discography_answers(
    releases: list[dict],
    answers: list[dict],
) -> tuple[int, int]:
    score = 0
    total = 0
    by_id = {r["id"]: r for r in releases}
    for ans in answers:
        rid = ans.get("release_id")
        rel = by_id.get(rid)
        if not rel:
            continue
        for track_ans in ans.get("tracks") or []:
            total += 1
            want = track_ans.get("expected") or ""
            got = track_ans.get("guess") or ""
            if want and _matches_guess(got, want):
                score += 1
    return score, total


def check_lineup_answers(members: list[dict], answers: list[dict]) -> tuple[int, int]:
    by_id = {m["id"]: m["name"] for m in members}
    score = 0
    total = 0
    for ans in answers:
        mid = ans.get("member_id")
        name = by_id.get(mid)
        if not name:
            continue
        total += 1
        if _matches_guess(ans.get("guess") or "", name):
            score += 1
    return score, total
