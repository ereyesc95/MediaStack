/** Shared slug helpers for human-readable URLs. */

export const RESERVED_SEGMENTS = new Set([
  "overview",
  "audio",
  "video",
  "library",
  "series",
  "catalog",
  "collection",
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
  const title = (m?.[1] || raw).trim();
  return title
    .replace(
      /\s*\[(?:Unofficial|Box Set)(?:\s*;\s*(?:Unofficial|Box Set))*\]\s*$/i,
      ""
    )
    .trim();
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
export const GAME_ID_RE = /^game_[0-9a-f]{12,40}$/i;

export function isReleaseId(raw: string): boolean {
  return RELEASE_ID_RE.test(raw);
}

export function isMediaItemId(raw: string): boolean {
  return MEDIA_ITEM_ID_RE.test(raw);
}

export function isGameId(raw: string): boolean {
  return GAME_ID_RE.test(raw);
}

export function isFilmId(raw: string): boolean {
  return FILM_ID_RE.test(raw);
}

export function isBookId(raw: string): boolean {
  return BOOK_ID_RE.test(raw);
}

/** Extract a 4-digit year from a slug/title like ``Heat (1995)`` or ``… 1995``. */
export function yearToken(text: string): string | null {
  const m = (text || "").match(/(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/);
  return m?.[1] || null;
}

function titleWithYear(text: string): string {
  return stripDatedFolderTitle(text || "").replace(/\s*\((\d{4})\)\s*$/, " $1");
}

/** Title without trailing ``(YYYY)`` / dated-folder prefix — for collision compares. */
export function bareLeafTitle(title: string): string {
  return stripDatedFolderTitle(title || "")
    .replace(/\s*\((\d{4})\)\s*$/, "")
    .trim();
}

/** Year from title / folder / dated id / ``date_iso``. */
export function leafYearFromMeta(opts: {
  title?: string | null;
  folder_name?: string | null;
  date_iso?: string | null;
  id?: string | null;
}): string | null {
  return (
    yearToken(opts.title || "") ||
    yearToken(opts.folder_name || "") ||
    yearToken(opts.id || "") ||
    (opts.date_iso && opts.date_iso.length >= 4
      ? opts.date_iso.slice(0, 4)
      : null)
  );
}

/** True when ≥2 sibling titles share the same bare (year-stripped) name. */
export function leafTitleCollides(
  title: string,
  siblingTitles: (string | null | undefined)[] | undefined
): boolean {
  const bare = normalizeSlug(bareLeafTitle(title));
  if (!bare || !siblingTitles?.length) return false;
  let same = 0;
  for (const s of siblingTitles) {
    if (!s) continue;
    if (normalizeSlug(bareLeafTitle(s)) === bare) same += 1;
    if (same >= 2) return true;
  }
  return false;
}

/**
 * Resolve a URL slug to a leaf when the match is unambiguous.
 * Prefer id / folder name; then unique title; then unique title+year disambiguation
 * (e.g. ``heat-1995`` → ``Heat (1995)`` when two Heat films exist).
 */
export function matchLeafTitle<
  T extends {
    id: string;
    title?: string | null;
    name?: string | null;
    folder_name?: string | null;
    date_iso?: string | null;
  },
>(items: T[] | undefined, slug: string): T | undefined {
  if (!items?.length) return undefined;
  const decoded = slug.trim();
  if (!decoded) return undefined;
  const byId = items.find(
    (it) =>
      it.id === decoded ||
      slugMatch(it.id, decoded) ||
      slugMatch(stripDatedFolderTitle(it.id), decoded) ||
      slugMatch(it.folder_name || "", decoded) ||
      slugMatch(stripDatedFolderTitle(it.folder_name || ""), decoded)
  );
  if (byId) return byId;

  const byTitle = items.filter((it) =>
    slugMatch(it.title || it.name || "", decoded)
  );
  if (byTitle.length === 1) return byTitle[0];

  const wantYear = yearToken(decoded);
  if (wantYear) {
    const bare = decoded
      .replace(/[_\-]+/g, " ")
      .replace(new RegExp(`\\(?${wantYear}\\)?`, "g"), " ")
      .replace(/\s+/g, " ")
      .trim();
    const byYear = items.filter((it) => {
      const title = it.title || it.name || "";
      const folder = it.folder_name || "";
      const titleYear =
        yearToken(title) ||
        yearToken(folder) ||
        (it.date_iso && it.date_iso.length >= 4
          ? it.date_iso.slice(0, 4)
          : null);
      if (titleYear !== wantYear) return false;
      if (!bare) return true;
      return (
        slugMatch(title, bare) ||
        slugMatch(titleWithYear(title), `${bare} ${wantYear}`) ||
        slugMatch(stripDatedFolderTitle(folder), bare) ||
        slugMatch(titleWithYear(folder), `${bare} ${wantYear}`)
      );
    });
    if (byYear.length === 1) return byYear[0];
  }

  return undefined;
}

export function parseUniverseId(search: string): number | undefined {
  const raw = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  ).get("universe");
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  return Number(raw);
}

/**
 * Franchise hub URL segment: prefer display name when provided.
 * Ids are usually already slug-like (`dragon ball`); names keep casing for readability.
 */
export function franchiseUrlSegment(
  id: string,
  name?: string | null
): string {
  const n = (name || "").trim();
  if (n) return n;
  return (id || "").trim();
}

/**
 * Leaf URL segment for series/movies/books/games.
 * - Dated folder ids (`2015.07.05. Title`) stay as-is (unique + readable).
 * - Hash ids (`film_…` / `book_…` / `game_…`) prefer a display title when known.
 * - When ``year`` is set (title collision), emit ``Title (YYYY)`` so ``matchLeafTitle``
 *   can disambiguate (pairs with folder naming ``Heat (1995)``).
 * - Otherwise prefer title; fall back to id.
 */
export function leafUrlSegment(opts: {
  id: string;
  title?: string | null;
  /** Disambiguation year when sibling leaves share a bare title. */
  year?: string | null;
  siblingTitles?: (string | null | undefined)[];
}): string {
  const id = (opts.id || "").trim();
  const title = (opts.title || "").trim();
  if (!id && title) return stripDatedFolderTitle(title) || title;
  if (!id) return "";
  if (/^\d{4}(?:\.\d{2}){0,2}\.\s+\S/.test(id)) return id;

  const year =
    (opts.year || "").trim() ||
    (leafTitleCollides(title, opts.siblingTitles)
      ? yearToken(title)
      : null);
  const display = stripDatedFolderTitle(title) || title;
  if (year && title) {
    const bare = bareLeafTitle(title) || display;
    if (yearToken(display) === year) {
      // Keep existing ``Title (YYYY)`` / ``Title YYYY`` shape when already present.
      if (/\(\d{4}\)\s*$/.test(display)) return display;
      return `${bare} (${year})`;
    }
    return `${bare} (${year})`;
  }

  if ((isFilmId(id) || isBookId(id) || isGameId(id)) && title) {
    return display;
  }
  if (title && !isReservedSegment(title.split("/")[0] || title)) {
    return display;
  }
  return id;
}

export function withUniverseQuery(path: string, universeId?: number): string {
  if (universeId == null) return path;
  return `${path}?universe=${universeId}`;
}
