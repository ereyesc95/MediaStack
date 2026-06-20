import { useEffect, useMemo, useRef } from "react";

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

function scrollLineIntoView(
  line: HTMLElement,
  preferredScrollRoot?: HTMLElement | null
) {
  const candidates: HTMLElement[] = [];
  if (preferredScrollRoot) candidates.push(preferredScrollRoot);
  let parent: HTMLElement | null = line.parentElement;
  while (parent) {
    if (!candidates.includes(parent)) candidates.push(parent);
    parent = parent.parentElement;
  }

  for (const container of candidates) {
    const style = getComputedStyle(container);
    const canScrollY =
      style.overflowY === "auto" ||
      style.overflowY === "scroll" ||
      style.overflowY === "overlay";
    if (!canScrollY || container.scrollHeight <= container.clientHeight + 2) {
      continue;
    }
    const lineRect = line.getBoundingClientRect();
    const parentRect = container.getBoundingClientRect();
    const offset =
      lineRect.top -
      parentRect.top -
      container.clientHeight / 2 +
      lineRect.height / 2;
    container.scrollBy({ top: offset, behavior: "smooth" });
    return;
  }
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const lastScrolledIdx = useRef(-1);

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

  useEffect(() => {
    lineRefs.current.length = lrcLines.length;
    lastScrolledIdx.current = -1;
  }, [lrcLines.length, syncedLyrics]);

  useEffect(() => {
    if (activeIdx < 0) return;
    if (activeIdx === lastScrolledIdx.current) return;
    const line = lineRefs.current[activeIdx];
    if (!line) return;

    const frame = window.requestAnimationFrame(() => {
      scrollLineIntoView(line, scrollRef.current);
      lastScrolledIdx.current = activeIdx;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeIdx, syncedLyrics]);

  return (
    <div className="release-tracklist__inline release-tracklist__inline--lyrics">
      {loading && <p className="muted">Loading lyrics…</p>}
      {!loading && lrcLines.length > 0 ? (
        <div
          ref={scrollRef}
          className="release-tracklist__lyrics-sync ms-scrollbar"
        >
          {lrcLines.map((line, i) => (
            <p
              key={`${line.time}-${i}`}
              ref={(el) => {
                lineRefs.current[i] = el;
              }}
              className={
                i === activeIdx
                  ? "release-tracklist__lyrics-line active"
                  : "release-tracklist__lyrics-line"
              }
            >
              {line.text}
            </p>
          ))}
          <div className="release-tracklist__lyrics-sync-edge" aria-hidden />
        </div>
      ) : lyrics ? (
        <pre className="release-tracklist__lyrics-plain">{lyrics}</pre>
      ) : (
        !loading && <p className="muted">No lyrics found for this track.</p>
      )}
    </div>
  );
}
