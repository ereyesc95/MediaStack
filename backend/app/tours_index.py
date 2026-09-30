"""Scan Music/{Letter}/{Artist}/Tours/ and sync tour/show rows to the DB."""
from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.company_assets import company_logo_url
from app.config import settings
from app.franchise_index import parse_dated_folder_name, parse_folder_bracket_tags
from app.gallery import IMAGE_EXTS, _artist_dir, _media_url, _resolve_child_dir
from app.models import Band, Tour, TourShow, TourShowBill

ARTWORK_DIR = "[artwork]"
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi"}
HTML_EXTS = {".html", ".htm"}
DOC_EXTS = {".pdf"}

# 2024.06.01.A. Stadium Tour [By Main Artist]
_TOUR_OPENER_RE = re.compile(
    r"^(?P<date>\d{4}(?:\.\d{2}(?:\.\d{2})?)?)\.(?P<letter>[A-Za-z])\.\s*(?P<title>.+)$"
)
# 2024.07.12. Finland, Helsinki. Olympiastadion
_SHOW_FOLDER_RE = re.compile(
    r"^(?P<date>\d{4}(?:\.\d{2}(?:\.\d{2})?)?)\.\s*"
    r"(?P<country>[^,]+),\s*(?P<city>.+?)\.\s*(?P<venue>.+)$"
)
_BY_MAIN_RE = re.compile(r"\[By\s+([^\]]+)\]\s*$", re.I)
_ALBUM_STEM_RE = re.compile(r"^Album\s*[-–]\s*(.+)$", re.I)
# Promoter from Trailer - {Company}.mp4 (legacy: Video - {Company}.mp4)
_TRAILER_PROMOTER_RE = re.compile(r"^Trailer\s*[-–]\s*(.+)$", re.I)
_LEGACY_VIDEO_PROMOTER_RE = re.compile(r"^Video\s*[-–]\s*(.+)$", re.I)
_WEBSITE_TICKETER_RE = re.compile(r"^Website\s*[-–]\s*(.+)$", re.I)
_FRONT_BACK_RE = re.compile(r"^(.+?)\s*[-–]\s*(Front|Back)\s*$", re.I)
_RECAP_STEM_RE = re.compile(r"^Recap(?:\s*[-–]\s*.+)?$", re.I)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _media_root() -> Path | None:
    root = settings.media_root
    return Path(root) if root else None


def tours_root(artist_dir: Path) -> Path | None:
    root = _resolve_child_dir(artist_dir, "Tours")
    return root if root.is_dir() else None


def artist_has_tours(artist_dir: Path | None) -> bool:
    if not artist_dir:
        return False
    root = tours_root(artist_dir)
    if not root:
        return False
    try:
        for child in root.iterdir():
            if child.is_dir() and not child.name.startswith("."):
                return True
    except OSError:
        return False
    return False


def _date_dots_to_iso(raw: str) -> str | None:
    parts = raw.split(".")
    if not parts or not parts[0].isdigit():
        return None
    y = parts[0]
    mo = parts[1] if len(parts) > 1 else "01"
    d = parts[2] if len(parts) > 2 else "01"
    return f"{y}-{mo.zfill(2)}-{d.zfill(2)}"


def parse_tour_folder_name(folder_name: str) -> dict:
    """Parse tour folder → date, title, is_support, main_artist, opener_letter."""
    name = folder_name.strip()
    by_m = _BY_MAIN_RE.search(name)
    main_artist = by_m.group(1).strip() if by_m else None
    core = _BY_MAIN_RE.sub("", name).strip()
    opener_letter: str | None = None
    m = _TOUR_OPENER_RE.match(core)
    if m:
        date_iso = _date_dots_to_iso(m.group("date"))
        opener_letter = m.group("letter").upper()
        title = m.group("title").strip()
        title, _ = parse_folder_bracket_tags(title)
    else:
        date_iso, title = parse_dated_folder_name(core)
        title, _ = parse_folder_bracket_tags(title)
    return {
        "date_iso": date_iso,
        "title": title or core,
        "is_support": bool(main_artist),
        "main_artist_name": main_artist,
        "opener_letter": opener_letter,
    }


def parse_show_folder_name(folder_name: str) -> dict:
    """Parse show folder → date, country, city, venue, join_key."""
    name = folder_name.strip()
    m = _SHOW_FOLDER_RE.match(name)
    if m:
        date_iso = _date_dots_to_iso(m.group("date"))
        country = m.group("country").strip()
        city = m.group("city").strip()
        venue = m.group("venue").strip()
        return {
            "date_iso": date_iso,
            "country": country,
            "city": city,
            "venue": venue,
            "join_key": normalize_show_join_key(name),
        }
    date_iso, rest = parse_dated_folder_name(name)
    return {
        "date_iso": date_iso,
        "country": None,
        "city": None,
        "venue": rest or name,
        "join_key": normalize_show_join_key(name),
    }


def normalize_show_join_key(folder_name: str) -> str:
    """Cross-artist join key: casefold + whitespace normalize."""
    return re.sub(r"\s+", " ", folder_name.strip()).casefold()


def tour_slug(date_iso: str | None, title: str) -> str:
    base = (title or "tour").strip()
    slug = re.sub(r"[^a-z0-9]+", "-", base.casefold()).strip("-") or "tour"
    if date_iso:
        return f"{date_iso.replace('-', '')}-{slug}"
    return slug


