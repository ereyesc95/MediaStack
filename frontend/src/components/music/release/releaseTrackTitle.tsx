import BillboardText from "../../BillboardText";
import { stripFilenamePrefixes } from "./releaseTrackPanelMeta";

/** Split track title into main part and bracket suffix for display. */
function formatSuffixParts(parts: string[]): string {
  const formatted: string[] = [];
  for (const part of parts) {
    if (/^of\s+/i.test(part) && formatted.length) {
      formatted[formatted.length - 1] = `${formatted[formatted.length - 1]} ${part}`;
      continue;
    }
    formatted.push(part);
  }
  return formatted.join(", ");
}

function formatTrackTitleSuffix(bracketed: string): string {
  const inner = bracketed.replace(/^\[/, "").replace(/\]$/, "");
  const parts = inner
    .split(/[;:]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return `(${formatSuffixParts(parts)})`;
}

function performerNamesMatch(performer: string, hideName: string): boolean {
  const left = performer.trim().toLocaleLowerCase();
  const right = hideName.trim().toLocaleLowerCase();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function shouldHideBracketPart(
  part: string,
  options?: { hidePerformer?: string; hideCoverArtist?: string }
): boolean {
  if (options?.hidePerformer) {
    const match = part.match(/^by\s+(.+)$/i);
    if (match && performerNamesMatch(match[1], options.hidePerformer)) return true;
  }
  if (options?.hideCoverArtist) {
    const match = part.match(/^(.+?)\s+cover$/i);
    if (match && performerNamesMatch(match[1], options.hideCoverArtist)) return true;
  }
  return false;
}

export function splitTrackTitleDisplay(
  title: string,
  options?: { hidePerformer?: string; hideCoverArtist?: string }
): {
  main: string;
  suffix: string | null;
} {
  const hidePerformer = options?.hidePerformer;
  const hideCoverArtist = options?.hideCoverArtist;
  const cleaned = stripFilenamePrefixes(title);
  const bracket = cleaned.match(/^(.+?)\s*(\[[^\]]+\])\s*$/);
  if (bracket) {
    const inner = bracket[2].replace(/^\[/, "").replace(/\]$/, "");
    const parts = inner
      .split(/[;:]+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .filter((part) => !shouldHideBracketPart(part, { hidePerformer, hideCoverArtist }));
    if (!parts.length) {
      return { main: bracket[1].trim(), suffix: null };
    }
    return {
      main: bracket[1].trim(),
      suffix: `(${formatSuffixParts(parts)})`,
    };
  }
  return { main: cleaned, suffix: null };
}

function trackTitlePlain(title: string): string {
  const { main, suffix } = splitTrackTitleDisplay(title);
  return suffix ? `${main} ${suffix}` : main;
}

export function ReleaseTrackTitle({
  title,
  billboard = false,
  hidePerformer,
  hideCoverArtist,
}: {
  title: string;
  billboard?: boolean;
  hidePerformer?: string;
  hideCoverArtist?: string;
}) {
  const { main, suffix } = splitTrackTitleDisplay(title, { hidePerformer, hideCoverArtist });
  if (billboard) {
    const plain = suffix ? `${main} ${suffix}` : main;
    return (
      <BillboardText
        className="release-tracklist__title"
        short={plain}
        full={plain}
      />
    );
  }
  if (!suffix) {
    return <span className="release-tracklist__title">{main}</span>;
  }
  return (
    <span className="release-tracklist__title">
      {main}
      <span className="release-tracklist__title-suffix">{suffix}</span>
    </span>
  );
}
