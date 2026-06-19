/** Parse track title for the release left-panel track view. */

export type TrackPanelLine =
  | { kind: "cover"; artist: string }
  | { kind: "featuring"; artists: string[] }
  | { kind: "performer"; artist: string }
  | { kind: "version"; label: string }
  | { kind: "other"; text: string };

export type TrackPanelMeta = {
  mainTitle: string;
  versionLabel: string | null;
  lines: TrackPanelLine[];
};

const VERSION_ONLY = /^(acoustic|remix|live|remastered)$/i;

const LANGUAGE_NAMES = new Set([
  "spanish",
  "french",
  "german",
  "italian",
  "portuguese",
  "japanese",
  "korean",
  "chinese",
  "mandarin",
  "cantonese",
  "russian",
  "finnish",
  "swedish",
  "norwegian",
  "danish",
  "dutch",
  "polish",
  "hungarian",
  "czech",
  "greek",
  "turkish",
  "arabic",
  "hebrew",
  "hindi",
  "english",
]);

type VersionToken =
  | { kind: "language"; label: string }
  | { kind: "remastered"; detail?: string }
  | { kind: "live"; detail?: string }
  | { kind: "acoustic" }
  | { kind: "remix"; detail?: string }
  | { kind: "mix"; detail?: string }
  | { kind: "edit"; detail?: string };

function stripOuterBrackets(title: string): { main: string; inner: string | null } {
  const bracket = title.match(/^(.+?)\s*\[([^\]]+)\]\s*$/);
  if (bracket) {
    return { main: bracket[1].trim(), inner: bracket[2].trim() };
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

function titleCaseWords(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function parseVersionToken(part: string): VersionToken | null {
  const norm = part.trim();
  const low = norm.toLowerCase();

  if (VERSION_ONLY.test(norm)) {
    if (low === "remastered") return { kind: "remastered" };
    if (low === "live") return { kind: "live" };
    if (low === "acoustic") return { kind: "acoustic" };
    if (low === "remix") return { kind: "remix" };
    return null;
  }

  const remastered = low.match(/^remastered(?:\s+version|\s+(\d{4}))?$/i);
  if (remastered) {
    return { kind: "remastered", detail: remastered[1] };
  }

  const liveAt = norm.match(/^live\s+at\s+(.+)$/i);
  if (liveAt) {
    return { kind: "live", detail: `at ${liveAt[1].trim()}` };
  }
  if (/^live(?:\s+version)?$/i.test(norm)) {
    return { kind: "live" };
  }

  if (/^acoustic(?:\s+version)?$/i.test(norm)) {
    return { kind: "acoustic" };
  }

  const remix = norm.match(/^(.+?)\s+remix$/i);
  if (remix && remix[1].trim()) {
    return { kind: "remix", detail: remix[1].trim() };
  }
  if (low === "remix") {
    return { kind: "remix" };
  }

  const mix = norm.match(/^(.+?)\s+mix$/i);
  if (mix && mix[1].trim() && !low.endsWith("remix")) {
    return { kind: "mix", detail: mix[1].trim() };
  }

  const edit = norm.match(/^(.+?)\s+edit$/i);
  if (edit && edit[1].trim()) {
    return { kind: "edit", detail: edit[1].trim() };
  }

  if (LANGUAGE_NAMES.has(low)) {
    return { kind: "language", label: titleCaseWords(low) };
  }

  const langVersion = low.match(/^(.+)\s+version$/);
  if (langVersion) {
    const lang = langVersion[1].trim();
    if (LANGUAGE_NAMES.has(lang)) {
      return { kind: "language", label: titleCaseWords(lang) };
    }
    if (lang === "remastered") return { kind: "remastered" };
    if (lang === "live") return { kind: "live" };
    if (lang === "acoustic") return { kind: "acoustic" };
    if (lang === "remix") return { kind: "remix" };
  }

  return null;
}

function combineVersionTokens(tokens: VersionToken[]): string | null {
  if (!tokens.length) return null;

  const languages: string[] = [];
  const chunks: string[] = [];

  for (const token of tokens) {
    switch (token.kind) {
      case "language":
        languages.push(token.label);
        break;
      case "remastered":
        chunks.push(token.detail ? `Remastered ${token.detail}` : "Remastered");
        break;
      case "live":
        chunks.push(token.detail ? `Live ${token.detail}` : "Live");
        break;
      case "acoustic":
        chunks.push("Acoustic");
        break;
      case "remix":
        chunks.push(token.detail ? `${titleCaseWords(token.detail)} Remix` : "Remix");
        break;
      case "mix":
        chunks.push(token.detail ? `${titleCaseWords(token.detail)} Mix` : "Mix");
        break;
      case "edit":
        chunks.push(token.detail ? `${titleCaseWords(token.detail)} Edit` : "Edit");
        break;
      default:
        break;
    }
  }

  const parts = [...languages, ...chunks];
  if (!parts.length) return null;
  return `${parts.join(" ")} Version`;
}

function parsePerformer(part: string): string | null {
  const m = part.match(/^by\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function adaptationLabel(part: string): string | null {
  const ofMatch = part.match(/^of\s+(.+)$/i);
  if (ofMatch) {
    return `Adaptation of ${ofMatch[1].trim()}`;
  }
  return null;
}

export function parseTrackPanelMeta(title: string): TrackPanelMeta {
  const { main, inner } = stripOuterBrackets(title);
  const versionTokens: VersionToken[] = [];
  const lines: TrackPanelLine[] = [];
  if (inner) {
    for (const part of splitSuffixParts(inner)) {
      const version = parseVersionToken(part);
      if (version) {
        versionTokens.push(version);
        continue;
      }
      const adaptation = adaptationLabel(part);
      if (adaptation) {
        lines.push({ kind: "other", text: adaptation });
        continue;
      }
      const performer = parsePerformer(part);
      if (performer) {
        lines.push({ kind: "performer", artist: performer });
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
  const versionLabel = combineVersionTokens(versionTokens);
  return { mainTitle: main, versionLabel, lines };
}

export function trackMainTitle(title: string): string {
  return parseTrackPanelMeta(title).mainTitle;
}

export function trackDisplayTitle(title: string): string {
  const trimmed = title.trim();
  if (/\[[^\]]+\]\s*$/.test(trimmed)) {
    return parseTrackPanelMeta(trimmed).mainTitle;
  }
  return trimmed;
}

export function isAdaptationLine(line: TrackPanelLine): boolean {
  return line.kind === "other" && /^Adaptation of /i.test(line.text);
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
