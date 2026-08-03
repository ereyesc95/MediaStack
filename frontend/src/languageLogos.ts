/** Client-side language logo resolution (mirrors backend language_logos.py). */

const LANG_TOKENS: Record<string, string[]> = {
  ja: ["japanese", "japan", "ja", "jp"],
  en: ["english", "en"],
  "es-ES": ["spanish spain", "spain", "es-es", "castilian", "spanish"],
  "es-419": [
    "latin america",
    "latinamerica",
    "latam",
    "latin",
    "es-419",
    "es-mx",
    "spanish",
  ],
};

export type LogoAssets = {
  default?: string | null;
  any?: string | null;
  variants?: Record<string, string>;
};

export type LanguageLogoState = {
  logoByLanguage: Record<string, string>;
  logosSwitchable: boolean;
  primaryLogo: string | null;
};

function bestUrlForCode(
  code: string,
  byToken: Record<string, string>
): string | null {
  const prefs = LANG_TOKENS[code] || [code.toLowerCase()];
  for (const token of prefs) {
    if (byToken[token]) return byToken[token];
  }
  for (const token of prefs) {
    for (const [key, url] of Object.entries(byToken)) {
      if (key.includes(token) || token.includes(key)) return url;
    }
  }
  return null;
}

/** Normalize variant keys to lowercase single-spaced tokens. */
function normalizeVariants(
  variants?: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!variants) return out;
  for (const [k, v] of Object.entries(variants)) {
    if (!v) continue;
    const token = k.toLowerCase().replace(/[_.]+/g, " ").replace(/\s+/g, " ").trim();
    if (token && !out[token]) out[token] = v;
  }
  return out;
}

/**
 * Resolve logos for listed language codes.
 * Single language → prefer logo.png; multiple → prefer language-specific.
 * Switchable only when ≥2 langs resolve to ≥2 distinct URLs.
 */
export function resolveLanguageLogos(
  assets: LogoAssets | null | undefined,
  listedLanguages: string[]
): LanguageLogoState {
  const listed = listedLanguages.filter(Boolean);
  const defaultUrl = assets?.default || null;
  const anyUrl = assets?.any || defaultUrl;
  const byToken = normalizeVariants(assets?.variants);

  if (!listed.length) {
    const primary = defaultUrl || anyUrl;
    return {
      logoByLanguage: {},
      logosSwitchable: false,
      primaryLogo: primary,
    };
  }

  const single = listed.length === 1;
  const byLang: Record<string, string> = {};
  for (const code of listed) {
    const specific = bestUrlForCode(code, byToken);
    const resolved = single
      ? defaultUrl || specific || anyUrl
      : specific || defaultUrl || anyUrl;
    if (resolved) byLang[code] = resolved;
  }

  const distinct = new Set(Object.values(byLang));
  const switchable = listed.length >= 2 && distinct.size >= 2;
  const primary = byLang[listed[0]] || defaultUrl || anyUrl || null;

  return {
    logoByLanguage: byLang,
    logosSwitchable: switchable,
    primaryLogo: primary,
  };
}

export function languageLogoStorageKey(scope: string): string {
  return `mystack:lang-logo:${scope}`;
}

export function readStoredLanguage(scope: string): string | null {
  try {
    return localStorage.getItem(languageLogoStorageKey(scope));
  } catch {
    return null;
  }
}

export function writeStoredLanguage(scope: string, code: string): void {
  try {
    localStorage.setItem(languageLogoStorageKey(scope), code);
  } catch {
    /* ignore */
  }
}
