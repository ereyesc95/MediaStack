import { authHeaders, type ProfileUser } from "./auth";
import type {
  ArtistCard,
  Band,
  FilterOptions,
  Health,
  MbArtistMatch,
  MusicDashboard,
  PlaylistTrack,
  UserPlaylist,
} from "./types";
import { EMPTY_DASHBOARD } from "./types";

const API = "/api";
const FETCH_TIMEOUT_MS = 30_000;
const LONG_RUNNING_TIMEOUT_MS = 180_000;

async function request<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(authHeaders())) {
    headers.set(k, v);
  }
  try {
    res = await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Request timed out. Is MediaStack running?");
    }
    if (e instanceof TypeError) {
      throw new Error("Cannot reach the API. Start python run.py");
    }
    throw e;
  } finally {
    window.clearTimeout(timeout);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function fetchHealth(): Promise<Health> {
  return request(`${API}/health`);
}

export async function fetchProfiles(): Promise<ProfileUser[]> {
  return request(`${API}/auth/profiles`);
}

export async function selectProfile(
  userId: number,
  password?: string
): Promise<ProfileUser> {
  return request(`${API}/auth/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, password: password ?? null }),
  });
}

export async function updateProfile(body: {
  display_name?: string;
  avatar?: string | null;
}): Promise<ProfileUser> {
  return request(`${API}/auth/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function uploadProfileAvatar(file: File): Promise<ProfileUser> {
  const form = new FormData();
  form.append("file", file);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers = new Headers();
  for (const [k, v] of Object.entries(authHeaders())) {
    headers.set(k, v);
  }
  let res: Response;
  try {
    res = await fetch(`${API}/auth/profile/avatar`, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function fetchSession(): Promise<{
  user: ProfileUser | null;
  token: string | null;
  media_server_url: string;
}> {
  return request(`${API}/auth/session`);
}

export async function logoutProfile(): Promise<void> {
  await request(`${API}/auth/logout`, { method: "POST" });
}

export async function fetchMusicDashboard(): Promise<MusicDashboard> {
  try {
    return await request(`${API}/music/dashboard`);
  } catch {
    return EMPTY_DASHBOARD;
  }
}

export async function fetchArtistCards(
  params: URLSearchParams
): Promise<{ items: ArtistCard[]; total: number; page: number }> {
  return request(`${API}/music/artist-cards?${params}`);
}

export async function fetchFilterOptions(): Promise<FilterOptions> {
  return request(`${API}/music/filters/options`);
}

export async function fetchInstrumentOptions(): Promise<{
  groups: { type: string; items: { id: number; name: string }[] }[];
}> {
  return request(`${API}/music/filters/instruments`);
}

export async function searchRosterArtists(
  q: string,
  limit = 25
): Promise<{ items: { id: number; name: string }[] }> {
  return request(
    `${API}/music/filters/roster-artists?q=${encodeURIComponent(q)}&limit=${limit}`
  );
}

export async function searchRosterBands(
  q: string,
  limit = 25
): Promise<{ items: { id: number; name: string }[] }> {
  return request(
    `${API}/music/filters/roster-bands?q=${encodeURIComponent(q)}&limit=${limit}`
  );
}

export async function searchMusicBrainz(
  q: string
): Promise<{ items: MbArtistMatch[] }> {
  return request(`${API}/music/musicbrainz/search?q=${encodeURIComponent(q)}`);
}

export async function importBandFromMb(mbid: string) {
  return request<{ id: number; code: string; name: string; existing: boolean }>(
    `${API}/music/bands/import`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mbid }),
    }
  );
}

export async function fetchBand(id: number): Promise<Band> {
  return request(`${API}/music/bands/${id}`);
}

export async function fetchBandOverview(
  id: number,
  orientation: "landscape" | "portrait" = "landscape"
) {
  return request<import("./types").BandOverview>(
    `${API}/music/bands/${id}/overview?orientation=${orientation}`,
    undefined,
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function importBandLineup(
  bandId: number
): Promise<{
  ok: boolean;
  skipped?: boolean;
  imported?: number;
  imported_at?: string;
  error?: string;
}> {
  return request(
    `${API}/music/bands/${bandId}/import-lineup`,
    { method: "POST" },
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function refreshBandMetadata(
  id: number,
  includeBio: boolean
): Promise<{ ok: boolean; refreshed_at?: string; error?: string }> {
  return request(`${API}/music/bands/${id}/refresh-metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ include_bio: includeBio }),
  });
}

export async function rescanBandLibrary(
  id: number
): Promise<{ ok: boolean; scanned_at?: string; error?: string }> {
  return request(`${API}/music/bands/${id}/rescan-library`, { method: "POST" });
}

export async function fetchBandGalleryIndex(
  id: number
): Promise<import("./types").GalleryIndexPayload> {
  return request(`${API}/music/bands/${id}/media/gallery`);
}

export async function fetchBandAudioIndex(
  id: number,
  force = false
): Promise<import("./types").AudioIndexPayload> {
  const q = force ? "?force=true" : "";
  return request(
    `${API}/music/bands/${id}/media/audio${q}`,
    undefined,
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function fetchReleaseOverview(
  bandId: number,
  releaseId: string,
  orientation: "landscape" | "portrait" = "landscape"
): Promise<import("./types").ReleaseOverview> {
  return request(
    `${API}/music/bands/${bandId}/releases/${releaseId}/overview?orientation=${orientation}`,
    undefined,
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function fetchReleaseTracklist(
  bandId: number,
  releaseId: string
): Promise<import("./types").ReleaseTracklist> {
  return request(
    `${API}/music/bands/${bandId}/releases/${releaseId}/tracklist`,
    undefined,
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function fetchReleaseGallery(
  bandId: number,
  releaseId: string
): Promise<import("./types").ReleaseGalleryPayload> {
  return request(
    `${API}/music/bands/${bandId}/releases/${releaseId}/gallery`,
    undefined,
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function searchArtistReleases(bandId: number, q: string) {
  return request<{
    releases: {
      id: string;
      title: string;
      cover_url: string | null;
      display_date: string | null;
      category: string;
    }[];
    tracks: {
      title: string;
      play_path: string;
      album_title: string | null;
    }[];
  }>(
    `${API}/music/bands/${bandId}/releases/search?q=${encodeURIComponent(q)}`
  );
}

export async function fetchTrackCredits(
  bandId: number,
  releaseId: string,
  title: string
): Promise<import("./types").TrackCredits> {
  const q = new URLSearchParams({ title });
  return request(
    `${API}/music/bands/${bandId}/releases/${releaseId}/tracks/credits?${q}`
  );
}

export async function resolveArtistName(name: string): Promise<{
  name: string;
  in_library: boolean;
  band_id: number | null;
  urls: Record<string, string>;
}> {
  const q = new URLSearchParams({ name });
  return request(`${API}/music/resolve-artist-name?${q}`);
}

export async function addTrackToPlaylist(
  playlistId: number,
  body: { title: string; artist: string; release: string; path: string }
) {
  return request<{ ok: boolean; id?: number; duplicate?: boolean }>(
    `${API}/music/playlists/${playlistId}/tracks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function fetchBandVideoIndex(
  bandId: number
): Promise<import("./types").MediaTabIndexPayload> {
  return request(`${API}/music/bands/${bandId}/media/video`);
}

export async function fetchBandLibraryIndex(
  bandId: number
): Promise<import("./types").MediaTabIndexPayload> {
  return request(`${API}/music/bands/${bandId}/media/library`);
}

export async function fetchQuizDiscography(bandId: number) {
  return request<{
    releases: { id: string; title: string; tracks: { title: string; number: number }[] }[];
    is_solo: boolean;
  }>(`${API}/music/bands/${bandId}/quiz/discography`);
}

export async function fetchQuizLineup(bandId: number) {
  return request<{
    members: {
      id: number;
      name: string;
      photo_url?: string | null;
      years?: string | null;
      roles?: string[];
      is_deceased?: boolean;
    }[];
    disabled?: boolean;
  }>(`${API}/music/bands/${bandId}/quiz/lineup`);
}

export async function fetchQuizSongs(bandId: number, rounds = 10) {
  return request<{
    questions: {
      play_path: string;
      correct_title: string;
      choices: {
        id: string;
        play_path?: string;
        title: string;
        cover_url?: string | null;
        release_date?: string | null;
      }[];
    }[];
    rounds: number;
  }>(`${API}/music/bands/${bandId}/quiz/songs?rounds=${rounds}`);
}

export async function fetchQuizScores(bandId: number) {
  return request<import("./types").QuizScores>(
    `${API}/music/bands/${bandId}/quiz/scores`
  );
}

export async function fetchWordCloud(bandId: number) {
  return request<import("./types").WordCloudPayload>(
    `${API}/music/bands/${bandId}/word-cloud`
  );
}

export async function prefetchWordCloud(bandId: number, maxTracks = 24) {
  return request<import("./types").WordCloudPayload & { cached_tracks: number }>(
    `${API}/music/bands/${bandId}/word-cloud/prefetch?max_tracks=${maxTracks}`,
    { method: "POST" }
  );
}

export async function fetchMediaItemOverview(
  bandId: number,
  kind: "video" | "library",
  itemId: string
) {
  return request<import("./types").MediaItemOverview>(
    `${API}/music/bands/${bandId}/media/${kind}/${itemId}`
  );
}

export async function saveQuizScore(
  bandId: number,
  body: {
    quiz_type: string;
    score: number;
    total: number;
    time_ms?: number;
  }
) {
  return request<import("./types").QuizScoreEntry>(
    `${API}/music/bands/${bandId}/quiz/scores`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function fetchTrackVersions(
  bandId: number,
  releaseId: string,
  title: string,
  playPath: string
): Promise<{ title: string; versions: import("./types").TrackVersionItem[] }> {
  const q = new URLSearchParams({ title, play_path: playPath });
  return request(
    `${API}/music/bands/${bandId}/releases/${releaseId}/tracks/versions?${q}`,
    undefined,
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function fetchTrackSourceArt(
  bandId: number,
  releaseId: string,
  playPath: string
): Promise<{
  play_path: string;
  playback: import("./types").ReleasePlaybackArt;
  artwork: import("./types").ReleaseGalleryItem[];
  photocards?: import("./types").ReleaseOverview["photocards"] | null;
}> {
  const q = new URLSearchParams({ play_path: playPath });
  return request(
    `${API}/music/bands/${bandId}/releases/${releaseId}/tracks/source-art?${q}`
  );
}

export async function fetchReleaseLyrics(
  bandId: number,
  releaseId: string,
  force = false
): Promise<{
  ok: boolean;
  error?: string;
  fetched?: number;
  skipped?: number;
  failed?: number;
  not_found?: number;
  items?: {
    title: string;
    status: string;
    path?: string;
    matched_title?: string;
  }[];
}> {
  const q = force ? "?force=true" : "";
  return request(
    `${API}/music/bands/${bandId}/releases/${releaseId}/lyrics/fetch${q}`,
    { method: "POST" },
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function refreshReleaseMetadata(
  bandId: number,
  releaseId: string,
  includeWikipedia: boolean
): Promise<{
  ok: boolean;
  refreshed_at?: string;
  error?: string;
  overview?: import("./types").ReleaseOverview;
}> {
  return request(
    `${API}/music/bands/${bandId}/releases/${releaseId}/refresh-metadata`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ include_wikipedia: includeWikipedia }),
    },
    LONG_RUNNING_TIMEOUT_MS
  );
}

export type FileTagValues = {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  albumartist?: string | null;
  date?: string | null;
  tracknumber?: string | null;
  discnumber?: string | null;
  genre?: string | null;
};

export type WriteFileTagsTrackIn = {
  play_path: string;
  selected: boolean;
  include_lyrics: boolean;
  tags: FileTagValues;
  writers?: string | null;
};

export type FileTagEditionCover = {
  edition_id: string;
  cover_path?: string | null;
};

export async function pickReleaseCoverForFileTags(
  bandId: number,
  releaseId: string,
  editionId?: string
): Promise<{
  ok: boolean;
  cancelled?: boolean;
  edition_id?: string;
  cover_path?: string;
  preview_url?: string;
  error?: string;
}> {
  return request(
    `${API}/music/bands/${bandId}/releases/${releaseId}/write-file-tags/pick-cover`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        editionId ? { edition_id: editionId } : {}
      ),
    }
  );
}

/** Load cover preview with Bearer auth (img src cannot send Authorization). */
export async function fetchFileTagsCoverPreviewUrl(
  previewUrl: string
): Promise<string> {
  const headers = new Headers();
  for (const [k, v] of Object.entries(authHeaders())) {
    headers.set(k, v);
  }
  const res = await fetch(previewUrl, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Cover preview failed");
  }
  return URL.createObjectURL(await res.blob());
}

export async function syncReleaseFileTags(
  bandId: number,
  releaseId: string,
  dryRun: boolean,
  options?: {
    includeCover?: boolean;
    coverPath?: string | null;
    editionCovers?: FileTagEditionCover[];
    tracks?: WriteFileTagsTrackIn[];
  }
): Promise<{
  ok: boolean;
  dry_run?: boolean;
  include_cover?: boolean;
  cover_url?: string | null;
  editions?: {
    id: string;
    label: string;
    cover_path?: string | null;
    artwork_dir?: string | null;
    preview_url?: string | null;
  }[];
  release_title?: string;
  error?: string;
  tracks?: {
    play_path: string;
    edition_id?: string | null;
    file_name: string | null;
    tags: FileTagValues;
    writers?: string | null;
    has_lyrics?: boolean;
    status: string;
    message?: string | null;
  }[];
  summary?: {
    total: number;
    ready: number;
    written: number;
    skipped: number;
    errors: number;
  };
  errors?: { play_path: string; error: string }[];
}> {
  return request(
    `${API}/music/bands/${bandId}/releases/${releaseId}/write-file-tags`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dry_run: dryRun,
        include_cover: options?.includeCover ?? false,
        cover_path: options?.coverPath ?? null,
        edition_covers: options?.editionCovers,
        tracks: options?.tracks,
      }),
    },
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function patchReleaseOverview(
  bandId: number,
  releaseId: string,
  body: {
    description?: string | null;
    producer?: string | null;
    label?: string | null;
    subgenres?: string[] | null;
  }
) {
  return request<import("./types").ReleaseOverview>(
    `${API}/music/bands/${bandId}/releases/${releaseId}/overview`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function fetchTrackLyrics(
  artist: string,
  title: string,
  playPath?: string,
  options?: { bandId?: number; releaseId?: string }
) {
  const q = new URLSearchParams({ artist, title });
  if (playPath) q.set("play_path", playPath);
  if (options?.bandId != null) q.set("band_id", String(options.bandId));
  if (options?.releaseId) q.set("release_id", options.releaseId);
  return request<{
    artist: string;
    title: string;
    lyrics: string | null;
    synced_lyrics?: string | null;
    source: string;
  }>(`${API}/music/lyrics?${q}`, undefined, 25_000);
}

export async function saveTrackLyrics(body: {
  artist: string;
  title: string;
  play_path?: string;
  lyrics: string;
  synced_lyrics?: string | null;
  band_id?: number;
}) {
  return request<{
    artist: string;
    title: string;
    lyrics: string | null;
    synced_lyrics?: string | null;
    source: string;
  }>(`${API}/music/lyrics`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchTrackYoutube(
  artist: string,
  title: string,
  playPath?: string,
  bandId?: number
) {
  const q = new URLSearchParams({ artist, title });
  if (playPath) q.set("play_path", playPath);
  if (bandId) q.set("band_id", String(bandId));
  return request<{
    artist: string;
    title: string;
    youtube_url: string | null;
    youtube_videos?: import("./types").TrackYoutubeVideo[];
    source: string;
  }>(`${API}/music/youtube?${q}`);
}

export async function saveTrackYoutube(body: {
  artist: string;
  title: string;
  play_path?: string;
  youtube_url?: string | null;
  youtube_videos?: import("./types").TrackYoutubeVideo[];
  band_id?: number;
}) {
  return request<{
    artist: string;
    title: string;
    youtube_url: string | null;
    youtube_videos?: import("./types").TrackYoutubeVideo[];
    source: string;
  }>(`${API}/music/youtube`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchReleaseYoutubeCandidates(
  bandId: number,
  releaseId: string,
  singlesOnly = false
): Promise<{
  ok: boolean;
  error?: string;
  artist?: string;
  found?: number;
  skipped?: number;
  not_found?: number;
  items?: {
    title: string;
    play_path: string;
    edition_kind?: string;
    group_kind?: string;
    existing_url?: string | null;
    status: string;
    candidates: { url: string; label: string; source: string }[];
  }[];
}> {
  const q = singlesOnly ? "?singles_only=true" : "";
  return request(
    `${API}/music/bands/${bandId}/releases/${releaseId}/youtube/fetch${q}`,
    { method: "POST" },
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function fetchBandPlaylistIndex(
  id: number,
  force = false
): Promise<import("./types").PlaylistIndexPayload> {
  const q = force ? "?force=true" : "";
  return request(
    `${API}/music/bands/${id}/media/playlists${q}`,
    undefined,
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function fetchBandPlaylistDetail(
  bandId: number,
  slug: string
): Promise<import("./types").ArtistPlaylistDetail> {
  return request(`${API}/music/bands/${bandId}/media/playlists/${slug}`);
}

export async function fetchSetlistShows(
  bandId: number,
  year: string
): Promise<{ year: string; shows: import("./types").SetlistShowSummary[] }> {
  return request(`${API}/music/bands/${bandId}/media/playlists/setlists/shows?year=${encodeURIComponent(year)}`);
}

export async function fetchSetlistTracks(
  bandId: number,
  setlistId: string
): Promise<import("./types").SetlistTracklistPayload> {
  return request(`${API}/music/bands/${bandId}/media/playlists/setlists/${encodeURIComponent(setlistId)}`);
}

export async function patchBandBio(id: number, bio: string) {
  return request(`${API}/music/bands/${id}/bio`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bio }),
  });
}

export async function fetchArtistDetails(id: number, bandId?: number) {
  const q = bandId ? `?band_id=${bandId}` : "";
  return request<import("./types").ArtistDetails>(
    `${API}/music/artists/${id}${q}`
  );
}

export async function uploadArtistPhoto(
  artistId: number,
  file: File
): Promise<{ ok: boolean; photo_url: string }> {
  const form = new FormData();
  form.append("file", file);
  const headers = new Headers();
  for (const [k, v] of Object.entries(authHeaders())) {
    headers.set(k, v);
  }
  const res = await fetch(`${API}/music/artists/${artistId}/photo`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function patchArtist(
  id: number,
  body: {
    name?: string;
    stage_name?: string;
    aliases?: string;
    birth_date?: string;
    birth_place?: string;
    birth_country_id?: number | null;
    death_date?: string;
    mbid?: string;
  }
) {
  return request(`${API}/music/artists/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function patchBandAbout(
  bandId: number,
  body: {
    bio?: string;
    aliases?: string;
    origin_city?: string;
    country_id?: number | null;
    activity_start?: string;
    activity_end?: string;
  }
) {
  return request(`${API}/music/bands/${bandId}/about`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createParticipation(
  bandId: number,
  body: {
    artist_id?: number;
    name?: string;
    mbid?: string;
    start?: string;
    end?: string;
    roles_text?: string;
    is_official?: boolean;
    is_founding?: boolean;
    is_former?: boolean;
  }
) {
  return request<{ ok: boolean; participation_id: number; artist_id: number }>(
    `${API}/music/bands/${bandId}/participations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function patchParticipation(
  bandId: number,
  arpId: number,
  body: {
    start?: string;
    end?: string;
    roles_text?: string;
    is_official?: boolean;
    is_founding?: boolean;
    is_former?: boolean;
  }
) {
  return request(`${API}/music/bands/${bandId}/participations/${arpId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteParticipation(bandId: number, arpId: number) {
  return request(`${API}/music/bands/${bandId}/participations/${arpId}`, {
    method: "DELETE",
  });
}

export async function refreshBandLineup(
  id: number
): Promise<{ ok: boolean; imported?: number; error?: string }> {
  return request(
    `${API}/music/bands/${id}/refresh-lineup`,
    { method: "POST" },
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function refreshBandPhotos(
  id: number,
  force = false
): Promise<{ ok: boolean; resolved?: number }> {
  const q = force ? "?force=true" : "";
  return request(
    `${API}/music/bands/${id}/refresh-photos${q}`,
    { method: "POST" },
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function refreshBandLinks(
  id: number
): Promise<{ ok: boolean; added?: number; error?: string }> {
  return request(
    `${API}/music/bands/${id}/refresh-links`,
    { method: "POST" },
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function resolveVaContributorPhotos(
  id: number,
  orientation: "landscape" | "portrait" = "landscape"
) {
  return request<{ ok: boolean; resolved?: number }>(
    `${API}/music/bands/${id}/resolve-va-contributor-photos?orientation=${orientation}`,
    { method: "POST" },
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function resolveBandRelatedPhotos(id: number) {
  return request<{ ok: boolean; resolved?: number }>(
    `${API}/music/bands/${id}/resolve-related-photos`,
    { method: "POST" },
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function fetchBandRelated(id: number) {
  return request<{ ok: boolean }>(
    `${API}/music/bands/${id}/fetch-related`,
    { method: "POST" },
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function refreshBandRelatedSimilar(id: number) {
  return request<{ ok: boolean; added?: number; fetched_at?: string }>(
    `${API}/music/bands/${id}/refresh-related-similar`,
    { method: "POST" },
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function refreshBandRelatedParticipations(id: number) {
  return request<{ ok: boolean; count?: number; fetched_at?: string }>(
    `${API}/music/bands/${id}/refresh-related-participations`,
    { method: "POST" },
    LONG_RUNNING_TIMEOUT_MS
  );
}

export async function addBandSimilar(
  bandId: number,
  body: { name: string; mbid?: string | null }
) {
  return request<{ ok: boolean; id: number }>(
    `${API}/music/bands/${bandId}/related/similar`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function deleteBandRelated(bandId: number, erlId: number) {
  return request(`${API}/music/bands/${bandId}/related/${erlId}`, {
    method: "DELETE",
  });
}

export async function fetchLinkCatalog(): Promise<{
  items: import("./types").LinkCatalogEntry[];
}> {
  return request(`${API}/music/filters/link-catalog`);
}

export async function createEntityLink(
  entityType: "band" | "artist",
  entityId: number,
  body: {
    category: string;
    label: string;
    url: string;
    logo_key?: string | null;
  }
): Promise<{ ok: boolean; id: number }> {
  const base =
    entityType === "band"
      ? `${API}/music/bands/${entityId}/links`
      : `${API}/music/artists/${entityId}/links`;
  return request(base, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function patchEntityLink(
  entityType: "band" | "artist",
  entityId: number,
  linkId: number,
  body: {
    category?: string;
    label?: string;
    url?: string;
    logo_key?: string | null;
    clear_logo_upload?: boolean;
  }
): Promise<{ ok: boolean }> {
  const base =
    entityType === "band"
      ? `${API}/music/bands/${entityId}/links/${linkId}`
      : `${API}/music/artists/${entityId}/links/${linkId}`;
  return request(base, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteEntityLink(
  entityType: "band" | "artist",
  entityId: number,
  linkId: number
): Promise<{ ok: boolean }> {
  const base =
    entityType === "band"
      ? `${API}/music/bands/${entityId}/links/${linkId}`
      : `${API}/music/artists/${entityId}/links/${linkId}`;
  return request(base, { method: "DELETE" });
}

export async function uploadEntityLinkLogo(
  entityType: "band" | "artist",
  entityId: number,
  linkId: number,
  file: File
): Promise<{ ok: boolean; logo_path: string }> {
  const form = new FormData();
  form.append("file", file);
  const headers = new Headers();
  for (const [k, v] of Object.entries(authHeaders())) {
    headers.set(k, v);
  }
  const base =
    entityType === "band"
      ? `${API}/music/bands/${entityId}/links/${linkId}/logo`
      : `${API}/music/artists/${entityId}/links/${linkId}/logo`;
  const res = await fetch(base, { method: "POST", headers, body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function fetchUserPlaylists(): Promise<{ items: UserPlaylist[] }> {
  return request(`${API}/music/playlists`);
}

export async function createUserPlaylist(name: string): Promise<{
  ok: boolean;
  id: number;
  name?: string;
  duplicate?: boolean;
  error?: string;
}> {
  return request(`${API}/music/playlists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function fetchPlaylistTracks(
  id: number
): Promise<{ items: PlaylistTrack[] }> {
  return request(`${API}/music/playlists/${id}/tracks`);
}

export async function playTrack(body: {
  path: string;
  artist_id?: number;
  title?: string;
  release?: string;
  record?: boolean;
}) {
  return request<{ stream_url: string; title?: string; cover_url?: string | null }>(`${API}/music/play`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, media_type: 200 }),
  });
}

export async function importSql(replace = false) {
  return request<{ tables: Record<string, number>; errors: string[] }>(
    `${API}/import/sql?replace=${replace}`,
    { method: "POST" }
  );
}

export async function syncFolders(module = "all", mediaRoot?: string) {
  return request<{ status: string; results: unknown[] }>(`${API}/sync/folders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ module, media_root: mediaRoot ?? null }),
  });
}

export type AppSettings = {
  media_root: string;
  media_root_configured: boolean;
  media_root_chosen: boolean;
  media_server_url: string;
  database_url: string;
};

export async function fetchAppSettings(): Promise<AppSettings> {
  return request(`${API}/settings`);
}

export async function pickMediaRoot(): Promise<{
  media_root: string;
  media_root_configured: boolean;
}> {
  return request(
    `${API}/settings/pick-media-root`,
    { method: "POST" },
    300_000
  );
}

export async function setMediaRoot(path: string): Promise<{
  media_root: string;
  media_root_configured: boolean;
}> {
  return request(`${API}/settings/media-root`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}
