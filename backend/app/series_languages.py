"""Series audio/spoken language helpers for franchise About + cast."""
from __future__ import annotations

# Stable codes used in DB / cast performances
LANG_ORIGIN = "origin"  # resolved to concrete code at display time

LANGUAGE_CATALOG: list[dict[str, str]] = [
    {"code": "ja", "label": "Japanese"},
    {"code": "en", "label": "English"},
    {"code": "es-ES", "label": "Spanish (Spain)"},
    {"code": "es-419", "label": "Spanish (Latin America)"},
]

# TMDb / ISO-ish → our catalog code
_TMDB_TO_CODE: dict[str, str] = {
    "ja": "ja",
    "jp": "ja",
    "en": "en",
    "es": "es-ES",
    "es-es": "es-ES",
    "es-mx": "es-419",
    "es-419": "es-419",
    "es-ar": "es-419",
    "es-cl": "es-419",
    "es-co": "es-419",
    "es-pe": "es-419",
}

_COUNTRY_TO_LANG: dict[str, str] = {
    "jp": "ja",
    "us": "en",
    "gb": "en",
    "au": "en",
    "ca": "en",
    "es": "es-ES",
    "mx": "es-419",
    "ar": "es-419",
    "cl": "es-419",
    "co": "es-419",
    "pe": "es-419",
    "uy": "es-419",
    "ve": "es-419",
}


def catalog_label(code: str) -> str:
    for item in LANGUAGE_CATALOG:
        if item["code"] == code:
            return item["label"]
    return code


def normalize_lang_code(raw: str | None) -> str | None:
    if not raw:
        return None
    key = raw.strip().casefold().replace("_", "-")
    if key in _TMDB_TO_CODE:
        return _TMDB_TO_CODE[key]
    # ja-JP → ja
    base = key.split("-")[0]
    return _TMDB_TO_CODE.get(base) or _TMDB_TO_CODE.get(key)


def origin_language_code(
    *,
    tmdb_original_language: str | None = None,
    country_iso: str | None = None,
) -> str | None:
    code = normalize_lang_code(tmdb_original_language)
    if code:
        return code
    if country_iso:
        return _COUNTRY_TO_LANG.get(country_iso.strip().casefold())
    return None


def language_options_for_franchise(
    selected: list[str],
    *,
    origin_code: str | None,
) -> list[dict]:
    """
    Build ordered language pills: origin language first (if known), then
    the rest of the catalog. `selected` are codes enabled on the franchise.
    """
    selected_set = {normalize_lang_code(c) or c for c in selected if c}
    ordered_codes: list[str] = []
    if origin_code and origin_code not in ordered_codes:
        ordered_codes.append(origin_code)
    for item in LANGUAGE_CATALOG:
        if item["code"] not in ordered_codes:
            ordered_codes.append(item["code"])
    # Also include any selected extras
    for c in selected_set:
        if c and c not in ordered_codes:
            ordered_codes.append(c)

    out = []
    for code in ordered_codes:
        out.append(
            {
                "code": code,
                "label": catalog_label(code),
                "is_origin": bool(origin_code and code == origin_code),
                "selected": code in selected_set
                or (origin_code == code and not selected_set),
            }
        )
    return out


def split_character_names(raw: str | None) -> list[str]:
    """Split TMDb multi-role strings like 'Goku / Gohan (voice)'."""
    if not raw:
        return []
    text = raw.strip()
    # Drop trailing role markers
    for suffix in (" (voice)", " (uncredited)", " (archive footage)"):
        if text.casefold().endswith(suffix):
            text = text[: -len(suffix)].strip()
    parts = [p.strip() for p in text.split("/")]
    return [p for p in parts if p]
