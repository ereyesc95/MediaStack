import { formatTrackDate } from "../formatDate";
import type { TrackYoutubeVideo } from "../types";
import { openYoutubeFullscreen, youtubeVideoId } from "./youtube";

export function localVideoOpenUrl(localPath: string): string {
  const trimmed = localPath.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/api/")) return trimmed;
  return `/api/media/file?path=${encodeURIComponent(trimmed)}`;
}

export function videoOpenUrl(video: TrackYoutubeVideo): string {
  const local = video.local_path?.trim();
  if (local) return localVideoOpenUrl(local);
  return video.url.trim();
}

export function hasPlayableVideo(video: TrackYoutubeVideo): boolean {
  return Boolean(videoOpenUrl(video));
}

/** Normalize dd/mm/yyyy, yyyy, or ISO to YYYY-MM-DD for storage. */
export function normalizeVideoDateInput(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  const dmy = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}$/.test(t)) return `${t}-01-01`;
  const iso = t.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (iso) {
    const [, y, m, d] = iso;
    return d ? `${y}-${m}-${d}` : `${y}-${m}-01`;
  }
  return t;
}

export function displayVideoDate(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const iso = normalizeVideoDateInput(raw);
  return formatTrackDate(iso) ?? raw.trim();
}

export function videoDateMeta(video: TrackYoutubeVideo): string {
  const raw = video.release_date ?? video.release_year;
  if (raw == null || !String(raw).trim()) return "";
  return normalizeVideoDateInput(String(raw));
}

/** Playlist date column: always YYYY-MM-DD when possible. */
export function formatVideoDateIso(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  return normalizeVideoDateInput(raw);
}

export function openTrackVideo(url: string, onBeforeOpen?: () => void): void {
  onBeforeOpen?.();
  const trimmed = url.trim();
  if (!trimmed) return;
  if (youtubeVideoId(trimmed) || trimmed.includes("youtube.com") || trimmed.includes("youtu.be")) {
    openYoutubeFullscreen(trimmed);
    return;
  }
  window.open(trimmed, "_blank", "noopener,noreferrer");
}

export function trackYoutubeVideos(track: {
  youtube_url?: string | null;
  youtube_videos?: TrackYoutubeVideo[] | null;
} | null | undefined): TrackYoutubeVideo[] {
  if (!track) return [];
  const fromList = (track.youtube_videos ?? []).filter((video) => hasPlayableVideo(video));
  if (fromList.length > 0) {
    return [...fromList].sort((a, b) => {
      const aLocal = Boolean(a.local_path?.trim());
      const bLocal = Boolean(b.local_path?.trim());
      if (aLocal !== bLocal) return aLocal ? -1 : 1;
      if (a.primary && !b.primary) return -1;
      if (b.primary && !a.primary) return 1;
      return 0;
    });
  }
  if (track.youtube_url && (youtubeVideoId(track.youtube_url) || track.youtube_url.startsWith("/api/"))) {
    return [{ url: track.youtube_url, label: "Official video", primary: true }];
  }
  return [];
}
