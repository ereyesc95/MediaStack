const PREFIX = "ms:v1:";
export const SESSION_CACHE_TTL_MS = 1000 * 60 * 60 * 12;

type Stored<T> = { t: number; d: T };

export function sessionCacheKey(namespace: string, key: string): string {
  return `${PREFIX}${namespace}:${key}`;
}

export function readSessionEntry<T>(
  fullKey: string,
  maxAgeMs = SESSION_CACHE_TTL_MS
): T | null {
  try {
    const raw = sessionStorage.getItem(fullKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (!parsed?.d || typeof parsed.t !== "number") return null;
    if (Date.now() - parsed.t > maxAgeMs) {
      sessionStorage.removeItem(fullKey);
      return null;
    }
    return parsed.d;
  } catch {
    return null;
  }
}

export function writeSessionEntry<T>(fullKey: string, data: T): void {
  try {
    sessionStorage.setItem(
      fullKey,
      JSON.stringify({ t: Date.now(), d: data } satisfies Stored<T>)
    );
  } catch {
    trimOldSessionEntries();
    try {
      sessionStorage.setItem(
        fullKey,
        JSON.stringify({ t: Date.now(), d: data } satisfies Stored<T>)
      );
    } catch {
      /* quota exceeded */
    }
  }
}

export function removeSessionEntry(fullKey: string): void {
  try {
    sessionStorage.removeItem(fullKey);
  } catch {
    /* ignore */
  }
}

/** Remove every sessionStorage entry for a namespace prefix. */
export function clearSessionNamespace(namespace: string): void {
  try {
    const prefix = sessionCacheKey(namespace, "");
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

function trimOldSessionEntries(): void {
  try {
    const entries: { key: string; t: number }[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as Stored<unknown>;
        if (typeof parsed?.t === "number") {
          entries.push({ key, t: parsed.t });
        } else {
          sessionStorage.removeItem(key);
        }
      } catch {
        sessionStorage.removeItem(key);
      }
    }
    entries.sort((a, b) => a.t - b.t);
    const excess = entries.length - 48;
    for (let i = 0; i < excess; i++) {
      sessionStorage.removeItem(entries[i].key);
    }
  } catch {
    /* ignore */
  }
}
