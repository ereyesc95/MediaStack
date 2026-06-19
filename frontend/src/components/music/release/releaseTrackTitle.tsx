import BillboardText from "../../BillboardText";

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

export function splitTrackTitleDisplay(title: string): {
  main: string;
  suffix: string | null;
} {
  const bracket = title.match(/^(.+?)\s*(\[[^\]]+\])\s*$/);
  if (bracket) {
    return { main: bracket[1].trim(), suffix: formatTrackTitleSuffix(bracket[2]) };
  }
  return { main: title, suffix: null };
}

function trackTitlePlain(title: string): string {
  const { main, suffix } = splitTrackTitleDisplay(title);
  return suffix ? `${main} ${suffix}` : main;
}

export function ReleaseTrackTitle({
  title,
  billboard = false,
}: {
  title: string;
  billboard?: boolean;
}) {
  const { main, suffix } = splitTrackTitleDisplay(title);
  if (billboard) {
    return (
      <BillboardText
        className="release-tracklist__title"
        short={trackTitlePlain(title)}
        full={trackTitlePlain(title)}
      />
    );
  }
  if (!suffix) {
    return <span className="release-tracklist__title">{title}</span>;
  }
  return (
    <span className="release-tracklist__title">
      {main}
      <span className="release-tracklist__title-suffix">{suffix}</span>
    </span>
  );
}
