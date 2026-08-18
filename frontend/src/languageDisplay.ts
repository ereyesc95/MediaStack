/** App-wide display names for language codes and catalog labels. */

const CODE_DISPLAY: Record<string, string> = {
  "es-419": "Spanish",
  "es-mx": "Spanish",
  "es-latam": "Spanish",
  "es-es": "Castilian",
};

function normalizeLangKey(code: string): string {
  return (code || "").trim().toLowerCase().replace(/_/g, "-");
}

export function displayLanguageLabel(
  code: string,
  fallbackLabel?: string | null
): string {
  const key = normalizeLangKey(code);
  const mapped = CODE_DISPLAY[key];
  if (mapped) return mapped;
  const raw = (fallbackLabel || "").replace(/\s*\(origin\)\s*$/i, "").trim();
  if (/spanish\s*\(\s*latin/i.test(raw)) return "Spanish";
  if (/spanish\s*\(\s*spain/i.test(raw)) return "Castilian";
  return raw || code;
}
