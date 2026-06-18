import { useMemo } from "react";

type LrcLine = { time: number; text: string };

const LRC_TIME_RE = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

function parseLrc(raw: string): LrcLine[] {
  const lines: LrcLine[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const matches = [...line.matchAll(LRC_TIME_RE)];
    if (!matches.length) continue;
    const text = line.replace(LRC_TIME_RE, "").trim();
    if (!text) continue;
    for (const m of matches) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] ? Number(m[3].padEnd(3, "0")) / 1000 : 0;
      lines.push({ time: min * 60 + sec + frac, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

type Props = {
  lyrics: string | null;
  syncedLyrics?: string | null;
  currentTime?: number;
  loading?: boolean;
};

export default function ReleaseInlineLyrics({
  lyrics,
  syncedLyrics,
  currentTime = 0,
  loading = false,
}: Props) {
  const lrcLines = useMemo(
    () => (syncedLyrics ? parseLrc(syncedLyrics) : []),
    [syncedLyrics]
  );

  const activeIdx = useMemo(() => {
    if (!lrcLines.length) return -1;
    let idx = -1;
    for (let i = 0; i < lrcLines.length; i++) {
      if (lrcLines[i].time <= currentTime + 0.05) idx = i;
      else break;
    }
    return idx;
  }, [lrcLines, currentTime]);

  return (
    <div className="release-tracklist__inline release-tracklist__inline--lyrics">
      {loading && <p className="muted">Loading lyrics…</p>}
      {!loading && lrcLines.length > 0 ? (
        <div className="release-tracklist__lyrics-sync">
          {lrcLines.map((line, i) => (
            <p
              key={`${line.time}-${i}`}
              className={
                i === activeIdx
                  ? "release-tracklist__lyrics-line active"
                  : "release-tracklist__lyrics-line"
              }
            >
              {line.text}
            </p>
          ))}
        </div>
      ) : lyrics ? (
        <pre className="release-tracklist__lyrics-plain">{lyrics}</pre>
      ) : (
        !loading && <p className="muted">No lyrics found for this track.</p>
      )}
    </div>
  );
}