def show_slug(date_iso: str | None, city: str | None, venue: str | None) -> str:
    parts = [p for p in (city, venue) if p]
    base = " ".join(parts) or "show"
    slug = re.sub(r"[^a-z0-9]+", "-", base.casefold()).strip("-") or "show"
    if date_iso:
        return f"{date_iso.replace('-', '')}-{slug}"
    return slug


def _subdir(folder: Path, name: str) -> Path | None:
    p = _resolve_child_dir(folder, name)
    return p if p.is_dir() else None


def _find_image_stem(folder: Path, stem: str) -> Path | None:
    if not folder.is_dir():
        return None
    want = stem.casefold()
    try:
        for f in folder.iterdir():
            if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
                continue
            if f.stem.casefold() == want:
                return f
    except OSError:
        return None
    return None


def _list_prefixed_images(folder: Path, prefix: str) -> list[Path]:
    """Main `{prefix}.*` first, then `{prefix} - *`."""
    if not folder.is_dir():
        return []
    main: list[Path] = []
    extras: list[Path] = []
    pref = prefix.casefold()
    pref_dash = f"{pref} - "
    try:
        for f in sorted(folder.iterdir(), key=lambda p: p.name.casefold()):
            if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
                continue
            stem = f.stem.casefold()
            if stem == pref:
                main.append(f)
            elif stem.startswith(pref_dash):
                extras.append(f)
    except OSError:
        return []
    return main + extras


def _artwork_url(folder: Path | None, stem: str, media_root: Path) -> str | None:
    if not folder:
        return None
    found = _find_image_stem(folder, stem)
    return _media_url(found, media_root) if found else None


def _dir_has_media(folder: Path | None) -> bool:
    if not folder or not folder.is_dir():
        return False
    media_exts = IMAGE_EXTS | VIDEO_EXTS | HTML_EXTS | DOC_EXTS
    try:
        for f in folder.iterdir():
            if f.is_file() and f.suffix.lower() in media_exts:
                return True
    except OSError:
        return False
    return False


def _parse_promoter(promo: Path | None) -> str | None:
    """Promoter company from ``Trailer - {Company}`` (legacy ``Video -`` still accepted)."""
    if not promo or not promo.is_dir():
        return None
    legacy: str | None = None
    try:
        for f in sorted(promo.iterdir(), key=lambda p: p.name.casefold()):
            if not f.is_file() or f.suffix.lower() not in VIDEO_EXTS:
                continue
            m = _TRAILER_PROMOTER_RE.match(f.stem)
            if m:
                return m.group(1).strip()
            if legacy is None:
                m2 = _LEGACY_VIDEO_PROMOTER_RE.match(f.stem)
                if m2:
                    legacy = m2.group(1).strip()
    except OSError:
        return None
    return legacy


def _parse_ticketer(promo: Path | None) -> str | None:
    if not promo or not promo.is_dir():
        return None
    try:
        for f in promo.iterdir():
            if not f.is_file() or f.suffix.lower() not in HTML_EXTS:
                continue
            m = _WEBSITE_TICKETER_RE.match(f.stem)
            if m:
                return m.group(1).strip()
    except OSError:
        return None
    return None


def _parse_album_art(artwork: Path | None, media_root: Path) -> tuple[str | None, str | None]:
    if not artwork or not artwork.is_dir():
        return None, None
    try:
        for f in artwork.iterdir():
            if not f.is_file() or f.suffix.lower() not in IMAGE_EXTS:
                continue
            m = _ALBUM_STEM_RE.match(f.stem)
            if m:
                return m.group(1).strip(), _media_url(f, media_root)
    except OSError:
        return None, None
    return None, None


def _is_recap_stem(stem: str) -> bool:
    return bool(_RECAP_STEM_RE.match((stem or "").strip()))


def _has_recording(gallery: Path | None) -> bool:
    """True when Gallery has ``Video.*`` (full) and/or ``Recap*.*`` clips."""
    if not gallery or not gallery.is_dir():
        return False
    try:
        for f in gallery.iterdir():
            if not f.is_file() or f.suffix.lower() not in VIDEO_EXTS:
                continue
            stem = f.stem
            if stem.casefold() == "video" or _is_recap_stem(stem):
                return True
    except OSError:
        return False
    return False


def _find_peer_show_dirs(
    media_root: Path,
    artist_name: str,
    join_key: str,
    *,
    headlining_only: bool = True,
) -> tuple[Path | None, Path | None]:
    """Locate ``(tour_dir, show_dir)`` under an artist's Tours matching join_key."""
    artist_dir = _artist_dir(media_root, artist_name)
    root = tours_root(artist_dir) if artist_dir else None
    if not root:
        return None, None
    want = (join_key or "").strip().casefold()
    if not want:
        return None, None
    try:
        for tour_dir in sorted(root.iterdir(), key=lambda p: p.name.casefold()):
            if not tour_dir.is_dir() or tour_dir.name.startswith("."):
                continue
            meta = parse_tour_folder_name(tour_dir.name)
            if headlining_only and meta.get("is_support"):
                continue
            try:
                children = list(tour_dir.iterdir())
            except OSError:
                continue
            for show_dir in children:
                if not show_dir.is_dir() or show_dir.name.startswith("."):
                    continue
                if show_dir.name.casefold() in (ARTWORK_DIR, "artwork"):
                    continue
                if normalize_show_join_key(show_dir.name) == want:
                    return tour_dir, show_dir
    except OSError:
        return None, None
    return None, None


