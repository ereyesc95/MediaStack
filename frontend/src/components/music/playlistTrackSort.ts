import type { ArtistPlaylistTrack } from "../../types";

export type PlaylistTrackSortKey =
  | "original"
  | "number"
  | "title"
  | "artist"
  | "album"
  | "year"
  | "duration"
  | "genres"
  | "label"
  | "tempo"
  | "popularity"
  | "energy"
  | "danceability"
  | "valence"
  | "acousticness"
  | "instrumentalness";

export type SnapshotFilterState = {
  artists: string[];
  genres: string[];
};

function splitGenres(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map((g) => g.trim()).filter(Boolean);
}

function trackGenresForFilter(track: ArtistPlaylistTrack): string[] {
  const genres = splitGenres(track.snapshot?.genres);
  return genres.length ? genres : ["Unknown"];
}

function trackLabelForFilter(track: ArtistPlaylistTrack): string {
  return track.snapshot?.record_label?.trim() || "Unknown";
}

export function formatArtistFeat(artist: string): string {
  const parts = artist
    .split(/[;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return artist.trim();
  return `${parts[0]} feat. ${parts.slice(1).join(", ")}`;
}

export function filterGenresToKnown(
  raw: string | null | undefined,
  knownLower: Set<string>
): string {
  if (!raw?.trim()) return "";
  const parts = splitGenres(raw);
  const kept =
    knownLower.size === 0
      ? parts
      : parts.filter((g) => knownLower.has(g.toLowerCase()));
  return kept.map((g) => titleCaseWords(g)).join(", ");
}

function trackArtistForFilter(track: ArtistPlaylistTrack): string {
  return track.snapshot?.artist?.trim() || track.artist_name?.trim() || "Unknown";
}

function trackAlbumForFilter(track: ArtistPlaylistTrack): string {
  return track.snapshot?.album?.trim() || track.album_title?.trim() || "";
}

function trackYearForFilter(track: ArtistPlaylistTrack): string {
  const snap = track.snapshot?.release_date;
  if (snap && /^\d{4}/.test(snap)) return snap.slice(0, 4);
  if (track.year?.trim()) return track.year.trim();
  if (track.release_date && /^\d{4}/.test(track.release_date)) return track.release_date.slice(0, 4);
  return "";
}

export function trackDurationSec(track: ArtistPlaylistTrack): number | null {
  if (track.duration_sec != null && Number.isFinite(track.duration_sec) && track.duration_sec > 0) {
    return track.duration_sec;
  }
  const ms = track.snapshot?.duration_ms;
  if (ms != null && Number.isFinite(ms) && ms > 0) return ms / 1000;
  return null;
}

export function formatTrackDuration(track: ArtistPlaylistTrack): string | null {
  if (track.duration?.trim()) return track.duration.trim();
  const sec = trackDurationSec(track);
  if (sec == null) return null;
  const total = Math.round(sec);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function applySnapshotFilters(
  tracks: ArtistPlaylistTrack[],
  state: SnapshotFilterState
): ArtistPlaylistTrack[] {
  return tracks.filter((track) => {
    if (state.artists.length && !state.artists.includes(trackArtistForFilter(track))) return false;
    if (state.genres.length) {
      const selected = new Set(state.genres.map((g) => g.toLowerCase()));
      const genres = trackGenresForFilter(track);
      if (!genres.some((g) => selected.has(g.toLowerCase()))) return false;
    }
    return true;
  });
}

function sortValue(
  track: ArtistPlaylistTrack,
  key: PlaylistTrackSortKey,
  originalNumbers: Map<number, number>
): string | number {
  const snap = track.snapshot;
  switch (key) {
    case "number":
      return track.entry_id != null ? (originalNumbers.get(track.entry_id) ?? 0) : 0;
    case "title":
      return (track.title || "").toLowerCase();
    case "artist":
      return trackArtistForFilter(track).toLowerCase();
    case "album":
      return trackAlbumForFilter(track).toLowerCase();
    case "year":
      return trackYearForFilter(track);
    case "duration":
      return trackDurationSec(track) ?? -1;
    case "genres":
      return (snap?.genres ?? "").toLowerCase();
    case "label":
      return trackLabelForFilter(track).toLowerCase();
    case "tempo":
      return snap?.tempo ?? -1;
    case "popularity":
      return snap?.popularity ?? -1;
    case "energy":
      return snap?.energy ?? -1;
    case "danceability":
      return snap?.danceability ?? -1;
    case "valence":
      return snap?.valence ?? -1;
    case "acousticness":
      return snap?.acousticness ?? -1;
    case "instrumentalness":
      return snap?.instrumentalness ?? -1;
    default:
      return track.entry_id != null ? (originalNumbers.get(track.entry_id) ?? track.entry_id) : 0;
  }
}

export function applyTrackSort(
  tracks: ArtistPlaylistTrack[],
  key: PlaylistTrackSortKey,
  desc: boolean,
  originalNumbers: Map<number, number>
): ArtistPlaylistTrack[] {
  if (key === "original") {
    return desc ? [...tracks].reverse() : tracks;
  }
  return [...tracks].sort((a, b) => {
    const av = sortValue(a, key, originalNumbers);
    const bv = sortValue(b, key, originalNumbers);
    let cmp = 0;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv));
    return desc ? -cmp : cmp;
  });
}

export function titleCaseWords(value: string): string {
  return value.replace(/\b[\w']+/g, (word) =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}

export function normalizePlayPath(path: string | null | undefined): string {
  return (path ?? "").trim().replace(/\\/g, "/").toLowerCase();
}

export function dedupeTracksByPlayPath(tracks: ArtistPlaylistTrack[]): ArtistPlaylistTrack[] {
  const seen = new Set<string>();
  const out: ArtistPlaylistTrack[] = [];
  for (const track of tracks) {
    const norm = normalizePlayPath(track.play_path);
    if (!norm || track.unavailable) {
      out.push(track);
      continue;
    }
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(track);
  }
  return out;
}
