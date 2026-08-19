import { normalizeSlug } from "./routeSlug";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";

const ARTIST_KEY = sessionCacheKey("route-entity", "artist-slug");
const RELEASE_KEY = sessionCacheKey("route-entity", "release-slug");
const LEAF_KEY = sessionCacheKey("route-entity", "leaf-slug");

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

export function rememberLeafSlug(
  module: "movies" | "series" | "books",
  franchiseId: string,
  slugOrTitle: string,
  leafId: string
): void {
  const slug = normalizeSlug(slugOrTitle);
  const fr = normalizeSlug(franchiseId) || franchiseId;
  if (!slug || !leafId.trim()) return;
  const map = readMap<LeafMap>(LEAF_KEY);
  map[`${module}:${fr}:${slug}`] = leafId;
  writeMap(LEAF_KEY, map);
}

export function leafIdFromSlug(
  module: "movies" | "series" | "books",
  franchiseId: string,
  slugOrTitle: string
): string | null {
  const slug = normalizeSlug(slugOrTitle);
  const fr = normalizeSlug(franchiseId) || franchiseId;
  if (!slug) return null;
  return readMap<LeafMap>(LEAF_KEY)[`${module}:${fr}:${slug}`] ?? null;
}

export function clearRouteEntityCache(): void {
  removeSessionEntry(ARTIST_KEY);
  removeSessionEntry(RELEASE_KEY);
  removeSessionEntry(LEAF_KEY);
}