def _merge_media_items(primary: list[dict], fallback: list[dict]) -> list[dict]:
    """Keep local items; append fallback entries whose label is not already present."""
    seen = {(i.get("label") or "").casefold() for i in primary if i.get("label")}
    seen_ids = {i.get("id") for i in primary if i.get("id")}
    out = list(primary)
    for item in fallback:
        label_key = (item.get("label") or "").casefold()
        if label_key and label_key in seen:
            continue
        if not label_key and item.get("id") in seen_ids:
            continue
        out.append(item)
        if label_key:
            seen.add(label_key)
        if item.get("id"):
            seen_ids.add(item.get("id"))
    return out


def _gallery_recording_links(gallery_items: list[dict]) -> list[dict]:
    """Full ``Video`` + ``Recap`` / ``Recap - …`` clips for the setlist panel."""
    out: list[dict] = []
    for g in gallery_items:
        if g.get("kind") != "video" or not g.get("url"):
            continue
        label = (g.get("label") or "").strip()
        cf = label.casefold()
        if cf == "video":
            out.append({"label": "Full recording", "url": g["url"], "kind": "full"})
        elif _is_recap_stem(label):
            display = "Recap" if cf == "recap" else label
            out.append({"label": display, "url": g["url"], "kind": "recap"})
    return out


def _pick_labeled_item(items: list[dict], *names: str) -> dict | None:
    want = {n.casefold() for n in names}
    for item in items:
        if (item.get("label") or "").casefold() in want:
            return item
    return None


def _stable_id(*parts: str) -> int:
    """Positive int id from path parts (stable across scans)."""
    h = hashlib.md5("|".join(parts).encode("utf-8")).hexdigest()
    return int(h[:15], 16) % (10**12) + 1


