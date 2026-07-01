import { fetchBandPlaylistDetail } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";
import type { ArtistPlaylistDetail } from "./types";

const MAX_ENTRIES = 32;
const NAMESPACE = "artist-playlist-detail-v10";
const LEGACY_NAMESPACES = [
  "artist-playlist-detail",
  "artist-playlist-detail-v2",
  "artist-playlist-detail-v3",
  "artist-playlist-detail-v4",
  "artist-playlist-detail-v5",
  "artist-playlist-detail-v6",
  "artist-playlist-detail-v7",
  "artist-playlist-detail-v8",
  "artist-playlist-detail-v9",
];

type CacheKey = `${number}:${string}`;

const store = new Map<CacheKey, ArtistPlaylistDetail>();
const inflight = new Map<CacheKey, Promise<ArtistPlaylistDetail>>();

function purgeLegacyPlaylistDetailCaches(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (LEGACY_NAMESPACES.some((ns) => key.includes(`:${ns}:`))) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}

purgeLegacyPlaylistDetailCaches();

function cacheKey(bandId: number, slug: string): CacheKey {
  return `${bandId}:${slug}`;
}

function sessionKey(bandId: number, slug: string): string {
  return sessionCacheKey(NAMESPACE, cacheKey(bandId, slug));
}

function remember(bandId: number, slug: string, data: ArtistPlaylistDetail): void {
  const key = cacheKey(bandId, slug);
  if (store.has(key)) store.delete(key);
  store.set(key, data);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  writeSessionEntry(sessionKey(bandId, slug), data);
}

export function getCachedArtistPlaylistDetail(
  bandId: number,
  slug: string
): ArtistPlaylistDetail | null {
  const key = cacheKey(bandId, slug);
  const mem = store.get(key);
  if (mem) return mem;
  const fromSession = readSessionEntry<ArtistPlaylistDetail>(sessionKey(bandId, slug));
  if (fromSession) {
    store.set(key, fromSession);
    return fromSession;
  }
  return null;
}

export function prefetchArtistPlaylistDetail(
  bandId: number,
  slug: string,
  options?: { force?: boolean }
): Promise<ArtistPlaylistDetail> {
  const key = cacheKey(bandId, slug);
  const force = options?.force ?? false;

  if (!force) {
    const cached = getCachedArtistPlaylistDetail(bandId, slug);
    if (cached) return Promise.resolve(cached);
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = fetchBandPlaylistDetail(bandId, slug)
    .then((data) => {
      remember(bandId, slug, data);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, pending);
  return pending;
}

export function clearArtistPlaylistDetailCache(bandId?: number, slug?: string): void {
  if (bandId != null && slug) {
    const key = cacheKey(bandId, slug);
    store.delete(key);
    inflight.delete(key);
    removeSessionEntry(sessionKey(bandId, slug));
    return;
  }
  store.clear();
  inflight.clear();
}
