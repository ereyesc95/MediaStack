const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  const mod = day % 10;
  if (mod === 1) return `${day}st`;
  if (mod === 2) return `${day}nd`;
  if (mod === 3) return `${day}rd`;
  return `${day}th`;
}

/** Format stored release date as "Sept 3rd, 1999". */
export function formatTrackDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/);
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