def scan_tours_on_disk(band: Band, media_root: Path) -> list[dict]:
    """Return tour dicts with nested shows (filesystem only, no DB write)."""
    artist_dir = _artist_dir(media_root, band.bnd_name)
    root = tours_root(artist_dir) if artist_dir else None
    if not root:
        return []
    tours: list[dict] = []
    try:
        children = sorted(root.iterdir(), key=lambda p: p.name.casefold())
    except OSError:
        return []
    for tour_dir in children:
        if not tour_dir.is_dir() or tour_dir.name.startswith("."):
            continue
        meta = parse_tour_folder_name(tour_dir.name)
        artwork = _subdir(tour_dir, "[Artwork]") or _subdir(tour_dir, "Artwork")
        poster = _artwork_url(artwork, "Poster", media_root)
        banner = _artwork_url(artwork, "Banner", media_root) or poster
        logo = _artwork_url(artwork, "Logo", media_root)
        album_title, album_cover = _parse_album_art(artwork, media_root)
        # Opener tours: fall back to main act tour [Artwork] when local art is sparse/missing
        main_tour_cache: Path | None = None
        main_show_cache: dict[str, Path | None] = {}
        if meta.get("is_support") and meta.get("main_artist_name"):
            # Resolve main tour via first matching show later; tour art filled after shows scan
            pass
        shows: list[dict] = []
        try:
            show_dirs = sorted(tour_dir.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            show_dirs = []
        for show_dir in show_dirs:
            if not show_dir.is_dir() or show_dir.name.startswith("."):
                continue
            if show_dir.name.casefold() in (ARTWORK_DIR, "artwork"):
                continue
            sm = parse_show_folder_name(show_dir.name)
            promo = _subdir(show_dir, "Promo")
            gallery = _subdir(show_dir, "Gallery")
            souvenirs = _subdir(show_dir, "Souvenirs")
            show_posters = _list_prefixed_images(promo, "Poster") if promo else []
            show_banners = _list_prefixed_images(promo, "Banner") if promo else []
            poster_url = _media_url(show_posters[0], media_root) if show_posters else None
            banner_url = (
                _media_url(show_banners[0], media_root)
                if show_banners
                else (_media_url(show_posters[0], media_root) if show_posters else None)
            )
            promoter = _parse_promoter(promo)
            ticketer = _parse_ticketer(promo)
            has_promo = _dir_has_media(promo)
            # Opener → main-act Promo fallback for missing poster/banner/companies
            if meta.get("is_support") and meta.get("main_artist_name"):
                join_key = sm.get("join_key") or ""
                if join_key not in main_show_cache:
                    mt, ms = _find_peer_show_dirs(
                        media_root,
                        meta["main_artist_name"],
                        join_key,
                        headlining_only=True,
                    )
                    if mt is not None:
                        main_tour_cache = mt
                    main_show_cache[join_key] = ms
                main_show = main_show_cache.get(join_key)
                if main_show is not None:
                    main_promo = _subdir(main_show, "Promo")
                    if not show_posters and main_promo:
                        mp = _list_prefixed_images(main_promo, "Poster")
                        if mp:
                            poster_url = _media_url(mp[0], media_root)
                    if not show_banners and main_promo:
                        mb = _list_prefixed_images(main_promo, "Banner")
                        if mb:
                            banner_url = _media_url(mb[0], media_root)
                        elif not banner_url and poster_url:
                            banner_url = poster_url
                    if not promoter:
                        promoter = _parse_promoter(main_promo)
                    if not ticketer:
                        ticketer = _parse_ticketer(main_promo)
                    if not has_promo:
                        has_promo = _dir_has_media(main_promo)
            shows.append(
                {
                    "folder_path": show_dir.resolve().relative_to(media_root.resolve()).as_posix(),
                    "folder_name": show_dir.name,
                    **sm,
                    "poster_url": poster_url,
                    "banner_url": banner_url or poster_url,
                    "promoter": promoter,
                    "ticketer": ticketer,
                    "has_promo": has_promo,
                    "has_gallery": _dir_has_media(gallery),
                    "has_souvenirs": _dir_has_media(souvenirs),
                    "has_recording": _has_recording(gallery),
                    "slug": show_slug(sm.get("date_iso"), sm.get("city"), sm.get("venue")),
                }
            )
        if not shows:
            continue
        # Fill tour artwork from main act when opener [Artwork] is missing/partial
        if meta.get("is_support") and meta.get("main_artist_name") and main_tour_cache:
            main_art = (
                _subdir(main_tour_cache, "[Artwork]")
                or _subdir(main_tour_cache, "Artwork")
            )
            if main_art:
                if not poster:
                    poster = _artwork_url(main_art, "Poster", media_root)
                if not banner or banner == poster:
                    banner = (
                        _artwork_url(main_art, "Banner", media_root) or poster or banner
                    )
                if not logo:
                    logo = _artwork_url(main_art, "Logo", media_root)
                if not album_title:
                    album_title, album_cover = _parse_album_art(main_art, media_root)
        rel = tour_dir.resolve().relative_to(media_root.resolve()).as_posix()
        tours.append(
            {
                "folder_path": rel,
                "folder_name": tour_dir.name,
                **meta,
                "poster_url": poster,
                "banner_url": banner,
                "logo_url": logo,
                "album_title": album_title,
                "album_cover_url": album_cover,
                "slug": tour_slug(meta.get("date_iso"), meta.get("title") or ""),
                "show_count": len(shows),
                "shows": shows,
            }
        )
    tours.sort(key=lambda t: (t.get("date_iso") or "9999", t.get("title") or ""))
    return tours


def _sync_bills_for_show(db: Session, show: TourShow, tour: Tour, band: Band, now: str) -> None:
    """Rebuild bill rows for a show from this tour + join_key peers."""
    db.execute(delete(TourShowBill).where(TourShowBill.tsb_show_id == show.tsh_id))
    bills: list[tuple[str, str, str | None, int | None]] = []
    # (artist_name, role, opener_order, band_id)

    if tour.tur_is_support:
        main_name = (tour.tur_main_artist_name or "").strip()
        if main_name:
            main_band = db.scalar(select(Band).where(Band.bnd_name == main_name).limit(1))
            bills.append((main_name, "main", None, main_band.bnd_id if main_band else None))
        bills.append(
            (
                band.bnd_name or "Artist",
                "support",
                tour.tur_opener_letter,
                band.bnd_id,
            )
        )
    else:
        bills.append((band.bnd_name or "Artist", "main", None, band.bnd_id))
        peers = db.scalars(
            select(TourShow).where(
                TourShow.tsh_join_key == show.tsh_join_key,
                TourShow.tsh_id != show.tsh_id,
            )
        ).all()
        for peer in peers:
            peer_tour = db.get(Tour, peer.tsh_tour_id)
            if not peer_tour or not peer_tour.tur_is_support:
                continue
            peer_band = db.get(Band, peer.tsh_band_id)
            name = peer_band.bnd_name if peer_band else f"Band {peer.tsh_band_id}"
            bills.append(
                (
                    name or "Support",
                    "support",
                    peer_tour.tur_opener_letter,
                    peer.tsh_band_id,
                )
            )

    for artist_name, role, opener_order, band_id in bills:
        bid = _stable_id("bill", str(show.tsh_id), role, artist_name, opener_order or "")
        db.add(
            TourShowBill(
                tsb_id=bid,
                tsb_show_id=show.tsh_id,
                tsb_band_id=band_id,
                tsb_artist_name=artist_name,
                tsb_role=role,
                tsb_opener_order=opener_order,
                tsb_synced_at=now,
            )
        )


def sync_all_band_tours(db: Session, media_root: Path | None = None) -> dict:
    """Rescan Tours for every band that has disk Tours and/or DB tour rows (purge orphans)."""
    root = media_root or _media_root()
    if not root:
        return {"ok": False, "error": "media_root not configured", "bands": 0, "tours": 0, "shows": 0}

    band_ids: set[int] = set()
    music = root / "Music"
    if music.is_dir():
        try:
            for letter_dir in music.iterdir():
                if not letter_dir.is_dir():
                    continue
                for artist_dir in letter_dir.iterdir():
                    if not artist_dir.is_dir():
                        continue
                    if not artist_has_tours(artist_dir):
                        continue
                    band = db.scalar(
                        select(Band).where(Band.bnd_name == artist_dir.name).limit(1)
                    )
                    if band:
                        band_ids.add(band.bnd_id)
        except OSError:
            pass

    for bid in db.scalars(select(Tour.tur_band_id).distinct()).all():
        if bid:
            band_ids.add(int(bid))
    for bid in db.scalars(select(TourShow.tsh_band_id).distinct()).all():
        if bid:
            band_ids.add(int(bid))

    tours_n = 0
    shows_n = 0
    for bid in sorted(band_ids):
        band = db.get(Band, bid)
        if not band:
            continue
        result = sync_band_tours(db, band)
        tours_n += int(result.get("tours") or 0)
        shows_n += int(result.get("shows") or 0)
    return {"ok": True, "bands": len(band_ids), "tours": tours_n, "shows": shows_n}


def sync_band_tours(db: Session, band: Band) -> dict:
    """Scan disk and upsert Tour / TourShow rows for this band."""
    root = _media_root()
    if not root:
        return {"ok": False, "error": "media_root not configured", "tours": 0, "shows": 0}
    scanned = scan_tours_on_disk(band, root)
    now = _now()
    keep_tour_ids: set[int] = set()
    keep_show_ids: set[int] = set()
    for t in scanned:
        tid = _stable_id("tour", str(band.bnd_id), t["folder_path"])
        keep_tour_ids.add(tid)
        row = db.get(Tour, tid)
        if not row:
            row = Tour(tur_id=tid, tur_band_id=band.bnd_id, tur_folder_path=t["folder_path"])
            db.add(row)
        row.tur_band_id = band.bnd_id
        row.tur_folder_path = t["folder_path"]
        row.tur_date_iso = t.get("date_iso")
        row.tur_title = t.get("title") or t["folder_name"]
        row.tur_is_support = 1 if t.get("is_support") else 0
        row.tur_main_artist_name = t.get("main_artist_name")
        row.tur_opener_letter = t.get("opener_letter")
        row.tur_poster_url = t.get("poster_url")
        row.tur_banner_url = t.get("banner_url")
        row.tur_logo_url = t.get("logo_url")
        row.tur_album_title = t.get("album_title")
        row.tur_album_cover_url = t.get("album_cover_url")
        row.tur_synced_at = now
        for s in t.get("shows") or []:
            sid = _stable_id("show", str(band.bnd_id), s["folder_path"])
            keep_show_ids.add(sid)
            show = db.get(TourShow, sid)
            if not show:
                show = TourShow(
                    tsh_id=sid,
                    tsh_tour_id=tid,
                    tsh_band_id=band.bnd_id,
                    tsh_folder_path=s["folder_path"],
                    tsh_join_key=s["join_key"],
                )
                db.add(show)
            show.tsh_tour_id = tid
            show.tsh_band_id = band.bnd_id
            show.tsh_folder_path = s["folder_path"]
            show.tsh_join_key = s["join_key"]
            show.tsh_date_iso = s.get("date_iso")
            show.tsh_country = s.get("country")
            show.tsh_city = s.get("city")
            show.tsh_venue = s.get("venue")
            show.tsh_poster_url = s.get("poster_url")
            show.tsh_banner_url = s.get("banner_url")
            show.tsh_promoter = s.get("promoter")
            show.tsh_ticketer = s.get("ticketer")
            show.tsh_has_promo = 1 if s.get("has_promo") else 0
            show.tsh_has_gallery = 1 if s.get("has_gallery") else 0
            show.tsh_has_souvenirs = 1 if s.get("has_souvenirs") else 0
            show.tsh_has_recording = 1 if s.get("has_recording") else 0
            show.tsh_synced_at = now

    existing_tours = db.scalars(select(Tour).where(Tour.tur_band_id == band.bnd_id)).all()
    for row in existing_tours:
        if row.tur_id not in keep_tour_ids:
            show_ids = [
                s.tsh_id
                for s in db.scalars(select(TourShow).where(TourShow.tsh_tour_id == row.tur_id)).all()
            ]
            if show_ids:
                db.execute(delete(TourShowBill).where(TourShowBill.tsb_show_id.in_(show_ids)))
            db.execute(delete(TourShow).where(TourShow.tsh_tour_id == row.tur_id))
            db.delete(row)
    existing_shows = db.scalars(select(TourShow).where(TourShow.tsh_band_id == band.bnd_id)).all()
    for row in existing_shows:
        if row.tsh_id not in keep_show_ids:
            db.execute(delete(TourShowBill).where(TourShowBill.tsb_show_id == row.tsh_id))
            db.delete(row)

    db.flush()
    # Rebuild bills for remaining shows
    for sid in keep_show_ids:
        show = db.get(TourShow, sid)
        if not show:
            continue
        tour = db.get(Tour, show.tsh_tour_id)
        if tour:
            _sync_bills_for_show(db, show, tour, band, now)

    db.commit()
    return {"ok": True, "tours": len(keep_tour_ids), "shows": len(keep_show_ids)}


def list_tour_cards(db: Session, band: Band, *, sync: bool = True) -> list[dict]:
    """Tour cards for the artist Tours grid (only tours with ≥1 show)."""
    if sync:
        sync_band_tours(db, band)
    rows = db.scalars(
        select(Tour).where(Tour.tur_band_id == band.bnd_id).order_by(Tour.tur_date_iso.asc())
    ).all()
    out: list[dict] = []
    for t in rows:
        shows = db.scalars(
            select(TourShow)
            .where(TourShow.tsh_tour_id == t.tur_id)
            .order_by(TourShow.tsh_date_iso.asc())
        ).all()
        if not shows:
            continue
        out.append(
            {
                "id": t.tur_id,
                "slug": tour_slug(t.tur_date_iso, t.tur_title),
                "title": t.tur_title,
                "date_iso": t.tur_date_iso,
                "is_support": bool(t.tur_is_support),
                "main_artist_name": t.tur_main_artist_name,
                "opener_letter": t.tur_opener_letter,
                "poster_url": t.tur_poster_url,
                "banner_url": t.tur_banner_url or t.tur_poster_url,
                "logo_url": t.tur_logo_url,
                "album_title": t.tur_album_title,
                "album_cover_url": t.tur_album_cover_url,
                "show_count": len(shows),
                "folder_path": t.tur_folder_path,
            }
        )
    return out


def _show_payload(db: Session, s: TourShow) -> dict:
    bills = db.scalars(
        select(TourShowBill)
        .where(TourShowBill.tsb_show_id == s.tsh_id)
        .order_by(TourShowBill.tsb_role.asc(), TourShowBill.tsb_opener_order.asc())
    ).all()
    return {
        "id": s.tsh_id,
        "slug": show_slug(s.tsh_date_iso, s.tsh_city, s.tsh_venue),
        "date_iso": s.tsh_date_iso,
        "country": s.tsh_country,
        "city": s.tsh_city,
        "venue": s.tsh_venue,
        "join_key": s.tsh_join_key,
        "poster_url": s.tsh_poster_url,
        "banner_url": s.tsh_banner_url or s.tsh_poster_url,
        "promoter": s.tsh_promoter,
        "ticketer": s.tsh_ticketer,
        "promoter_logo_url": company_logo_url(s.tsh_promoter),
        "ticketer_logo_url": company_logo_url(s.tsh_ticketer),
        "venue_logo_url": company_logo_url(s.tsh_venue),
        "setlistfm_id": s.tsh_setlistfm_id,
        "has_promo": bool(s.tsh_has_promo),
        "has_gallery": bool(s.tsh_has_gallery),
        "has_souvenirs": bool(s.tsh_has_souvenirs),
        "has_recording": bool(s.tsh_has_recording),
        "folder_path": s.tsh_folder_path,
        "bill": [
            {
                "artist_name": b.tsb_artist_name,
                "role": b.tsb_role,
                "opener_order": b.tsb_opener_order,
                "band_id": b.tsb_band_id,
            }
            for b in bills
        ],
    }


def get_tour_detail(
    db: Session,
    band: Band,
    tour_key: str,
    *,
    sync: bool = False,
) -> dict | None:
    """Load one tour + shows by numeric id or slug."""
    if sync:
        sync_band_tours(db, band)
    tour: Tour | None = None
    if tour_key.isdigit():
        tour = db.get(Tour, int(tour_key))
        if tour and tour.tur_band_id != band.bnd_id:
            tour = None
    if not tour:
        cards = list_tour_cards(db, band, sync=False)
        match = next((c for c in cards if c["slug"] == tour_key or str(c["id"]) == tour_key), None)
        if match:
            tour = db.get(Tour, match["id"])
    if not tour:
        return None
    shows = db.scalars(
        select(TourShow)
        .where(TourShow.tsh_tour_id == tour.tur_id)
        .order_by(TourShow.tsh_date_iso.asc())
    ).all()
    show_payload = [_show_payload(db, s) for s in shows]
    cards = list_tour_cards(db, band, sync=False)
    idx = next((i for i, c in enumerate(cards) if c["id"] == tour.tur_id), -1)
    prev_tour = cards[idx - 1] if idx > 0 else None
    next_tour = cards[idx + 1] if 0 <= idx < len(cards) - 1 else None
    return {
        "id": tour.tur_id,
        "slug": tour_slug(tour.tur_date_iso, tour.tur_title),
        "title": tour.tur_title,
        "date_iso": tour.tur_date_iso,
        "is_support": bool(tour.tur_is_support),
        "main_artist_name": tour.tur_main_artist_name,
        "opener_letter": tour.tur_opener_letter,
        "poster_url": tour.tur_poster_url,
        "banner_url": tour.tur_banner_url or tour.tur_poster_url,
        "logo_url": tour.tur_logo_url,
        "album_title": tour.tur_album_title,
        "album_cover_url": tour.tur_album_cover_url,
        "folder_path": tour.tur_folder_path,
        "shows": show_payload,
        "prev_tour": (
            {"id": prev_tour["id"], "slug": prev_tour["slug"], "title": prev_tour["title"]}
            if prev_tour
            else None
        ),
        "next_tour": (
            {"id": next_tour["id"], "slug": next_tour["slug"], "title": next_tour["title"]}
            if next_tour
            else None
        ),
    }


def pair_front_back_files(files: list[Path]) -> list[dict]:
    """Group Front/Back pairs; unpaired files are single-sided."""
    fronts: dict[str, Path] = {}
    backs: dict[str, Path] = {}
    singles: list[Path] = []
    for f in files:
        m = _FRONT_BACK_RE.match(f.stem)
        if not m:
            singles.append(f)
            continue
        key = m.group(1).strip().casefold()
        side = m.group(2).casefold()
        if side == "front":
            fronts[key] = f
        else:
            backs[key] = f
    out: list[dict] = []
    seen: set[str] = set()
    for key, front in fronts.items():
        seen.add(key)
        label = _FRONT_BACK_RE.sub(r"\1", front.stem).strip()
        out.append(
            {
                "id": key,
                "label": label,
                "front_path": front,
                "back_path": backs.get(key),
            }
        )
    for key, back in backs.items():
        if key in seen:
            continue
        out.append(
            {
                "id": key,
                "label": _FRONT_BACK_RE.sub(r"\1", back.stem).strip(),
                "front_path": back,
                "back_path": None,
            }
        )
    for f in singles:
        out.append(
            {
                "id": f.stem.casefold(),
                "label": f.stem,
                "front_path": f,
                "back_path": None,
            }
        )
    return out


def _list_folder_files(folder: Path | None) -> list[Path]:
    if not folder or not folder.is_dir():
        return []
    try:
        return sorted(
            [f for f in folder.iterdir() if f.is_file()],
            key=lambda p: p.name.casefold(),
        )
    except OSError:
        return []


def list_show_folder_items(
    media_root: Path,
    show_folder_path: str,
    subdir: str,
) -> list[dict]:
    """List Promo / Gallery / Souvenirs items with Front/Back pairing for images."""
    show_dir = (media_root / show_folder_path).resolve()
    if not show_dir.is_dir():
        return []
    folder = _subdir(show_dir, subdir)
    files = _list_folder_files(folder)
    images = [f for f in files if f.suffix.lower() in IMAGE_EXTS]
    others = [f for f in files if f.suffix.lower() not in IMAGE_EXTS]
    items: list[dict] = []
    for pair in pair_front_back_files(images):
        front = pair["front_path"]
        back = pair.get("back_path")
        items.append(
            {
                "id": pair["id"],
                "label": pair["label"],
                "kind": "image",
                "url": _media_url(front, media_root),
                "back_url": _media_url(back, media_root) if back else None,
                "has_back": bool(back),
            }
        )
    for f in others:
        kind = "video" if f.suffix.lower() in VIDEO_EXTS else "file"
        items.append(
            {
                "id": f.stem.casefold(),
                "label": f.stem,
                "kind": kind,
                "url": _media_url(f, media_root),
                "back_url": None,
                "has_back": False,
            }
        )
    return items


def get_show_detail(
    db: Session,
    band: Band,
    tour_key: str,
    show_key: str,
    *,
    sync: bool = False,
) -> dict | None:
    tour = get_tour_detail(db, band, tour_key, sync=sync)
    if not tour:
        return None
    show = next(
        (s for s in tour["shows"] if s["slug"] == show_key or str(s["id"]) == show_key),
        None,
    )
    if not show:
        return None
    root = _media_root()
    promo: list[dict] = []
    gallery: list[dict] = []
    souvenirs: list[dict] = []
    main_promo: list[dict] = []
    if root and show.get("folder_path"):
        promo = list_show_folder_items(root, show["folder_path"], "Promo")
        gallery = list_show_folder_items(root, show["folder_path"], "Gallery")
        souvenirs = list_show_folder_items(root, show["folder_path"], "Souvenirs")
        # Opener show: merge main-act Promo (+ tour art already coalesced at scan)
        if tour.get("is_support") and tour.get("main_artist_name") and show.get("join_key"):
            _mt, main_show = _find_peer_show_dirs(
                root,
                tour["main_artist_name"],
                show["join_key"],
                headlining_only=True,
            )
            if main_show is not None:
                try:
                    main_rel = main_show.resolve().relative_to(root.resolve()).as_posix()
                except ValueError:
                    main_rel = None
                if main_rel:
                    main_promo = list_show_folder_items(root, main_rel, "Promo")
                    promo = _merge_media_items(promo, main_promo)
                    # Fill company fields on the live show payload if still empty
                    if not show.get("promoter"):
                        p = _parse_promoter(_subdir(main_show, "Promo"))
                        if p:
                            show = {**show, "promoter": p, "promoter_logo_url": company_logo_url(p)}
                    if not show.get("ticketer"):
                        t = _parse_ticketer(_subdir(main_show, "Promo"))
                        if t:
                            show = {**show, "ticketer": t, "ticketer_logo_url": company_logo_url(t)}
                    if not show.get("poster_url") or not show.get("banner_url"):
                        mp = _subdir(main_show, "Promo")
                        posters = _list_prefixed_images(mp, "Poster") if mp else []
                        banners = _list_prefixed_images(mp, "Banner") if mp else []
                        patch: dict = {}
                        if not show.get("poster_url") and posters:
                            patch["poster_url"] = _media_url(posters[0], root)
                        if not show.get("banner_url"):
                            if banners:
                                patch["banner_url"] = _media_url(banners[0], root)
                            elif patch.get("poster_url") or show.get("poster_url"):
                                patch["banner_url"] = patch.get("poster_url") or show.get(
                                    "poster_url"
                                )
                        if patch:
                            show = {**show, **patch}
                    if main_promo and not show.get("has_promo"):
                        show = {**show, "has_promo": True}
            # Tour-level artwork fallback from main tour [Artwork]
            if _mt is not None:
                main_art = _subdir(_mt, "[Artwork]") or _subdir(_mt, "Artwork")
                if main_art:
                    tpatch: dict = {}
                    if not tour.get("poster_url"):
                        tpatch["poster_url"] = _artwork_url(main_art, "Poster", root)
                    if not tour.get("banner_url"):
                        tpatch["banner_url"] = (
                            _artwork_url(main_art, "Banner", root)
                            or tpatch.get("poster_url")
                            or tour.get("poster_url")
                        )
                    if not tour.get("logo_url"):
                        tpatch["logo_url"] = _artwork_url(main_art, "Logo", root)
                    if not tour.get("album_title"):
                        at, ac = _parse_album_art(main_art, root)
                        if at:
                            tpatch["album_title"] = at
                            tpatch["album_cover_url"] = ac
                    if tpatch:
                        tour = {**tour, **tpatch}
    shows = tour["shows"]
    idx = next((i for i, s in enumerate(shows) if s["id"] == show["id"]), -1)

    # Overview columns: ticket pair + setlist images/PDFs from Souvenirs
    tickets = [
        s
        for s in souvenirs
        if "ticket" in (s.get("label") or "").casefold()
    ]
    setlist_files = [
        s
        for s in souvenirs
        if (s.get("label") or "").casefold().startswith("setlist")
    ]
    playlist_code = _pick_labeled_item(souvenirs, "Playlist")
    qr_code = _pick_labeled_item(gallery, "QR")
    recordings = _gallery_recording_links(gallery)
    recording_url = next(
        (r["url"] for r in recordings if r.get("kind") == "full"),
        recordings[0]["url"] if recordings else None,
    )

    album = _match_supported_album(db, band, tour.get("album_title"), root)
    lineup = _lineup_for_show_date(db, band, show.get("date_iso"), root)

    # Auto-resolve setlist from cache if present
    setlist_payload = None
    try:
        from app.tour_setlists import get_cached_show_setlist

        setlist_payload = get_cached_show_setlist(db, show["id"])
    except Exception:
        setlist_payload = None

    return {
        "tour": {
            "id": tour["id"],
            "slug": tour["slug"],
            "title": tour["title"],
            "date_iso": tour["date_iso"],
            "is_support": tour["is_support"],
            "main_artist_name": tour["main_artist_name"],
            "poster_url": tour["poster_url"],
            "banner_url": tour["banner_url"],
            "logo_url": tour["logo_url"],
            "album_title": tour["album_title"],
            "album_cover_url": album.get("cover_url") if album else tour["album_cover_url"],
            "album_release_id": album.get("release_id") if album else None,
            "prev_tour": tour["prev_tour"],
            "next_tour": tour["next_tour"],
        },
        "show": show,
        "shows": shows,
        "prev_show": shows[idx - 1] if idx > 0 else None,
        "next_show": shows[idx + 1] if 0 <= idx < len(shows) - 1 else None,
        "promo": promo,
        "gallery": gallery,
        "souvenirs": souvenirs,
        "overview": {
            "tickets": tickets,
            "setlist_files": setlist_files,
            "playlist_code": playlist_code,
            "qr_code": qr_code,
            "recording_url": recording_url,
            "recordings": recordings,
            "lineup": lineup,
            "album": album,
        },
        "setlist": setlist_payload,
    }


def _match_supported_album(
    db: Session,
    band: Band,
    album_title: str | None,
    media_root: Path | None,
) -> dict | None:
    """Match tour ``Album - {title}`` to a local release by exact title (no date prefix)."""
    del db  # reserved for DB release lookup later
    if not album_title or not album_title.strip() or not media_root:
        return None
    from app.band_library import _normalize_title_for_match, scan_audio_library
    from app.media_index import release_id_from_path

    want = _normalize_title_for_match(album_title)
    library = scan_audio_library(band.bnd_name, media_root)
    # Prefer studio albums, then other categories
    order = [
        "albums",
        "extended_plays",
        "live_albums",
        "compilations",
        "singles",
        "soundtracks",
    ]
    keys = [k for k in order if k in library] + [k for k in library if k not in order]
    for key in keys:
        for album in library.get(key) or []:
            title = album.get("title") or ""
            if _normalize_title_for_match(title) != want:
                continue
            folder = album.get("folder_path")
            return {
                "title": title,
                "cover_url": album.get("cover_url"),
                "folder_path": folder,
                "release_id": release_id_from_path(folder) if folder else None,
            }
    return None


def _lineup_for_show_date(
    db: Session,
    band: Band,
    date_iso: str | None,
    media_root: Path | None,
) -> list[dict]:
    """Touring members active on the show date only (empty when none registered)."""
    from app.band_overview import _build_lineup

    lineup = _build_lineup(db, band, media_root)
    touring = [m for m in (lineup.get("touring") or []) if m.get("is_touring")]
    if not touring:
        return []

    year = int(date_iso[:4]) if date_iso and len(date_iso) >= 4 and date_iso[:4].isdigit() else None

    def active_on_show(m: dict) -> bool:
        if year is None:
            return bool(m.get("is_active"))
        start = (m.get("start") or "")[:4]
        end = (m.get("end") or "")[:4]
        sy = int(start) if start.isdigit() else None
        ey = int(end) if end.isdigit() else None
        if sy is not None and sy > year:
            return False
        if ey is not None and ey < year:
            return False
        if not start and not end:
            return True
        return True

    dated = [m for m in touring if active_on_show(m)]
    return dated


def sync_show_folder(db: Session, band: Band, tour_key: str, show_key: str) -> dict:
    """Admin: rescan disk for this band's tours (paths/artwork/meta)."""
    result = sync_band_tours(db, band)
    detail = get_show_detail(db, band, tour_key, show_key, sync=False)
    return {"ok": True, "sync": result, "show": detail.get("show") if detail else None}


def sync_show_artists(db: Session, band: Band, tour_key: str, show_key: str) -> dict:
    """Admin: rebuild bill for this show from join_key peers."""
    detail = get_tour_detail(db, band, tour_key, sync=False)
    if not detail:
        return {"ok": False, "error": "Tour not found"}
    show_card = next(
        (s for s in detail["shows"] if s["slug"] == show_key or str(s["id"]) == show_key),
        None,
    )
    if not show_card:
        return {"ok": False, "error": "Show not found"}
    show = db.get(TourShow, show_card["id"])
    tour = db.get(Tour, detail["id"])
    if not show or not tour:
        return {"ok": False, "error": "Show not found"}
    _sync_bills_for_show(db, show, tour, band, _now())
    db.commit()
    refreshed = get_show_detail(db, band, tour_key, show_key, sync=False)
    return {"ok": True, "bill": refreshed["show"].get("bill") if refreshed else []}
