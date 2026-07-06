export const SPOTIFY_AWAITING_KEY = "mediastack.spotify.awaiting";
export const SPOTIFY_RETURN_PATH = "/music/playlists";

export function markSpotifyOAuthAwaiting() {
  try {
    sessionStorage.setItem(SPOTIFY_AWAITING_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function consumeSpotifyOAuthAwaiting(): boolean {
  try {
    const pending = sessionStorage.getItem(SPOTIFY_AWAITING_KEY);
    if (!pending) return false;
    sessionStorage.removeItem(SPOTIFY_AWAITING_KEY);
    return true;
  } catch {
    return false;
  }
}

export function readSpotifyOAuthError(): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash.startsWith("spotify-error=")) return null;
  const raw = hash.slice("spotify-error=".length);
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

export function clearSpotifyOAuthErrorHash() {
  if (!window.location.hash.includes("spotify-error=")) return;
  const url = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, "", url);
}
