import type { ArtistPlaylistSection, ArtistPlaylistTrack } from "./types";

export type LiveShowsViewMode = "by-show" | "by-artist" | "all-tracks";

export type LiveShowsPlayOccurrence = {
  date_iso?: string | null;
  display_date?: string | null;
  venue?: string | null;
  city?: string | null;
};

function trackKey(t: ArtistPlaylistTrack): string {
  const artist = (t.artist_name || t.snapshot?.artist || "").trim().toLowerCase();
  const title = (t.title || "").trim().toLowerCase();
  return `${artist}|${title}`;
}

function occurrenceLabel(o: LiveShowsPlayOccurrence): string {
  const date = o.display_date || o.date_iso || "";
  const place = [o.venue, o.city].filter(Boolean).join(", ");
  return [date, place].filter(Boolean).join(" · ");
}

function mergeOccurrences(
  a: LiveShowsPlayOccurrence[] | undefined,
  b: LiveShowsPlayOccurrence[] | undefined
): LiveShowsPlayOccurrence[] {
  const out: LiveShowsPlayOccurrence[] = [];
  const seen = new Set<string>();
  for (const o of [...(a || []), ...(b || [])]) {
    const key = occurrenceLabel(o);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  out.sort((x, y) => (x.date_iso || "").localeCompare(y.date_iso || ""));
  return out;
}

function earliestDate(t: ArtistPlaylistTrack): string {
  const occs = t.play_occurrences;
  if (occs?.length) {
    return occs.map((o) => o.date_iso || "").sort()[0] || t.show_date_iso || "";
  }
  return t.show_date_iso || t.release_date || "";
}

export function buildUniqueLiveTracks(tracks: ArtistPlaylistTrack[]): ArtistPlaylistTrack[] {
  const map = new Map<string, ArtistPlaylistTrack>();
  for (const t of tracks) {
    const key = trackKey(t);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...t,
        play_occurrences: mergeOccurrences(t.play_occurrences, [
          {
            date_iso: t.show_date_iso,
            venue: t.venue,
            city: t.city,
          },
        ]),
        live_plays_count:
          t.live_plays_count ??
          (t.play_occurrences?.length || 1),
      });
      continue;
    }
    const occs = mergeOccurrences(existing.play_occurrences, t.play_occurrences);
    map.set(key, {
      ...existing,
      play_occurrences: occs,
      live_plays_count: occs.length,
      play_path: existing.play_path || t.play_path,
      album_title: existing.album_title || t.album_title,
      navigate_release_id: existing.navigate_release_id || t.navigate_release_id,
      navigate_band_id: existing.navigate_band_id || t.navigate_band_id,
    });
  }
  return [...map.values()].sort((a, b) => {
    const da = earliestDate(a);
    const db = earliestDate(b);
    if (da !== db) return da.localeCompare(db);
    return (a.title || "").localeCompare(b.title || "");
  });
}

export function buildLiveShowsArtistSections(
  tracks: ArtistPlaylistTrack[]
): ArtistPlaylistSection[] {
  const byArtist = new Map<string, ArtistPlaylistTrack[]>();
  for (const t of tracks) {
    const name = (t.artist_name || t.snapshot?.artist || "Unknown").trim();
    const list = byArtist.get(name) || [];
    list.push(t);
    byArtist.set(name, list);
  }
  return [...byArtist.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([artist, artistTracks]) => {
      const unique = buildUniqueLiveTracks(artistTracks);
      return {
        id: `artist-${artist}`,
        title: `${artist} (${unique.length})`,
        tracks: unique,
      };
    });
}

export function livePlaysTooltip(track: ArtistPlaylistTrack): string | undefined {
  const occs = track.play_occurrences;
  if (!occs?.length) return undefined;
  return occs.map(occurrenceLabel).join("\n");
}

export function nextLiveShowsViewMode(mode: LiveShowsViewMode): LiveShowsViewMode {
  if (mode === "by-show") return "by-artist";
  if (mode === "by-artist") return "all-tracks";
  return "by-show";
}
