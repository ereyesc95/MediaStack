import { openLocalMediaFile } from "./api";

/** Extract media-root-relative path from /api/media/file or open-local URLs. */
export function mediaPathFromOpenUrl(url: string): string | null {
  const trimmed = (url || "").trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed, window.location.origin);
    if (
      u.pathname.includes("/api/media/file") ||
      u.pathname.includes("/api/media/open-local")
    ) {
      const path = u.searchParams.get("path");
      return path?.trim() || null;
    }
  } catch {
    /* ignore */
  }
  const m = trimmed.match(/[?&]path=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]).trim() || null;
    } catch {
      return m[1].trim() || null;
    }
  }
  return null;
}

function isExternalHttp(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url, window.location.origin);
    return !u.pathname.includes("/api/media/");
  } catch {
    return true;
  }
}

function fileUrlForPath(path: string): string {
  return `/api/media/file?path=${encodeURIComponent(path)}`;
}

function openInBrowserTab(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Open a Movies/Series catalog video.
 * - External http(s) links always open in a tab.
 * - When playLocally: OS associated app via open-local; fall back to browser tab.
 * - When not: browser tab (file stream URL).
 */
export async function openCatalogVideo(opts: {
  openUrl?: string | null;
  playPath?: string | null;
  playLocally: boolean;
}): Promise<void> {
  const url = (opts.openUrl || "").trim();
  const playPath = (opts.playPath || "").trim() || null;
  if (!url && !playPath) return;

  if (url && isExternalHttp(url)) {
    openInBrowserTab(url);
    return;
  }

  const path = playPath || (url ? mediaPathFromOpenUrl(url) : null);

  if (opts.playLocally && path) {
    try {
      await openLocalMediaFile(path);
      return;
    } catch {
      /* fall through to browser */
    }
  }

  if (url && !url.includes("/api/media/open-local")) {
    openInBrowserTab(url);
    return;
  }
  if (path) {
    openInBrowserTab(fileUrlForPath(path));
  }
}
