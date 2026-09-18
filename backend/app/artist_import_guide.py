"""Database-backed template for the optional artist ``User guide.txt``."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import AppSetting

ARTIST_USER_GUIDE_KEY = "artist_user_guide_template"

DEFAULT_ARTIST_USER_GUIDE = """MyStack artist media guide
==========================

This file is optional. You can delete it at any time; MyStack never reads it.

ARTIST FOLDERS
--------------
[Artwork]/
  Exclusive/  NSFW-gated artist gallery media; optional subfolders are supported.
  Branding/   Artist-era logos, icons and member signatures.
  Miscellaneous/  Misc artist photos, gifs and videos (Miscellaneous tab; Misc on mobile).
  Gallery/    Legacy alias for Miscellaneous/ (still read).
  Covers/     Optional covers for artist/user media.

Release categories at the artist root:
Albums, Extended Plays, Compilations, Live Albums, Soundtracks, Singles

ARTIST [ARTWORK] FILENAMES
--------------------------
Branding:
  Logo [1995-1997].png
  Icon [1995-1997].png
  Logo [1995-1997] Collapsed.png
  Signature - Member Name.png

Signatures appear over lineup photos on hover and below the photo in the
member details modal. The member name must match the lineup display name.

Supported gallery dump images: .png, .jpg, .jpeg, .webp, .gif, .bmp
Miscellaneous dump also supports video formats such as .mp4, .webm, .mov and .m4v.
Exclusive also supports those video formats.

RELEASE AND EDITION FOLDERS
---------------------------
Preferred release names:
  YYYY.MM.DD. Record title
  YYYY.MM. Record title
  YYYY. Record title

Optional release suffixes:
  [Unofficial]
  [Box Set]                 Compilations only; enables Box set behavior.
  [by Original Artist]
  [with Collaborator]
Multiple tags may be separated with a semicolon inside one pair of brackets.

If audio belongs directly to one release, put tracks and [Artwork] in the release.
For multiple editions, create sibling edition folders inside the release:
  YYYY.MM.DD. Standard Edition/
  YYYY.MM.DD. Deluxe Edition/
  Remastered/

An edition is recognized when it contains audio, disc/side/tape folders, or [Artwork].
``Standard Edition`` is preferred by default when present.

FORMAT VERSIONS
---------------
When a release or edition exists on multiple formats, put each format in its own
folder. Do not put [Artwork] on the parent of these siblings — each version keeps
its own [Artwork].

Under an edition:
  YYYY.MM.DD. Remastered Edition/
    YYYY.MM.DD. CD/
    YYYY.MM.DD. CD - MiniDisc/
    YYYY.MM.DD. CD - Flexi/
    YYYY.MM.DD. Digital/
    YYYY.MM.DD. LP - Black/
    YYYY.MM.DD. Cassette/

Or directly under the release when there is only one content set:
  YYYY.MM.DD. Album title/
    YYYY.MM.DD. CD/
    YYYY.MM.DD. LP/

Recognized format cores (after date / 01. prefixes):
  CD, SACD, MiniDisc / MD, Flexi / Flexidisc
  Digital, USB
  LP / Vinyl
  7" / 7'' / 7-inch, 10" / 10'' / 10-inch
  Boxset / Box
  Cassette / Tape
  DVD, Blu-ray / BluRay, VHS
Variants use a hyphen after the format, e.g. CD - MiniDisc, LP - Bloodline Red.

Tabs appear when two or more format siblings exist (CD first by default).
Catalog covers prefer the CD version's Cover - Front.
A lone format folder is not a version set (no tabs).

DISC, VINYL AND TAPE FOLDERS
----------------------------
Preferred sortable names:
  01. Disc 01/
  02. Disc 02/
  01. Side A/
  02. Side B/
  01. Tape 01/
Also supported: Disc 1, Disc 2, Side A, Side B, Tape A and Cassette A.
Flat vinyl tracks may use A1., A2., B1., B2. filename prefixes.
These disc/side/tape folders live inside a version (or edition), not as format tabs.

SINGLES
-------
Album-linked singles:
  Singles/YYYY.MM.DD. Parent album/YYYY.MM.DD. Single title/

Standalone singles:
  Singles/YYYY.MM.DD. Single title/

RELEASE [ARTWORK] FILENAMES
---------------------------
Create [Artwork] in the final release or edition folder.

