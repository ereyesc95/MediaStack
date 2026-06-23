import { fetchBandAudioIndex, fetchBandPlaylistIndex } from "./api";
import {
  readSessionEntry,
  removeSessionEntry,
  sessionCacheKey,
  writeSessionEntry,
} from "./sessionCache";
import type { ArtistPlaylistCard, AudioIndexPayload } from "./types";

const MAX_ENTRIES = 24;
const NAMESPACE = "artist-audio";

export type ArtistAudioCacheEntry = {
  audio: AudioIndexPayload;
  playlists: ArtistPlaylistCard[];
};

type CacheKey = `${number}`;

const store = new Map<CacheKey, ArtistAudioCacheEntry>();
const inflight = new Map<CacheKey, Promise<ArtistAudioCacheEntry>>();

function cacheKey(bandId: number): CacheKey {
  return `${bandId}`;
}

function sessionKey(bandId: number): string {
  return sessionCacheKey(NAMESPACE, cacheKey(bandId));
}

function remember(bandId: number, entry: ArtistAudioCacheEntry): void {
  const key = cacheKey(bandId);
  if (store.has(key)) store.delete(key);
  store.set(key, entry);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  writeSessionEntry(sessionKey(bandId), entry);
}

export function getCachedArtistAudio(bandId: number): ArtistAudioCacheEntry | null {
  const key = cacheKey(bandId);
  const mem = store.get(key);
  if (mem) return mem;
  const fromSession = readSessionEntry<ArtistAudioCacheEntry>(sessionKey(bandId));
  if (fromSession) {
    store.set(key, fromSession);
    return fromSession;
  }
  return null;
}

export function clearArtistAudioCache(bandId?: number): void {
  if (bandId != null) {
    const key = cacheKey(bandId);
    store.delete(key);
    inflight.delete(key);
    removeSessionEntry(sessionKey(bandId));
    return;
  }
  store.clear();
  inflight.clear();
}

async function fetchArtistAudioEntry(bandId: number): Promise<ArtistAudioCacheEntry> {
  const [audio, playlistPayload] = await Promise.all([
    fetchBandAudioIndex(bandId),
    fetchBandPlaylistIndex(bandId),
  ]);
  const entry: ArtistAudioCacheEntry = {
    audio,
    playlists: playlistPayload.playlists,
  };
  remember(bandId, entry);
  return entry;
}

export function prefetchArtistAudio(
  bandId: number,
  options?: { force?: boolean }
): Promise<ArtistAudioCacheEntry> {
  const key = cacheKey(bandId);
  const force = options?.force ?? false;

  if (!force) {
    const cached = getCachedArtistAudio(bandId);
    if (cached) return Promise.resolve(cached);
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = fetchArtistAudioEntry(bandId).finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, pending);
  return pending;
}
