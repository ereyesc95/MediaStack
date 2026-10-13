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

function CoverArtistSuffix({
  suffix,
  onOpenCoverArtist,
}: {
  suffix: string;
  onOpenCoverArtist?: (name: string) => void;
}) {
  // suffix is like "(HIM cover)" or "(Live; HIM cover)"
  const inner = suffix.replace(/^\(/, "").replace(/\)$/, "");
  const parts = inner.split(",").map((p) => p.trim()).filter(Boolean);
  if (!onOpenCoverArtist || !parts.length) {
    return <span className="release-tracklist__title-suffix">{suffix}</span>;
  }
  return (
    <span className="release-tracklist__title-suffix">
      (
      {parts.map((part, i) => {
        const coverMatch = part.match(/^(.+?)\s+cover$/i);
        const sep = i > 0 ? ", " : "";
        if (coverMatch) {
          const artist = coverMatch[1];
          return (
            <span key={`${part}-${i}`}>
              {sep}
              <button
                type="button"
                className="release-page__person-link release-page__person-link--plain"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenCoverArtist(artist);
                }}
              >
                {artist}
              </button>{" "}
              cover
            </span>
          );
        }
        return (
          <span key={`${part}-${i}`}>
            {sep}
            {part}
          </span>
        );
      })}
      )
    </span>
  );
}

export function ReleaseTrackTitle({
  title,
  billboard = false,
  hidePerformer,
  hideCoverArtist,
  onOpenCoverArtist,
}: {
  title: string;
  billboard?: boolean;
  hidePerformer?: string;
  hideCoverArtist?: string;
  /** When set, ``{Artist} cover`` in the suffix becomes an in-app artist link. */
  onOpenCoverArtist?: (name: string) => void;
}) {
  const { main, suffix } = splitTrackTitleDisplay(title, { hidePerformer, hideCoverArtist });
  if (billboard) {
    const plain = suffix ? `${main} ${suffix}` : main;
    return (
      <BillboardText
        className="release-tracklist__title"
        short={plain}
        full={plain}
      >
        {main}
        {suffix ? (
          <CoverArtistSuffix suffix={suffix} onOpenCoverArtist={onOpenCoverArtist} />
        ) : null}
      </BillboardText>
    );
  }
  if (!suffix) {
    return <span className="release-tracklist__title">{main}</span>;
  }
  return (
    <span className="release-tracklist__title">
      {main}{" "}
      <CoverArtistSuffix suffix={suffix} onOpenCoverArtist={onOpenCoverArtist} />
    </span>
  );
}
