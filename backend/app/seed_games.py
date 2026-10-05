"""Seed Games media-type (600) parent genres + subgenres."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Genre, Subgenre

GAMES_MEDIA_TYPE = 600

# Parent genID → (name, [subgenre names])
# IDs follow Movies/Books style: 600001+ parents, 600xxxx subgenres.
GAMES_TAXONOMY: list[tuple[int, str, list[tuple[int, str]]]] = [
    (
        600001,
        "Action",
        [
            (6000001, "Action"),
            (6000002, "Beat 'em Up"),
            (6000003, "Hack and Slash"),
            (6000004, "Character Action"),
            (6000005, "Stealth"),
        ],
    ),
    (
        600002,
        "Adventure",
        [
            (6000010, "Adventure"),
            (6000011, "Action-Adventure"),
            (6000012, "Metroidvania"),
            (6000013, "Point & Click"),
            (6000014, "Walking Simulator"),
        ],
    ),
    (
        600003,
        "RPG",
        [
            (6000020, "RPG"),
            (6000021, "Action RPG"),
            (6000022, "JRPG"),
            (6000023, "WRPG"),
            (6000024, "Tactical RPG"),
            (6000025, "MMORPG"),
            (6000026, "Roguelike"),
            (6000027, "Roguelite"),
        ],
    ),
    (
        600004,
        "Shooter",
        [
            (6000030, "Shooter"),
            (6000031, "FPS"),
            (6000032, "TPS"),
            (6000033, "Twin-Stick"),
            (6000034, "Rail Shooter"),
            (6000035, "Light Gun"),
        ],
    ),
    (
        600005,
        "Fighting",
        [
            (6000040, "Fighting"),
            (6000041, "2D Fighter"),
            (6000042, "3D Fighter"),
            (6000043, "Platform Fighter"),
            (6000044, "Arena Fighter"),
        ],
    ),
    (
        600006,
        "Platformer",
        [
            (6000050, "Platformer"),
            (6000051, "2D Platformer"),
            (6000052, "3D Platformer"),
            (6000053, "Precision Platformer"),
        ],
    ),
    (
        600007,
        "Puzzle",
        [
            (6000060, "Puzzle"),
            (6000061, "Match-3"),
            (6000062, "Physics Puzzle"),
            (6000063, "Hidden Object"),
            (6000064, "Escape Room"),
        ],
    ),
    (
        600008,
        "Strategy",
        [
            (6000070, "Strategy"),
            (6000071, "Real-Time Strategy"),
            (6000072, "Turn-Based Strategy"),
            (6000073, "4X"),
            (6000074, "Tower Defense"),
            (6000075, "Autobattler"),
            (6000076, "MOBA"),
        ],
    ),
    (
        600009,
        "Simulation",
        [
            (6000080, "Simulation"),
            (6000081, "Life Sim"),
            (6000082, "Farming Sim"),
            (6000083, "Vehicle Sim"),
            (6000084, "Management"),
            (6000085, "Sandbox"),
        ],
    ),
    (
        600010,
        "Sports",
        [
            (6000090, "Sports"),
            (6000091, "Football"),
            (6000092, "Basketball"),
            (6000093, "Baseball"),
            (6000094, "Extreme Sports"),
        ],
    ),
    (
        600011,
        "Racing",
        [
            (6000100, "Racing"),
            (6000101, "Arcade Racing"),
            (6000102, "Sim Racing"),
            (6000103, "Kart Racing"),
        ],
    ),
    (
        600012,
        "Horror",
        [
            (6000110, "Horror"),
            (6000111, "Survival Horror"),
            (6000112, "Psychological Horror"),
        ],
    ),
    (
        600013,
        "Survival",
        [
            (6000120, "Survival"),
            (6000121, "Survival Craft"),
            (6000122, "Battle Royale"),
            (6000123, "Extraction"),
        ],
    ),
    (
        600014,
        "Party & Casual",
        [
            (6000130, "Party"),
            (6000131, "Casual"),
            (6000132, "Minigame Collection"),
            (6000133, "Trivia"),
        ],
    ),
    (
        600015,
        "Music & Rhythm",
        [
            (6000140, "Rhythm"),
            (6000141, "Music"),
            (6000142, "Dance"),
        ],
    ),
    (
        600016,
        "Visual Novel",
        [
            (6000150, "Visual Novel"),
            (6000151, "Dating Sim"),
            (6000152, "Kinetic Novel"),
        ],
    ),
    (
        600017,
        "Educational",
        [
            (6000160, "Educational"),
            (6000161, "Edutainment"),
            (6000162, "Fitness"),
        ],
    ),
    (
        600018,
        "Other",
        [
            (6000170, "Compilation"),
            (6000171, "Board Game Adaptation"),
            (6000172, "Card Game"),
            (6000173, "Idle / Incremental"),
        ],
    ),
    (
        600019,
        "Adult",
        [
            (6000180, "Adult"),
            (6000181, "Adult Adventure"),
            (6000182, "Adult RPG"),
            (6000183, "Adult Visual Novel"),
            (6000184, "Adult Simulation"),
            (6000185, "Adult Horror"),
            (6000186, "Adult Fighting"),
            (6000187, "Nude / Explicit"),
            (6000188, "Fetish"),
            (6000189, "Hentai Game"),
            (6000190, "Ecchi"),
            (6000191, "Yaoi"),
            (6000192, "Yuri"),
            (6000193, "Furry & Anthro Adult"),
            (6000194, "Uncensored"),
        ],
    ),
]


def seed_games_genres(db: Session) -> None:
    """Insert missing Games parent genres and subgenres (idempotent)."""
    existing_genres = {
        g.gen_id: g
        for g in db.scalars(
            select(Genre).where(Genre.gen_media_type_id == GAMES_MEDIA_TYPE)
        ).all()
    }
    existing_subs = {
        s.sgn_id: s
        for s in db.scalars(
            select(Subgenre).where(Subgenre.sgn_media_type_id == GAMES_MEDIA_TYPE)
        ).all()
    }
    changed = False
    for parent_id, parent_name, subs in GAMES_TAXONOMY:
        row = existing_genres.get(parent_id)
        if row is None:
            # Also match by name in case IDs differ from a prior manual seed
            by_name = next(
                (
                    g
                    for g in existing_genres.values()
                    if (g.gen_name or "").casefold() == parent_name.casefold()
                ),
                None,
            )
            if by_name is None:
                db.add(
                    Genre(
                        gen_id=parent_id,
                        gen_name=parent_name,
                        gen_media_type_id=GAMES_MEDIA_TYPE,
                    )
                )
                changed = True
                parent_fk = parent_id
            else:
                parent_fk = by_name.gen_id
        else:
            parent_fk = parent_id
            if (row.gen_name or "") != parent_name:
                row.gen_name = parent_name
                changed = True

        for sub_id, sub_name in subs:
            srow = existing_subs.get(sub_id)
            if srow is None:
                db.add(
                    Subgenre(
                        sgn_id=sub_id,
                        sgn_name=sub_name,
                        sgn_genre_id=parent_fk,
                        sgn_media_type_id=GAMES_MEDIA_TYPE,
                    )
                )
                changed = True
            else:
                if (srow.sgn_name or "") != sub_name:
                    srow.sgn_name = sub_name
                    changed = True
                if srow.sgn_genre_id != parent_fk:
                    srow.sgn_genre_id = parent_fk
                    changed = True
    if changed:
        db.commit()


def ensure_games_genres(db: Session) -> None:
    count = db.scalar(
        select(Genre.gen_id)
        .where(Genre.gen_media_type_id == GAMES_MEDIA_TYPE)
        .limit(1)
    )
    if count is None:
        seed_games_genres(db)
    else:
        # Keep taxonomy complete if new rows were added to GAMES_TAXONOMY
        seed_games_genres(db)
