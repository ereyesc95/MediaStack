export function youtubeVideoId(url: string): string | null {
  const raw = url.trim();
  if (!raw || raw === "undefined" || raw === "null") return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\//, "").split("/")[0];
      return id && id !== "undefined" ? id : null;
    }
    if (host.includes("youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v && v !== "undefined") return v;
      const embed = parsed.pathname.match(/\/embed\/([^/?]+)/);
      if (embed && embed[1] !== "undefined") return embed[1];
    }
  } catch {
    if (/^[A-Za-z0-9_-]{6,}$/.test(raw)) return raw;
  }
  return null;
}

export function openYoutubeFullscreen(url: string, onPause?: () => void): void {
  const raw = (url || "").trim();
  if (!raw) return;
  onPause?.();
  const id = youtubeVideoId(raw);
  if (!id) {
    if (raw.startsWith("http")) {
      window.open(raw, "_blank", "noopener,noreferrer");
    }
    return;
  }
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&autoplay=1`;
  window.open(watch, "_blank", "noopener,noreferrer");
}
