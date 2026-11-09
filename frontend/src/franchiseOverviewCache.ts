import type { SeriesOverview } from "./types";
import {
  clearSessionNamespace,
  readSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";

const NAMESPACE = "franchise-overview-v7";
const MAX_ENTRIES = 48;
const overviewCache = new Map<string, SeriesOverview>();

function trimMemory(): void {
  while (overviewCache.size > MAX_ENTRIES) {
    const oldest = overviewCache.keys().next().value;
    if (oldest === undefined) break;
    overviewCache.delete(oldest);
  }
}

export function readFranchiseOverviewCache(key: string): SeriesOverview | null {
  const mem = overviewCache.get(key);
  if (mem) {
    // Refresh LRU order.
    overviewCache.delete(key);
    overviewCache.set(key, mem);
    return mem;
  }
  const stored = readSessionEntry<SeriesOverview>(
    sessionCacheKey(NAMESPACE, key)
  );
  if (stored) {
    overviewCache.set(key, stored);
    trimMemory();
    return stored;
  }
  return null;
}

export function writeFranchiseOverviewCache(
  key: string,
  data: SeriesOverview
): void {
  if (overviewCache.has(key)) overviewCache.delete(key);
  overviewCache.set(key, data);
  trimMemory();
  writeSessionEntry(sessionCacheKey(NAMESPACE, key), data);
}

export function clearFranchiseOverviewCache(): void {
  overviewCache.clear();
  clearSessionNamespace(NAMESPACE);
}
