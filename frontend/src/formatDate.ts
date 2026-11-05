const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Parse flexible user dates into storage form:
 * YYYY | YYYY-MM | YYYY-MM-DD.
 * Accepts MM/DD/YYYY, MM/YYYY, YYYY, and ISO-like variants.
 * Empty / "Present" → "" ; unparseable → null.
 */
export function parseFlexibleDate(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t || /^present$/i.test(t)) return "";

  if (/^\d{4}$/.test(t)) return t;

  const iso = t.match(/^(\d{4})[.\-/](\d{1,2})(?:[.\-/](\d{1,2}))?$/);
  if (iso) {
    const y = iso[1]!;
    const mNum = Number(iso[2]);
    if (mNum < 1 || mNum > 12) return null;
    const m = String(mNum).padStart(2, "0");
    if (iso[3] != null) {
      const dNum = Number(iso[3]);
      if (dNum < 1 || dNum > 31) return null;
      return `${y}-${m}-${String(dNum).padStart(2, "0")}`;
    }
    return `${y}-${m}`;
  }

  const parts = t.split(/[.\-/]/).filter(Boolean);
  if (parts.length === 2) {
    const [a, b] = parts;
    if (!a || !b) return null;
    // MM/YYYY
    if (/^\d{1,2}$/.test(a) && /^\d{4}$/.test(b)) {
      const mNum = Number(a);
      if (mNum < 1 || mNum > 12) return null;
      return `${b}-${String(mNum).padStart(2, "0")}`;
    }
    return null;
  }
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (!a || !b || !c) return null;
    // MM/DD/YYYY
    if (/^\d{1,2}$/.test(a) && /^\d{1,2}$/.test(b) && /^\d{4}$/.test(c)) {
      const mNum = Number(a);
      const dNum = Number(b);
      if (mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) return null;
      return `${c}-${String(mNum).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`;
    }
    return null;
  }
  return null;
}

/** Display storage date as MM/DD/YYYY, MM/YYYY, or YYYY for editing. */
export function formatFlexibleDateInput(stored: string | null | undefined): string {
  const t = (stored ?? "").trim();
  if (!t) return "";
  const m = t.match(/^(\d{4})(?:[.\-](\d{2})(?:[.\-](\d{2}))?)?$/);
  if (!m) return t;
  if (m[3]) return `${m[2]}/${m[3]}/${m[1]}`;
  if (m[2]) return `${m[2]}/${m[1]}`;
  return m[1]!;
}

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  const mod = day % 10;
  if (mod === 1) return `${day}st`;
  if (mod === 2) return `${day}nd`;
  if (mod === 3) return `${day}rd`;
  return `${day}th`;
}

/** Format stored release date as "September 3rd, 1999".
 * Accepts YYYY-MM-DD, YYYY.MM.DD, YYYY-MM, YYYY.MM, or YYYY.
 */
export function formatTrackDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d{4})(?:[.\-](\d{2})(?:[.\-](\d{2}))?)?/);
  if (!m) return trimmed;
  const year = m[1];
  const month = m[2] ? Number(m[2]) : null;
  const day = m[3] ? Number(m[3]) : null;
  if (month && day) {
    const label = MONTHS[month - 1] ?? String(month);
    return `${label} ${ordinal(day)}, ${year}`;
  }
  if (month) {
    const label = MONTHS[month - 1] ?? String(month);
    return `${label} ${year}`;
  }
  return year;
}

/** CAPS month + smaller ordinal for tour show date tabs. */
export function formatShowTabDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d{4})(?:[.\-](\d{2})(?:[.\-](\d{2}))?)?/);
  if (!m) return trimmed.toUpperCase();
  const year = m[1];
  const month = m[2] ? Number(m[2]) : null;
  const day = m[3] ? Number(m[3]) : null;
  if (month && day) {
    const label = (MONTHS[month - 1] ?? String(month)).toUpperCase();
    return `${label} ${ordinal(day).toUpperCase()}, ${year}`;
  }
  if (month) {
    const label = (MONTHS[month - 1] ?? String(month)).toUpperCase();
    return `${label} ${year}`;
  }
  return year;
}
