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

export async function searchRosterArtists(
  q: string,
  limit = 25
): Promise<{ items: { id: number; name: string }[] }> {
  return request(
    `${API}/music/filters/roster-artists?q=${encodeURIComponent(q)}&limit=${limit}`
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

export async function fetchUserPlaylists(): Promise<{ items: UserPlaylist[] }> {
  return request(`${API}/music/playlists`);
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
}) {
  return request<{ stream_url: string; title?: string }>(`${API}/music/play`, {
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
