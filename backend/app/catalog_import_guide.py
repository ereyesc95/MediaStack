"""Database-backed User guide templates for catalog franchise imports."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import AppSetting


COMMON_ART = """ARTWORK FILENAMES
-----------------
Gallery/Covers (or franchise [Artwork] when this module is the franchise home):
  Cover - Front.jpg
  Cover - Back.jpg
  Cover - Banner.jpg
  Cover - Landscape.jpg
  Characters - Portrait.jpg
  Characters - Landscape.jpg
  Wallpaper - Portrait.jpg
  Wallpaper - Landscape.jpg
  Photocard - Portrait Front.jpg
  Photocard - Portrait Back.jpg
  Photocard - Landscape Front.jpg
  Photocard - Landscape Back.jpg

Gallery/Branding (legacy Gallery/Renders is also supported):
  Logo.png
  Icon.png
  Badge.png
  Logo - Collapsed.png

Gallery/Exclusive is NSFW-gated and supports optional subfolders.
Franchise [Artwork] may also contain Branding/, Covers/, Photos/ and Exclusive/.
Supported images: .png, .jpg, .jpeg, .webp, .gif, .bmp
Exclusive also supports .mp4, .webm, .mov, .m4v and supported audio.

FOLDER NAMES AND TAGS
---------------------
Preferred dated folders:
  YYYY.MM.DD. Title
  YYYY.MM. Title
  YYYY. Title

Optional trailing tags:
  [Unofficial]
  [Box Set]
Multiple tags may share one bracket pair separated by semicolons.

Windows .lnk, .path files and supported symlinks may point to shared media.
"""

DEFAULT_GUIDES = {
    "movies": f"""MyStack Movies media guide
==========================

This file is optional. You can delete it at any time; MyStack never reads it.

MOVIE LAYOUT
------------
Movies/{{Letter}}/{{Franchise}}/{{YYYY.MM.DD}}. {{Film}}/
Every film stays in its own dated folder, even for a one-film franchise.
Do not create Series, Books, Games or Audio portal folders here.

Each film may contain:
  Gallery/Covers/
  Gallery/Branding/
  Gallery/Extras/
  Gallery/Exclusive/

The franchise root contains [Artwork]/ only when Movies is its franchise home.

Movie files may use a date prefix, numeric prefix, or title:
  YYYY.MM.DD. Film title.mkv
  01. Film title.mp4
Extra feature files may be placed in Extras/ when used by a future scanner.

{COMMON_ART}""",
    "series": f"""MyStack Series media guide
==========================

This file is optional. You can delete it at any time; MyStack never reads it.

SERIES LAYOUT
-------------
Series/{{Letter}}/{{Franchise}}/{{YYYY.MM.DD}}. {{Show}}/
A single flat show may keep Episodes/, Specials/ and Extras/ at franchise root.

Show/subseries folders may contain:
  Gallery/Covers/
  Gallery/Branding/
  Gallery/Extras/
  Gallery/Exclusive/
  Episodes/YYYY.MM.DD. Season N/
  Specials/
  Extras/
  Audio/Albums|Extended Plays|Compilations|Live Albums|Soundtracks|Singles/

The franchise root contains [Artwork]/ only when Series is its franchise home.

Episode and special files:
  01. Episode title.mkv
  01. Special title.mkv
Promo/theme videos under Extras/:
  01. Theme [Season 1 Opening].mp4
  02. Theme [Season 1 Ending].mp4

Audio entries are normally .lnk or .path shortcuts to Music releases.
Optional [By Artist] identifies the owning Music artist; no tag means Various Artists.

{COMMON_ART}""",
    "books": f"""MyStack Books media guide
=========================

This file is optional. You can delete it at any time; MyStack never reads it.

BOOK LAYOUT
-----------
Books/{{Letter}}/{{Franchise}}/{{YYYY.MM.DD}}. {{Book or Volume}}/
Book/PDF files stay inside the dated leaf folder.
Do not create Movies, Series, Games or Audio portal folders here.

Each book may contain:
  Gallery/Covers/
  Gallery/Branding/
  Gallery/Extras/
  Gallery/Exclusive/

The franchise root contains [Artwork]/ only when Books is its franchise home.

Book files may use:
  Book title.pdf
  01. Chapter title.pdf
  01. Volume title.cbz

{COMMON_ART}""",
}


def guide_key(module: str) -> str:
    return f"{module}_user_guide_template"


def get_catalog_user_guide(db: Session, module: str) -> str:
    default = DEFAULT_GUIDES[module]
    key = guide_key(module)
    row = db.get(AppSetting, key)
    if row:
        return row.aps_value or default
    row = AppSetting(aps_key=key, aps_value=default)
    db.add(row)
    db.flush()
    return default


def ensure_catalog_user_guide_templates(db: Session) -> None:
    for module in DEFAULT_GUIDES:
        row = db.get(AppSetting, guide_key(module))
        if not row:
            get_catalog_user_guide(db, module)
            continue
        if row.aps_value:
            row.aps_value = (
                row.aps_value.replace(
                    "Gallery/Renders/", "Gallery/Branding/"
                )
                .replace("Gallery/Renders:", "Gallery/Branding:")
                .replace(
                    "Gallery/Branding (legacy Gallery/Branding is also supported):",
                    "Gallery/Branding (legacy Gallery/Renders is also supported):",
                )
            )
    db.commit()
