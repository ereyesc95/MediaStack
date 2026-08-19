import { fetchUniverses } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";
import type { Universe } from "./types";

const NAMESPACE = "universes";

type ModuleKey = "movies" | "series" | "books" | "all";

const memory = new Map<ModuleKey, Universe[]>();
const inflight = new Map<ModuleKey, Promise<Universe[]>>();

function cacheKey(module: ModuleKey): string {
  return sessionCacheKey(NAMESPACE, module);
}

function remember(module: ModuleKey, data: Universe[]): Universe[] {
  memory.set(module, data);
  writeSessionEntry(cacheKey(module), data);
  return data;
}

export function getCachedUniverses(module: ModuleKey = "all"): Universe[] | null {
  if (memory.has(module)) return memory.get(module)!;
  const fromSession = readSessionEntry<Universe[]>(cacheKey(module));
  if (fromSession) {
    memory.set(module, fromSession);
    return fromSession;
  }
  return null;
}

export function clearUniversesCache(): void {
  memory.clear();
  inflight.clear();
  for (const mod of ["movies", "series", "books", "all"] as ModuleKey[]) {
    removeSessionEntry(cacheKey(mod));
  }
}

export function prefetchUniverses(
  module: "movies" | "series" | "books" = "all"
): Promise<Universe[]> {
  const cached = getCachedUniverses(module);
  if (cached) return Promise.resolve(cached);

  const pending = inflight.get(module);
  if (pending) return pending;

  const promise = fetchUniverses(module === "all" ? undefined : module)
    .then((res) => remember(module, res.universes || []))
    .catch(() => remember(module, []))
    .finally(() => {
      inflight.delete(module);
    });

  inflight.set(module, promise);
  return promise;
}
