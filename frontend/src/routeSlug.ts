/** Shared slug helpers for human-readable URLs. */

export const RESERVED_SEGMENTS = new Set([
  "overview",
  "audio",
  "video",
  "library",
  "series",
  "catalog",
  "playlists",
  "artist",
  "show",
  "film",
  "book",
  "season",
  "franchise",
  "gallery",
  "games",
  "episodes",
  "quiz",
]);

export function enc(seg: string): string {
  return encodeURIComponent(seg);
}

export function dec(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

/** Match backend normalize_franchise_slug (casefold + whitespace). */
export function normalizeSlug(text: string): string {
  return (text || "")
    .replace(/█/g, "'")
    .replace(/■/g, ",")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Strip leading ``YYYY.MM.DD. `` / ``YYYY. `` folder date prefixes. */
export function stripDatedFolderTitle(name: string): string {
  const raw = (name || "").trim();
  const m = raw.match(/^\d{4}(?:\.\d{2}){0,2}\.\s*(.+)$/);
  return (m?.[1] || raw).trim();
}

export function slugMatch(a: string, b: string): boolean {
  return normalizeSlug(a) === normalizeSlug(b);
}

export function isReservedSegment(seg: string): boolean {
  return RESERVED_SEGMENTS.has(seg.toLowerCase());
}

export function isNumericId(raw: string): boolean {
  return /^\d+$/.test(raw);
}

export const RELEASE_ID_RE = /^rel_[0-9a-f]{12}$/;
export const MEDIA_ITEM_ID_RE = /^(vid|lib)_[0-9a-f]{12}$/;
export const FILM_ID_RE = /^film_[0-9a-f]{12,40}$/;
export const BOOK_ID_RE = /^book_[0-9a-f]{12,40}$/;

export function isReleaseId(raw: string): boolean {
  return RELEASE_ID_RE.test(raw);
}

export function isMediaItemId(raw: string): boolean {
  return MEDIA_ITEM_ID_RE.test(raw);
}

export function isFilmId(raw: string): boolean {
  return FILM_ID_RE.test(raw);
}

export function isBookId(raw: string): boolean {
  return BOOK_ID_RE.test(raw);
}

export function parseUniverseId(search: string): number | undefined {
  const raw = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  ).get("universe");
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  return Number(raw);
}

export function withUniverseQuery(path: string, universeId?: number): string {
  if (universeId == null) return path;
  return `${path}?universe=${universeId}`;
}
