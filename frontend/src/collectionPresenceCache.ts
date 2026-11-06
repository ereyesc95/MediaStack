import { fetchCollection } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";

const NAMESPACE = "music-collection-presence";
const CACHE_KEY = sessionCacheKey(NAMESPACE, "presence");

type Presence = { hasItems: boolean; total: number };

let memory: Presence | null = null;
let inflight: Promise<Presence> | null = null;

function remember(total: number): Presence {
  const next: Presence = { hasItems: total > 0, total: Math.max(0, total) };
  memory = next;
  writeSessionEntry(CACHE_KEY, next);
  return next;
}

function readCached(): Presence | null {
  if (memory != null) return memory;
  const fromSession = readSessionEntry<Presence | boolean>(CACHE_KEY);
  if (fromSession && typeof fromSession === "object") {
    const total = Number((fromSession as Presence).total) || 0;
    const hasItems =
      typeof (fromSession as Presence).hasItems === "boolean"
        ? (fromSession as Presence).hasItems
        : total > 0;
    memory = { hasItems, total };
    return memory;
  }
  // Legacy boolean-only cache from earlier builds.
  if (typeof fromSession === "boolean") {
    memory = { hasItems: fromSession, total: fromSession ? 1 : 0 };
    return memory;
  }
  return null;
}

/** Instant read — null when never probed this session. */
export function getCachedCollectionHasItems(): boolean | null {
  return readCached()?.hasItems ?? null;
}

/** Instant total — null when never probed; 0 when empty. */
export function getCachedCollectionTotal(): number | null {
  const cached = readCached();
  return cached ? cached.total : null;
}

export function setCachedCollectionHasItems(hasItems: boolean): void {
  const prev = readCached();
  remember(hasItems ? Math.max(prev?.total ?? 1, 1) : 0);
}

export function setCachedCollectionPresence(total: number): void {
  remember(Math.max(0, total));
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
  return prefetchCollectionPresenceDetail(options).then((p) => p.hasItems);
}

/** Presence + total for hub cards (e.g. HobbyStack Music tile). */
export function prefetchCollectionPresenceDetail(options?: {
  force?: boolean;
}): Promise<Presence> {
  const force = options?.force ?? false;
  if (!force) {
    const cached = readCached();
    if (cached != null) return Promise.resolve(cached);
  }
  if (inflight) return inflight;
  inflight = fetchCollection({ page: 1, page_size: 1, view: "table" })
    .then((res) => remember(res.total ?? 0))
    .catch(() => readCached() ?? { hasItems: false, total: 0 })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
