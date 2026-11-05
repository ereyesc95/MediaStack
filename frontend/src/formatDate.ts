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
 * Mask typed digits into yyyy / yyyy/mm / yyyy/mm/dd (auto `/`).
 * Non-digits are stripped; max 8 digits.
 */
export function maskFlexibleDateInput(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}/${digits.slice(4)}`;
  }
  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
}

/**
 * Parse yyyy, yyyy/mm, or yyyy/mm/dd (also ISO YYYY-MM-DD) into storage:
 * YYYY | YYYY-MM | YYYY-MM-DD.
 * Empty / "Present" → "" ; unparseable → null.
 */
export function parseFlexibleDate(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t || /^present$/i.test(t)) return "";

  const masked = maskFlexibleDateInput(t);
  if (/^\d{4}$/.test(masked)) return masked;

  const parts = masked.split("/");
  if (parts.length === 2 && parts[0]?.length === 4 && parts[1]?.length === 2) {
    const y = parts[0];
    const mNum = Number(parts[1]);
    if (mNum < 1 || mNum > 12) return null;
    return `${y}-${parts[1]}`;
  }
  if (
    parts.length === 3 &&
    parts[0]?.length === 4 &&
    parts[1]?.length === 2 &&
    parts[2]?.length === 2
  ) {
    const y = parts[0];
    const mNum = Number(parts[1]);
    const dNum = Number(parts[2]);
    if (mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) return null;
    return `${y}-${parts[1]}-${parts[2]}`;
  }

  // Already-stored ISO from API (hyphen separators).
  const iso = t.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (iso) {
    if (iso[3]) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    if (iso[2]) {
      const mNum = Number(iso[2]);
      if (mNum < 1 || mNum > 12) return null;
      return `${iso[1]}-${iso[2]}`;
    }
    return iso[1]!;
  }

  return null;
}

/** Display storage date as yyyy/mm/dd, yyyy/mm, or yyyy for editing. */
export function formatFlexibleDateInput(stored: string | null | undefined): string {
  const t = (stored ?? "").trim();
  if (!t) return "";
  const m = t.match(/^(\d{4})(?:[.\-/](\d{2})(?:[.\-/](\d{2}))?)?$/);
  if (!m) return maskFlexibleDateInput(t);
  if (m[3]) return `${m[1]}/${m[2]}/${m[3]}`;
  if (m[2]) return `${m[1]}/${m[2]}`;
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
