/** Shared collection hover / flip / external-search widgets. */
import { useMemo, useState, type ReactNode, type UIEvent } from "react";

export type PhotocardPair = {
  id: string;
  label: string;
  front_url?: string | null;
  back_url?: string | null;
};

export function openSearchCascade(
  kind: "title" | "artist",
  artist: string,
  title?: string
) {
  const wikiQ = kind === "artist" ? artist : `${title || ""} (${artist})`;
  const wiki = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(wikiQ)}`;
  const mbQ =
    kind === "artist"
      ? artist
      : `release:"${title || ""}" AND artist:"${artist}"`;
  const mb = `https://musicbrainz.org/search?query=${encodeURIComponent(mbQ)}&type=${
    kind === "artist" ? "artist" : "release"
  }&method=indexed`;
  const googleQ =
    kind === "artist" ? `${artist} musician` : `${artist} ${title || ""} album`;
  const google = `https://www.google.com/search?q=${encodeURIComponent(googleQ)}`;

  // Cascade: open Wiki first; stash MB + Google for the chooser UI.
  window.open(wiki, "_blank", "noopener,noreferrer");
  return { wiki, mb, google };
}

export function ExternalSearchMenu({
  kind,
  artist,
  title,
  children,
}: {
  kind: "title" | "artist";
  artist: string;
  title?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const links = useMemo(() => {
    const wikiQ = kind === "artist" ? artist : `${title || ""} (${artist})`;
    const wiki = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(wikiQ)}`;
    const mbQ =
      kind === "artist"
        ? artist
        : `release:"${title || ""}" AND artist:"${artist}"`;
    const mb = `https://musicbrainz.org/search?query=${encodeURIComponent(mbQ)}&type=${
      kind === "artist" ? "artist" : "release"
    }&method=indexed`;
    const googleQ =
      kind === "artist" ? `${artist} musician` : `${artist} ${title || ""} album`;
    const google = `https://www.google.com/search?q=${encodeURIComponent(googleQ)}`;
    return [
      { id: "wiki", label: "Wikipedia", href: wiki },
      { id: "mb", label: "MusicBrainz", href: mb },
      { id: "google", label: "Google", href: google },
    ];
  }, [kind, artist, title]);

  return (
    <span className="collection-ext-search">
      <button
        type="button"
        className="linkish"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
          // Prefer Wiki immediately (cascade start)
          window.open(links[0].href, "_blank", "noopener,noreferrer");
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        title="Opens Wikipedia; right-click for MusicBrainz / Google"
      >
        {children}
      </button>
      {open ? (
        <span className="collection-ext-search__menu" role="menu">
          {links.map((l) => (
            <a
              key={l.id}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <button type="button" className="linkish" onClick={() => setOpen(false)}>
            Close
          </button>
        </span>
      ) : null}
    </span>
  );
}

export function HoverBubble({
  children,
  content,
}: {
  children: ReactNode;
  content: ReactNode;
}) {
  return (
    <span className="collection-hover">
      {children}
      <span className="collection-hover__bubble" role="tooltip">
        {content}
      </span>
    </span>
  );
}

export function PhotocardFlipPreview({ pairs }: { pairs: PhotocardPair[] }) {
  const [tab, setTab] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!pairs.length) return <span className="muted">No photocards</span>;
  const active = pairs[Math.min(tab, pairs.length - 1)];
  const front = active.front_url;
  const back = active.back_url;
  return (
    <div className="collection-photocard-preview" onClick={(e) => e.stopPropagation()}>
      <div className="collection-photocard-preview__tabs" role="tablist">
        {pairs.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={i === tab}
            className={i === tab ? "active" : undefined}
            onClick={() => {
              setTab(i);
              setFlipped(false);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`collection-photocard-preview__card${flipped ? " is-flipped" : ""}`}
        onClick={() => {
          if (back) setFlipped((v) => !v);
        }}
        title={back ? "Click to flip" : "Front only"}
      >
        <span className="collection-photocard-preview__face collection-photocard-preview__face--front">
          {front ? <img src={front} alt={`${active.label} front`} /> : <span className="muted">No front</span>}
        </span>
        <span className="collection-photocard-preview__face collection-photocard-preview__face--back">
          {back ? <img src={back} alt={`${active.label} back`} /> : <span className="muted">No back</span>}
        </span>
      </button>
      <span className="muted collection-photocard-preview__hint">
        {back ? (flipped ? "Back — click to flip" : "Front — click to flip") : "Front"}
      </span>
    </div>
  );
}

export function DiscFlipPreview({
  discUrl,
  discBUrl,
  mediaType,
}: {
  discUrl?: string | null;
  discBUrl?: string | null;
  mediaType?: string | null;
}) {
  const [flipped, setFlipped] = useState(false);
  const isVinyl = /lp|vinyl|7"|10"|box/i.test(mediaType || "");
  if (!discUrl && !discBUrl) return <span className="muted">No disc art</span>;
  const front = discUrl;
  const back = discBUrl;
  const canFlip = Boolean(front && back);
  return (
    <div className="collection-disc-preview" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`collection-disc-preview__disc${flipped ? " is-flipped" : ""}${
          isVinyl ? " is-round" : ""
        }`}
        onClick={() => {
          if (canFlip) setFlipped((v) => !v);
        }}
        title={canFlip ? "Click to flip" : undefined}
      >
        <span className="collection-disc-preview__face collection-disc-preview__face--a">
          {front ? <img src={front} alt="Side A / Disc" /> : <span className="muted">—</span>}
        </span>
        <span className="collection-disc-preview__face collection-disc-preview__face--b">
          {back ? <img src={back} alt="Side B" /> : null}
        </span>
      </button>
      <span className="muted">
        {canFlip
          ? flipped
            ? "Side B — click to flip"
            : "Side A — click to flip"
          : isVinyl
            ? "Side A"
            : "Disc"}
      </span>
    </div>
  );
}

export function SpotifyFlip({
  active,
  bannerUrl,
  cardUrl,
}: {
  active: boolean;
  bannerUrl?: string | null;
  cardUrl?: string | null;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      className={`collection-spotify${active ? " is-active" : " is-muted"}`}
      title={active ? "Spotify card" : "Missing Cover - Banner or Spotify - Card"}
      onClick={(e) => {
        e.stopPropagation();
        if (active) setFlipped((v) => !v);
      }}
    >
      <span className="collection-spotify__icon" aria-hidden>
        ♫
      </span>
      {active ? (
        <span className={`collection-spotify__flip${flipped ? " is-flipped" : ""}`}>
          <img src={bannerUrl || ""} alt="" className="collection-spotify__front" />
          <img src={cardUrl || ""} alt="" className="collection-spotify__back" />
        </span>
      ) : null}
    </button>
  );
}

/** Lightweight windowed rows for large "All" lists. */
export function useVirtualWindow(
  count: number,
  rowHeight: number,
  enabled: boolean
) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(480);
  if (!enabled) {
    return {
      start: 0,
      end: count,
      offsetY: 0,
      totalHeight: count * rowHeight,
      onScroll: (_e: UIEvent<HTMLElement>) => undefined,
      setViewportEl: (_el: HTMLElement | null) => undefined,
    };
  }
  const overscan = 8;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil(viewport / rowHeight) + overscan * 2;
  const end = Math.min(count, start + visible);
  return {
    start,
    end,
    offsetY: start * rowHeight,
    totalHeight: count * rowHeight,
    onScroll: (e: UIEvent<HTMLElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
      setViewport(e.currentTarget.clientHeight);
    },
    setViewportEl: (el: HTMLElement | null) => {
      if (el) setViewport(el.clientHeight || 480);
    },
  };
}
