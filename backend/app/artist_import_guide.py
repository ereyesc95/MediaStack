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
  Photos/     Artist-era photos and card backgrounds.
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

Photos begin with a year and include an orientation when applicable:
  1997. Artist photo, Portrait.jpg
  1997. Artist photo, Landscape.jpg
  1997. Artist photo, Banner.jpg

Supported gallery images: .png, .jpg, .jpeg, .webp, .gif, .bmp
Exclusive also supports gallery video formats such as .mp4, .webm, .mov and .m4v.

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

SINGLES
-------
Album-linked singles:
  Singles/YYYY.MM.DD. Parent album/YYYY.MM.DD. Single title/

Standalone singles:
  Singles/YYYY.MM.DD. Single title/

RELEASE [ARTWORK] FILENAMES
---------------------------
Create [Artwork] in the final release or edition folder.

Static cover and background images:
  Cover - Front
  Cover - Album             Alternate main-cover name.
  Cover - Back
  Cover - Inner
  Cover - Banner
  Cover - Landscape

Motion:
  Animation - Album         .mp4, .webm, .mov or .m4v
  Canvas - Album            .mp4, .webm, .mov or .m4v

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
  Wallpaper - Portrait
  Wallpaper - Landscape
  Spotify
  QR

Static artwork formats: .png, .jpg, .jpeg, .webp, .gif, .bmp
Motion artwork formats: .mp4, .webm, .mov, .m4v

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
        # Upgrade the original built-in template without overwriting a template
        # the user has already customized.
        value = row.aps_value or ""
        if "Logos/      Artist-era branding." in value and "Signature -" not in value:
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