Hero / card photos (Promo tab + About carousel + catalog cards):
  Photo - Banner
  Photo - Landscape
  Photo - Portrait
  Photo - Square

Static cover and background images:
  Cover - Front
  Cover - Album             Alternate main-cover name.
  Cover - Back
  Cover - Inner
  Cover - Banner            Preferred 2000×500 (4:1); flips on now-playing banner tap.
  Cover - Landscape
  Cover - Portrait

Motion (release / now-playing UI — not the Promo tab):
  Cover - Animation         .mp4, .webm, .mov or .m4v
  Cover - Canvas            .mp4, .webm, .mov or .m4v

Track-specific media:
  Cover - Track title
  Animation - Track title
  Canvas - Track title

Disc and branding:
  Disc
  Disc 01
  Disc 02
  Vinyl
  CD
  Logo
  Icon
  Logo - Collapsed

Other supported extras:
  Photocard - Portrait Front
  Photocard - Portrait Back
  Photocard - Landscape Front
  Photocard - Landscape Back
  Photo - Portrait
  Photo - Landscape
  Photo - Square
  Photo - Banner
  Wallpaper - Portrait
  Wallpaper - Landscape

Preferred code filenames (legacy Spotify / QR / Spotify - Code / QR - Code still match):
  Code - Spotify            Release left panel and Gallery Branding
  Code - Spotify Card
  Code - QR
  Code - QR Card

Release gallery tabs: Artwork, Photos (every Photo - file), Branding
(logos, photocards, and Code - files).

Exact stem match only — files like ``Cover - Front.jpg_small.jpg`` are ignored.

Static artwork formats: .png, .jpg, .jpeg, .webp, .gif, .bmp
Motion artwork formats: .mp4, .webm, .mov, .m4v

PHOTO FALLBACKS
---------------
Playing a track: current format version → current edition → Standard Edition →
other editions → previous release (or next if this is the first release).

Singles under a parent album also fall back to the parent edition that contains
the track (Standard first), then the parent Standard Edition.

Catalog cards and idle About carousel use Standard Edition photos, preferring
the CD format version's Cover - Front when format versions exist.

AUDIO FILENAMES
---------------
Preferred track order:
  01. Track title.flac
  02. Track title.flac

Vinyl order:
  A1. Track title.flac
  B1. Track title.flac

Recognized audio: .mp3, .flac, .wav, .wma, .aac

Optional square-bracket suffixes after a track title:
  [Acoustic]
  [Remix] or [Mix]
  [Live] or [Live at Place]
  [Radio edit] or [Extended edit]
  [Demo]
  [Instrumental]
  [B-Side] or [B Side]
  [Bonus]
  [Cover] or [Artist Name cover]
  [A Cappella]
  [Tribute]
  [feat. Artist]
  [with Artist]
  [Language; of Original title]

Separate multiple tags with semicolons:
  04. Song title [Remix; feat. Guest].flac

LYRICS AND LINKS
----------------
Lyrics may sit beside the track with the same stem:
  01. Track title.flac
  01. Track title.lrc

Legacy lyrics are also found at:
  [Artwork]/Lyrics/01. Track title.lrc

Windows .lnk, .path files and supported symlinks may point to shared releases or tracks.
"""


def ensure_artist_user_guide_template(db: Session) -> AppSetting:
    row = db.get(AppSetting, ARTIST_USER_GUIDE_KEY)
    if row:
        value = row.aps_value or ""
        # Force-upgrade built-in templates that still describe Photos / Wallpaper
        # or that predate format-version docs.
        if (
            (
                "Photos/" in value
                or "Wallpaper - " in value
                or "Animation - Album" in value
                or "[Artwork]/Photos" in value
            )
            and "Photo - Banner" not in value
        ) or "FORMAT VERSIONS" not in value:
            row.aps_value = DEFAULT_ARTIST_USER_GUIDE
            db.commit()
        elif "Logos/      Artist-era branding." in value and "Signature -" not in value:
            row.aps_value = DEFAULT_ARTIST_USER_GUIDE
            db.commit()
        return row
    row = AppSetting(
        aps_key=ARTIST_USER_GUIDE_KEY,
        aps_value=DEFAULT_ARTIST_USER_GUIDE,
    )
    db.add(row)
    db.commit()
    return row


def get_artist_user_guide_template(db: Session) -> str:
    row = ensure_artist_user_guide_template(db)
    return row.aps_value or DEFAULT_ARTIST_USER_GUIDE
