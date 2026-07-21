/** Parse track title for the release left-panel track view. */

import { formatTrackDate } from "../../../formatDate";
import type { TrackVersionItem } from "../../../types";

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

/** Strip numeric (01.) and vinyl/cassette side prefixes (A1., B6., Z9.) from display titles. */
export function stripFilenamePrefixes(title: string): string {
  let t = title.trim();
  t = t.replace(/^\d+\.\s*/, "");
  t = t.replace(/^[A-Z]\d+\.\s*/i, "");
  return t.trim();
}

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

function parseVersionTokensFromPart(part: string): VersionToken[] | null {
  const single = parseVersionToken(part);
  if (single) return [single];
  if (!part.includes(",")) return null;

  const pieces = part
    .split(/,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (pieces.length < 2) return null;

  const tokens: VersionToken[] = [];
  for (const piece of pieces) {
    const token = parseVersionToken(piece);
    if (!token) return null;
    tokens.push(token);
  }
  return tokens;
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
  if (languages.length === 0 && chunks.length > 1) {
    return parts.join(", ");
  }
  return `${parts.join(" ")} Version`;
}

function performerNamesMatch(left: string, right: string): boolean {
  const a = left.trim().toLocaleLowerCase();
  const b = right.trim().toLocaleLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function parsePerformer(part: string): string | null {
  const m = part.match(/^by\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Primary credited artist — strips feat./featuring/with suffixes from performer strings. */
export function primaryArtistName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return trimmed
    .split(/\s*,?\s+(?:feat\.?|featuring|with)\s+/i)[0]
    .replace(/,\s*$/, "")
    .trim();
}

function adaptationLabel(part: string): string | null {
  const ofMatch = part.match(/^of\s+(.+)$/i);
  if (ofMatch) {
    return `Adaptation of ${ofMatch[1].trim()}`;
  }
  return null;
}

export function parseTrackPanelMeta(
  title: string,
  options?: { hidePerformer?: string; hideCoverArtist?: string }
): TrackPanelMeta {
  const hidePerformer = options?.hidePerformer;
  const hideCoverArtist = options?.hideCoverArtist;
  const { main, inner } = stripOuterBrackets(stripFilenamePrefixes(title));
  const versionTokens: VersionToken[] = [];
  const lines: TrackPanelLine[] = [];
  if (inner) {
    for (const part of splitSuffixParts(inner)) {
      const versionParts = parseVersionTokensFromPart(part);
      if (versionParts?.length) {
        versionTokens.push(...versionParts);
        continue;
      }
      const adaptation = adaptationLabel(part);
      if (adaptation) {
        lines.push({ kind: "other", text: adaptation });
        continue;
      }
      const performer = parsePerformer(part);
      if (performer) {
        if (hidePerformer && performerNamesMatch(performer, hidePerformer)) {
          continue;
        }
        lines.push({ kind: "performer", artist: performer });
        continue;
      }
      const cover = parseCoverArtist(part);
      if (cover) {
        if (hideCoverArtist && performerNamesMatch(cover, hideCoverArtist)) {
          continue;
        }
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

export function trackDisplayTitle(
  title: string,
  options?: { hidePerformer?: string; hideCoverArtist?: string }
): string {
  const trimmed = stripFilenamePrefixes(title);
  if (/\[[^\]]+\]\s*$/.test(trimmed)) {
    return parseTrackPanelMeta(trimmed, options).mainTitle;
  }
  return trimmed;
}

/** Prefer disk-filename "By … / feat. …" credits over snapshot artist metadata. */
export function diskCreditFromTitle(
  title: string,
  fallbackArtist?: string | null
): { title: string; artist: string | null; usedDiskCredit: boolean } {
  const meta = parseTrackPanelMeta(title);
  const performer = meta.lines.find((line) => line.kind === "performer");
  const featuring = meta.lines.find((line) => line.kind === "featuring");
  if (performer && performer.kind === "performer") {
    const featNames =
      featuring && featuring.kind === "featuring" ? featuring.artists : [];
    const artist = featNames.length
      ? `${performer.artist} feat. ${featNames.join(", ")}`
      : performer.artist;
    return { title: meta.mainTitle, artist, usedDiskCredit: true };
  }
  if (featuring && featuring.kind === "featuring") {
    const base = (fallbackArtist || "").trim();
    if (base) {
      return {
        title: meta.mainTitle,
        artist: `${base} feat. ${featuring.artists.join(", ")}`,
        usedDiskCredit: true,
      };
    }
  }
  return {
    title,
    artist: (fallbackArtist || "").trim() || null,
    usedDiskCredit: false,
  };
}

export function isAdaptationLine(line: TrackPanelLine): boolean {
  return line.kind === "other" && /^Adaptation of /i.test(line.text);
}

export function writerSearchUrl(name: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(name)}`;
}

function stripBracketSuffix(text: string): string {
  return text.replace(/\s*\[[^\]]+\]\s*/g, " ").replace(/\s+/g, " ").trim();
}

function isStandardEdition(label: string): boolean {
  const low = label.toLowerCase().trim();
  return low === "standard edition" || low === "standard";
}

export function versionSourceFromVersionItem(
  version: TrackVersionItem,
  anchorPath?: string | null
): {
  album_title: string;
  navigate_release_id: string;
  navigate_band_id?: number;
  date_iso?: string | null;
  display_date?: string | null;
} | null {
  if (anchorPath && version.play_path === anchorPath) return null;
  const navId = version.navigate_release_id?.trim();
  if (!navId) return null;

  const editionTitle = stripBracketSuffix(version.edition_title?.trim() ?? "");
  const releaseTitle = stripBracketSuffix(version.album_title?.trim() ?? "");
  const showEdition =
    Boolean(editionTitle) &&
    editionTitle.toLowerCase() !== releaseTitle.toLowerCase() &&
    !isStandardEdition(editionTitle);
  const label = showEdition
    ? releaseTitle
      ? `${releaseTitle}: ${editionTitle}`
      : editionTitle
    : releaseTitle || null;
  if (!label) return null;
  return {
    album_title: label,
    navigate_release_id: navId,
    navigate_band_id: version.navigate_band_id ?? undefined,
    date_iso: version.date_iso,
    display_date: version.display_date ?? null,
  };
}

export function playlistTrackVersionSource(
  track: {
    album_title?: string | null;
    navigate_release_id?: string | null;
    navigate_band_id?: number | null;
    release_date?: string | null;
  },
  bandId: number
): {
  album_title: string;
  navigate_release_id: string;
  navigate_band_id?: number;
  date_iso?: string | null;
  display_date?: string | null;
} | null {
  const navId = track.navigate_release_id?.trim();
  const title = stripBracketSuffix(track.album_title?.trim() ?? "");
  if (!navId || !title) return null;
  return {
    album_title: title,
    navigate_release_id: navId,
    navigate_band_id: track.navigate_band_id ?? bandId,
    date_iso: track.release_date ?? null,
    display_date: track.release_date ? formatTrackDate(track.release_date) : null,
  };
}

export const DEFAULT_DISC_URL = "/api/assets/default/disc.png";
export const DEFAULT_LABEL_URL = "/api/assets/default/label.png";
export const DEFAULT_ARTIST_PHOTO_URL =
  "/api/assets/default/artists.png";
/** @deprecated use DEFAULT_ARTIST_PHOTO_URL */
export const VARIOUS_ARTISTS_PHOTO_URL = DEFAULT_ARTIST_PHOTO_URL;
export const VARIOUS_ARTISTS_BAND_ID = 120;

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
