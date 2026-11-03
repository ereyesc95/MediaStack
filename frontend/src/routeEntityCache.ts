import { bareLeafTitle, normalizeSlug, yearToken } from "./routeSlug";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";

const ARTIST_KEY = sessionCacheKey("route-entity", "artist-slug");
const RELEASE_KEY = sessionCacheKey("route-entity", "release-slug");
const LEAF_KEY = sessionCacheKey("route-entity", "leaf-slug");

export type LeafModule = "movies" | "series" | "books" | "games";

type SlugMap = Record<string, number>;
type ReleaseMap = Record<string, string>;
type LeafMap = Record<string, string>;

function readMap<T>(key: string): T {
  return readSessionEntry<T>(key) ?? ({} as T);
}

function writeMap<T>(key: string, map: T): void {
  writeSessionEntry(key, map);
}

export function rememberArtistSlug(slugOrName: string, bandId: number): void {
  const key = normalizeSlug(slugOrName);
  if (!key || !Number.isFinite(bandId)) return;
  const map = readMap<SlugMap>(ARTIST_KEY);
  map[key] = bandId;
  writeMap(ARTIST_KEY, map);
}

export function bandIdFromArtistSlug(slugOrName: string): number | null {
  const key = normalizeSlug(slugOrName);
  if (!key) return null;
  const id = readMap<SlugMap>(ARTIST_KEY)[key];
  return id != null && Number.isFinite(id) ? id : null;
}

export function rememberReleaseSlug(
  bandId: number,
  slugOrTitle: string,
  releaseId: string
): void {
  const slug = normalizeSlug(slugOrTitle);
  if (!slug || !releaseId.trim()) return;
  const map = readMap<ReleaseMap>(RELEASE_KEY);
  map[`${bandId}:${slug}`] = releaseId;
  writeMap(RELEASE_KEY, map);
}

export function releaseIdFromSlug(
  bandId: number,
  slugOrTitle: string
): string | null {
  const slug = normalizeSlug(slugOrTitle);
  if (!slug) return null;
  return readMap<ReleaseMap>(RELEASE_KEY)[`${bandId}:${slug}`] ?? null;
}

function leafCacheKey(
  module: LeafModule,
  franchiseId: string,
  slug: string
): string {
  const fr = normalizeSlug(franchiseId) || franchiseId;
  return `${module}:${fr}:${slug}`;
}

/**
 * Remember a leaf id under its slug/title.
 * When ``year`` is set, also store ``Title (YYYY)`` / ``Title YYYY`` keys.
 * When ``ambiguousBare`` is true, skip the bare (year-less) key so collisions
 * do not overwrite each other (last visit wins).
 */
export function rememberLeafSlug(
  module: LeafModule,
  franchiseId: string,
  slugOrTitle: string,
  leafId: string,
  opts?: { year?: string | null; ambiguousBare?: boolean }
): void {
  const slug = normalizeSlug(slugOrTitle);
  if (!slug || !leafId.trim()) return;
  const map = readMap<LeafMap>(LEAF_KEY);
  map[leafCacheKey(module, franchiseId, slug)] = leafId;

  const year = (opts?.year || yearToken(slugOrTitle) || "").trim();
  const bare = bareLeafTitle(slugOrTitle);
  const bareSlug = normalizeSlug(bare);
  if (bareSlug && !opts?.ambiguousBare) {
    map[leafCacheKey(module, franchiseId, bareSlug)] = leafId;
  }
  if (year && bareSlug) {
    map[leafCacheKey(module, franchiseId, normalizeSlug(`${bare} (${year})`))] =
      leafId;
    map[leafCacheKey(module, franchiseId, normalizeSlug(`${bare} ${year}`))] =
      leafId;
  }
  writeMap(LEAF_KEY, map);
}

export function leafIdFromSlug(
  module: LeafModule,
  franchiseId: string,
  slugOrTitle: string
): string | null {
  const slug = normalizeSlug(slugOrTitle);
  if (!slug) return null;
  return readMap<LeafMap>(LEAF_KEY)[leafCacheKey(module, franchiseId, slug)] ?? null;
}

export function clearRouteEntityCache(): void {
  removeSessionEntry(ARTIST_KEY);
  removeSessionEntry(RELEASE_KEY);
  removeSessionEntry(LEAF_KEY);
}
