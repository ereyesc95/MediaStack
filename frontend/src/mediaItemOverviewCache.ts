import { fetchMediaItemOverview } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";
import type { MediaItemOverview } from "./types";

const MAX_ENTRIES = 32;
const NAMESPACE = "media-item-overview-v7";

type CacheKey = `${number}:${"video" | "library"}:${string}`;

const store = new Map<CacheKey, MediaItemOverview>();
const inflight = new Map<CacheKey, Promise<MediaItemOverview>>();

function cacheKey(
  bandId: number,
  kind: "video" | "library",
  itemId: string
): CacheKey {
  return `${bandId}:${kind}:${itemId}`;
}

function sessionKey(
  bandId: number,
  kind: "video" | "library",
  itemId: string
): string {
  return sessionCacheKey(NAMESPACE, cacheKey(bandId, kind, itemId));
}

function remember(
  bandId: number,
  kind: "video" | "library",
  itemId: string,
  data: MediaItemOverview
): void {
  const key = cacheKey(bandId, kind, itemId);
  if (store.has(key)) store.delete(key);
  store.set(key, data);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  writeSessionEntry(sessionKey(bandId, kind, itemId), data);
}

export function getCachedMediaItemOverview(
  bandId: number,
  kind: "video" | "library",
  itemId: string
): MediaItemOverview | null {
  const key = cacheKey(bandId, kind, itemId);
  const mem = store.get(key);
  if (mem) return mem;
  const fromSession = readSessionEntry<MediaItemOverview>(
    sessionKey(bandId, kind, itemId)
  );
  if (fromSession) {
    store.set(key, fromSession);
    return fromSession;
  }
  return null;
}

export function prefetchMediaItemOverview(
  bandId: number,
  kind: "video" | "library",
  itemId: string,
  options?: { force?: boolean }
): Promise<MediaItemOverview> {
  const key = cacheKey(bandId, kind, itemId);
  const force = options?.force ?? false;

  if (!force) {
    const cached = getCachedMediaItemOverview(bandId, kind, itemId);
    if (cached) return Promise.resolve(cached);
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = fetchMediaItemOverview(bandId, kind, itemId)
    .then((data) => {
      remember(bandId, kind, itemId, data);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, pending);
  return pending;
}

export function setCachedMediaItemOverview(
  bandId: number,
  kind: "video" | "library",
  itemId: string,
  data: MediaItemOverview
): void {
  remember(bandId, kind, itemId, data);
}

export function clearMediaItemOverviewCache(
  bandId?: number,
  kind?: "video" | "library",
  itemId?: string
): void {
  if (bandId != null && kind && itemId) {
    const key = cacheKey(bandId, kind, itemId);
    store.delete(key);
    inflight.delete(key);
    removeSessionEntry(sessionKey(bandId, kind, itemId));
    return;
  }
  store.clear();
  inflight.clear();
}
