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

export type PrefetchArtistAudioOptions = {
  force?: boolean;
  /** Hit the API with force=false even if memory/session cache exists. */
  revalidate?: boolean;
  /** Called as soon as the audio index returns (before playlists). */
  onAudio?: (audio: AudioIndexPayload) => void;
};

type CacheKey = `${number}`;

const store = new Map<CacheKey, ArtistAudioCacheEntry>();
const inflight = new Map<CacheKey, Promise<ArtistAudioCacheEntry>>();
/** Bumped on clear/force so late in-flight responses cannot overwrite fresher data. */
const epoch = new Map<CacheKey, number>();

function cacheKey(bandId: number): CacheKey {
  return `${bandId}`;
}

function sessionKey(bandId: number): string {
  return sessionCacheKey(NAMESPACE, cacheKey(bandId));
}

function currentEpoch(key: CacheKey): number {
  return epoch.get(key) ?? 0;
}

function bumpEpoch(key: CacheKey): number {
  const next = currentEpoch(key) + 1;
  epoch.set(key, next);
  return next;
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
    bumpEpoch(key);
    removeSessionEntry(sessionKey(bandId));
    return;
  }
  store.clear();
  inflight.clear();
  epoch.clear();
}

async function fetchArtistAudioEntry(
  bandId: number,
  force = false,
  onAudio?: (audio: AudioIndexPayload) => void,
  fetchEpoch = 0
): Promise<ArtistAudioCacheEntry> {
  const key = cacheKey(bandId);
  const audioPromise = fetchBandAudioIndex(bandId, force).then((audio) => {
    if (currentEpoch(key) !== fetchEpoch) return audio;
    const prev = getCachedArtistAudio(bandId);
    remember(bandId, {
      audio,
      playlists: prev?.playlists ?? [],
    });
    onAudio?.(audio);
    return audio;
  });
  const playlistsPromise = fetchBandPlaylistIndex(bandId, force);

  const [audio, playlistPayload] = await Promise.all([
    audioPromise,
    playlistsPromise,
  ]);
  if (currentEpoch(key) !== fetchEpoch) {
    return (
      getCachedArtistAudio(bandId) ?? {
        audio,
        playlists: playlistPayload.playlists,
      }
    );
  }
  const entry: ArtistAudioCacheEntry = {
    audio,
    playlists: playlistPayload.playlists,
  };
  remember(bandId, entry);
  return entry;
}

export function prefetchArtistAudio(
  bandId: number,
  options?: PrefetchArtistAudioOptions
): Promise<ArtistAudioCacheEntry> {
  const key = cacheKey(bandId);
  const force = options?.force ?? false;
  const revalidate = options?.revalidate ?? false;
  const onAudio = options?.onAudio;

  if (!force && !revalidate) {
    const cached = getCachedArtistAudio(bandId);
    if (cached) {
      onAudio?.(cached.audio);
      return Promise.resolve(cached);
    }
    const existing = inflight.get(key);
    if (existing) return existing;
  } else {
    inflight.delete(key);
    if (force) bumpEpoch(key);
  }

  const fetchEpoch = currentEpoch(key);
  const pending = fetchArtistAudioEntry(
    bandId,
    force,
    onAudio,
    fetchEpoch
  ).finally(() => {
    if (inflight.get(key) === pending) inflight.delete(key);
  });

  inflight.set(key, pending);
  return pending;
}
