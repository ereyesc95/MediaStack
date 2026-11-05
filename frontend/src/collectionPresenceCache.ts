import { fetchCollection } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";

const NAMESPACE = "music-collection-presence";
const CACHE_KEY = sessionCacheKey(NAMESPACE, "has-items");

let memory: boolean | null = null;
let inflight: Promise<boolean> | null = null;

function remember(hasItems: boolean): boolean {
  memory = hasItems;
  writeSessionEntry(CACHE_KEY, hasItems);
  return hasItems;
}

/** Instant read — null when never probed this session. */
export function getCachedCollectionHasItems(): boolean | null {
  if (memory != null) return memory;
  const fromSession = readSessionEntry<boolean>(CACHE_KEY);
  if (typeof fromSession === "boolean") {
    memory = fromSession;
    return fromSession;
  }
  return null;
}

export function setCachedCollectionHasItems(hasItems: boolean): void {
  remember(hasItems);
}

export function clearCollectionPresenceCache(): void {
  memory = null;
  inflight = null;
  removeSessionEntry(CACHE_KEY);
}

/** Warm presence so Music COLLECTION tab can paint with the other tabs. */
export function prefetchCollectionPresence(options?: {
  force?: boolean;
}): Promise<boolean> {
  const force = options?.force ?? false;
  if (!force) {
    const cached = getCachedCollectionHasItems();
    if (cached != null) return Promise.resolve(cached);
  }
  if (inflight) return inflight;
  inflight = fetchCollection({ page: 1, page_size: 1, view: "table" })
    .then((res) => remember((res.total ?? 0) > 0))
    .catch(() => getCachedCollectionHasItems() ?? false)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
