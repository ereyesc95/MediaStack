/** Split track title into main part and bracket/paren suffix for display. */
export function splitTrackTitleDisplay(title: string): {
  main: string;
  suffix: string | null;
} {
  const bracket = title.match(/^(.+?)\s*(\[[^\]]+\])\s*$/);
  if (bracket) {
    const suffix = bracket[2].replace(/^\[/, "(").replace(/\]$/, ")");
    return { main: bracket[1].trim(), suffix };
  }
  const paren = title.match(/^(.+?)\s*(\([^)]+\))\s*$/);
  if (paren) {
    return { main: paren[1].trim(), suffix: paren[2] };
  }
  return { main: title, suffix: null };
}

export function ReleaseTrackTitle({ title }: { title: string }) {
  const { main, suffix } = splitTrackTitleDisplay(title);
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
