#!/usr/bin/env python3
"""Generate system PNGs for hub, dashboard panes, filters, and countries."""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow"])
    from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "system"
MEDIA_DIR = OUT / "media"
ICONS_DIR = OUT / "icons"
OUT.mkdir(parents=True, exist_ok=True)
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
ICONS_DIR.mkdir(parents=True, exist_ok=True)


def gradient(w: int, h: int, c1: tuple[int, int, int], c2: tuple[int, int, int]) -> Image.Image:
    img = Image.new("RGB", (w, h))
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(c1[0] + (c2[0] - c1[0]) * t)
        g = int(c1[1] + (c2[1] - c1[1]) * t)
        b = int(c1[2] + (c2[2] - c1[2]) * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))
    return img


def save_gradient(path: Path, c1: tuple[int, int, int], c2: tuple[int, int, int], size=(1920, 1080)):
    gradient(*size, c1, c2).save(path, "PNG")
    print("wrote", path)


# Hub panes → assets/system/media/
HUB = {
    "music": ((20, 24, 42), (124, 92, 255)),
    "series": ((18, 28, 38), (0, 180, 200)),
    "movies": ((28, 18, 22), (220, 80, 60)),
    "books": ((22, 26, 20), (180, 140, 70)),
    "games": ((16, 22, 32), (90, 200, 120)),
}
for slug, colors in HUB.items():
    save_gradient(MEDIA_DIR / f"{slug}.png", colors[0], colors[1], (480, 1080))

# Dashboard pane logos → assets/system/icons/
PANES = {
    "pane-on-repeat": ((58, 42, 88), (140, 90, 220), "♪"),
    "pane-icons": ((30, 42, 62), (80, 120, 200), "★"),
    "pane-vibes": ((42, 28, 68), (0, 160, 180), "◎"),
    "pane-global": ((22, 38, 52), (60, 140, 100), "🌐"),
}
for slug, (c1, c2, sym) in PANES.items():
    img = gradient(96, 96, c1, c2)
    d = ImageDraw.Draw(img)
    d.text((48, 48), sym, fill=(255, 255, 255), anchor="mm")
    img.save(ICONS_DIR / f"{slug}.png", "PNG")
    print("wrote", ICONS_DIR / f"{slug}.png")

# Continents → assets/system/continent/
CONTINENTS = {
    "africa": ((40, 90, 50), (200, 160, 40)),
    "asia": ((120, 40, 30), (255, 200, 80)),
    "europe": ((30, 50, 100), (100, 160, 220)),
    "north-america": ((20, 60, 120), (180, 60, 60)),
    "south-america": ((20, 80, 40), (180, 140, 50)),
    "oceania": ((10, 80, 120), (60, 180, 200)),
}
cont_dir = OUT / "continent"
cont_dir.mkdir(exist_ok=True)
for slug, colors in CONTINENTS.items():
    save_gradient(cont_dir / f"{slug}.png", colors[0], colors[1])

# Parent music genres → assets/system/genre/
# Subgenre artwork (Music Vibes pane) → assets/system/subgenre/{slug}.png
GENRES = {
    "blues": ((30, 40, 80), (80, 100, 200)),
    "classical": ((50, 35, 60), (160, 120, 180)),
    "country": ((60, 40, 25), (180, 120, 60)),
    "easy-listening": ((40, 55, 70), (120, 180, 200)),
    "electronic": ((20, 20, 50), (180, 0, 200)),
    "folk": ((45, 60, 35), (140, 180, 90)),
    "hip-hop": ((30, 30, 30), (200, 180, 60)),
    "jazz": ((25, 25, 45), (200, 140, 60)),
    "latin": ((80, 30, 20), (255, 180, 40)),
    "metal": ((15, 15, 20), (80, 80, 100)),
    "new-age": ((30, 60, 80), (120, 220, 200)),
    "pop": ((180, 60, 120), (255, 150, 200)),
    "reggae": ((20, 80, 30), (80, 200, 60)),
    "rhythm-blues": ((40, 20, 60), (140, 60, 160)),
    "rock": ((40, 25, 25), (180, 50, 40)),
    "world": ((50, 70, 40), (180, 140, 80)),
}
genre_dir = OUT / "genre"
genre_dir.mkdir(exist_ok=True)
for slug, colors in GENRES.items():
    save_gradient(genre_dir / f"{slug}.png", colors[0], colors[1])

# Decades → assets/system/decade/
dec_dir = OUT / "decade"
dec_dir.mkdir(exist_ok=True)
for decade in range(1950, 2030, 10):
    hue = (decade - 1950) * 8
    c1 = (20 + hue % 40, 25, 35 + hue % 50)
    c2 = (60 + hue % 80, 40 + hue % 60, 90 + hue % 70)
    slug = f"{decade}s"
    save_gradient(dec_dir / f"{slug}.png", c1, c2)

# Artist playlists → assets/system/playlists/
PLAYLISTS = {
    "top-tracks": ((48, 28, 72), (160, 90, 220), "TOP"),
    "setlists": ((22, 42, 58), (0, 150, 170), "LIVE"),
    "remixes": ((32, 18, 48), (200, 60, 180), "RMX"),
    "acoustic": ((36, 52, 38), (120, 170, 90), "ACO"),
    "demos": ((40, 36, 28), (150, 110, 70), "DMO"),
    "instrumentals": ((24, 36, 52), (70, 130, 200), "INS"),
    "covers": ((52, 28, 32), (180, 80, 90), "COV"),
    "a-cappella": ((44, 32, 58), (130, 100, 190), "ACA"),
    "b-sides": ((28, 32, 42), (90, 110, 160), "B/S"),
    "bonus-tracks": ((48, 38, 18), (200, 160, 50), "BNS"),
    "tributes": ((38, 22, 30), (160, 70, 100), "TRB"),
    "collaborations": ((18, 42, 52), (40, 140, 170), "COL"),
    "features": ((42, 24, 58), (170, 90, 210), "FEAT"),
    "originals": ((26, 40, 34), (80, 150, 110), "ORG"),
    "writing-credits": ((30, 34, 48), (100, 120, 200), "WRT"),
    "appearances": ((34, 28, 44), (120, 90, 180), "APP"),
}
playlist_dir = OUT / "playlists"
playlist_dir.mkdir(exist_ok=True)
for slug, (c1, c2, label) in PLAYLISTS.items():
    img = gradient(512, 512, c1, c2)
    d = ImageDraw.Draw(img)
    d.text((256, 256), label, fill=(255, 255, 255), anchor="mm")
    img.save(playlist_dir / f"{slug}.png", "PNG")
    print("wrote", playlist_dir / f"{slug}.png")

print("Done.")
