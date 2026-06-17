/** Parse track title for the release left-panel track view. */

export type TrackPanelLine =
  | { kind: "cover"; artist: string }
  | { kind: "featuring"; artists: string[] }
  | { kind: "version"; label: string }
  | { kind: "other"; text: string };

export type TrackPanelMeta = {
  mainTitle: string;
  lines: TrackPanelLine[];
};

const VERSION_ONLY = /^(acoustic|remix|live)$/i;

function stripOuterBrackets(title: string): { main: string; inner: string | null } {
  const bracket = title.match(/^(.+?)\s*\[([^\]]+)\]\s*$/);
  if (bracket) {
    return { main: bracket[1].trim(), inner: bracket[2].trim() };
  }
  const paren = title.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    return { main: paren[1].trim(), inner: paren[2].trim() };
  }
  return { main: title.trim(), inner: null };
}

function splitSuffixParts(inner: string): string[] {
  return inner
    .split(/[;:]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseFeaturing(part: string): string[] | null {
  const m = part.match(/^feat\.?\s*(.+)$/i);
  if (!m) return null;
  return m[1]
    .split(/[,;]+/)
    .map((n) => n.trim())
    .filter(Boolean);
}

function parseCoverArtist(part: string): string | null {
  const m = part.match(/^(.+?)\s+cover$/i);
  return m ? m[1].trim() : null;
}

function versionLabel(part: string): string | null {
  const norm = part.trim();
  if (VERSION_ONLY.test(norm)) {
    return `${norm.toLowerCase()} version`;
  }
  return null;
}

export function parseTrackPanelMeta(title: string): TrackPanelMeta {
  const { main, inner } = stripOuterBrackets(title);
  const lines: TrackPanelLine[] = [];
  if (inner) {
    for (const part of splitSuffixParts(inner)) {
      const version = versionLabel(part);
      if (version) {
        lines.push({ kind: "version", label: version });
        continue;
      }
      const cover = parseCoverArtist(part);
      if (cover) {
        lines.push({ kind: "cover", artist: cover });
        continue;
      }
      const feat = parseFeaturing(part);
      if (feat?.length) {
        lines.push({ kind: "featuring", artists: feat });
        continue;
      }
      lines.push({ kind: "other", text: part });
    }
  }
  return { mainTitle: main, lines };
}

export function writerSearchUrl(name: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(name)}`;
}

export const DEFAULT_DISC_URL = "/api/assets/system/default/disc.png";
export const DEFAULT_LABEL_URL = "/api/assets/system/default/label.png";

export function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="release-page__chevron">
      <path
        d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
