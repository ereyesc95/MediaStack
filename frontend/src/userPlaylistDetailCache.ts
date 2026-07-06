import { fetchUserPlaylistDetail } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";
import type { ArtistPlaylistDetail } from "./types";

const MAX_ENTRIES = 32;
const NAMESPACE = "user-playlist-detail-v1";

const store = new Map<number, ArtistPlaylistDetail>();
const inflight = new Map<number, Promise<ArtistPlaylistDetail>>();

function sessionKey(playlistId: number): string {
  return sessionCacheKey(NAMESPACE, String(playlistId));
}

function remember(playlistId: number, data: ArtistPlaylistDetail): void {
  if (store.has(playlistId)) store.delete(playlistId);
  store.set(playlistId, data);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest != null) store.delete(oldest);
  }
  writeSessionEntry(sessionKey(playlistId), data);
}

export function getCachedUserPlaylistDetail(
  playlistId: number
): ArtistPlaylistDetail | null {
  const mem = store.get(playlistId);
  if (mem) return mem;
  const fromSession = readSessionEntry<ArtistPlaylistDetail>(sessionKey(playlistId));
  if (fromSession) {
    store.set(playlistId, fromSession);
    return fromSession;
  }
  return null;
}

export function prefetchUserPlaylistDetail(
  playlistId: number,
  options?: { force?: boolean }
): Promise<ArtistPlaylistDetail> {
  const force = options?.force ?? false;

  if (!force) {
    const cached = getCachedUserPlaylistDetail(playlistId);
    if (cached) return Promise.resolve(cached);
  }

  const existing = inflight.get(playlistId);
  if (existing) return existing;

  const pending = fetchUserPlaylistDetail(playlistId)
    .then((data) => {
      remember(playlistId, data);
      return data;
    })
    .finally(() => {
      inflight.delete(playlistId);
    });

  inflight.set(playlistId, pending);
  return pending;
}

export function clearUserPlaylistDetailCache(playlistId?: number): void {
  if (playlistId != null) {
    store.delete(playlistId);
    inflight.delete(playlistId);
    removeSessionEntry(sessionKey(playlistId));
    return;
  }
  store.clear();
  inflight.clear();
}
