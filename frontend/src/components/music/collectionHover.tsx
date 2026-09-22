/** Shared collection hover / flip / external-search widgets. */
import { useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from "react";
import { createPortal } from "react-dom";
import { IconSpotify } from "../MenuIcons";

export type PhotocardPair = {
  id: string;
  label: string;
  front_url?: string | null;
  back_url?: string | null;
};

/** Only one collection hover bubble open at a time. */
type BubbleGate = { close: () => void };
const bubbleHub: {
  active: BubbleGate | null;
  claim(gate: BubbleGate): void;
  release(gate: BubbleGate): void;
} = {
  active: null,
  claim(gate) {
    if (this.active && this.active !== gate) this.active.close();
    this.active = gate;
  },
  release(gate) {
    if (this.active === gate) this.active = null;
  },
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
  bare = false,
  disabled = false,
  interactive = false,
}: {
  children: ReactNode;
  content: ReactNode;
  /** Transparent, borderless bubble (artist / edition / animation / canvas). */
  bare?: boolean;
  /** Skip bubble entirely (e.g. no assets). */
  disabled?: boolean;
  /** Pointer cursor when bubble content can be flipped / clicked. */
  interactive?: boolean;
}) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<number | null>(null);
  const gateRef = useRef<BubbleGate>({ close: () => undefined });

  const clearHide = () => {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  gateRef.current.close = () => {
    clearHide();
    setPos(null);
    bubbleHub.release(gateRef.current);
  };

  const show = () => {
    if (disabled) return;
    clearHide();
    // Close any other open bubble immediately so previews never overlap.
    bubbleHub.claim(gateRef.current);
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 2 });
  };

  const scheduleHide = () => {
    clearHide();
    hideTimer.current = window.setTimeout(() => {
      gateRef.current.close();
    }, 180);
  };

  useEffect(() => {
    return () => {
      clearHide();
      bubbleHub.release(gateRef.current);
    };
  }, []);

  if (disabled) {
    return <span className="collection-hover">{children}</span>;
  }

  return (
    <span
      className={`collection-hover${interactive ? " collection-hover--interactive" : ""}`}
      ref={anchorRef}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
    >
      {children}
      {pos
        ? createPortal(
            <span
              className={`collection-hover__bubble collection-hover__bubble--fixed${
                bare ? " collection-hover__bubble--bare" : ""
              }${interactive ? " collection-hover__bubble--interactive" : ""}`}
              role="tooltip"
              style={{ left: pos.left, top: pos.top }}
              onMouseEnter={show}
              onMouseLeave={scheduleHide}
            >
              <span className="collection-hover__bridge" aria-hidden />
              {content}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}

export function PhotocardFlipPreview({ pairs }: { pairs: PhotocardPair[] }) {
  const [tab, setTab] = useState(0);
  const [flipped, setFlipped] = useState(false);
  if (!pairs.length) return <span className="muted">No photocards</span>;
  const active = pairs[Math.min(tab, pairs.length - 1)];
  const front = (active.front_url || "").trim();
  const back = (active.back_url || "").trim();
  const canFlip = Boolean(front && back);
  const shown = flipped && back ? back : front || back;
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
        className={`collection-photocard-preview__card${canFlip ? " is-flippable" : ""}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (canFlip) setFlipped((v) => !v);
        }}
        title={canFlip ? (flipped ? "Show front" : "Show back") : "Front only"}
      >
        {shown ? (
          <img key={shown} src={shown} alt={`${active.label} ${flipped ? "back" : "front"}`} draggable={false} />
        ) : (
          <span className="muted">No image</span>
        )}
      </button>
      <span className="muted collection-photocard-preview__hint">
        {canFlip ? (flipped ? "Back" : "Front") : "Front"}
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
    <div
      className={`collection-disc-preview${canFlip ? " is-flippable" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`collection-disc-preview__disc${flipped ? " is-flipped" : ""}${
          isVinyl ? " is-round" : ""
        }${canFlip ? " is-flippable" : ""}`}
        onClick={() => {
          if (canFlip) setFlipped((v) => !v);
        }}
        title={canFlip ? (flipped ? "Side B" : "Side A") : undefined}
      >
        <span className="collection-disc-preview__face collection-disc-preview__face--a">
          {front ? <img src={front} alt="Side A / Disc" /> : <span className="muted">—</span>}
        </span>
        <span className="collection-disc-preview__face collection-disc-preview__face--b">
          {back ? <img src={back} alt="Side B" /> : null}
        </span>
      </button>
      <span className="muted">
        {canFlip ? (flipped ? "Side B" : "Side A") : isVinyl ? "Side A" : "Disc"}
      </span>
    </div>
  );
}

export function SpotifyFlip({
  active,
  bannerUrl,
  cardUrl,
  codeUrl,
}: {
  active: boolean;
  bannerUrl?: string | null;
  cardUrl?: string | null;
  codeUrl?: string | null;
}) {
  const [flipped, setFlipped] = useState(false);
  // Prefer Code - Spotify Card when present; otherwise Code - Spotify.
  const backUrl = (cardUrl || codeUrl || "").trim();
  const frontUrl = (bannerUrl || "").trim();
  const hasPreview = Boolean(frontUrl || backUrl);
  const canFlip = Boolean(frontUrl && backUrl && frontUrl !== backUrl);
  const shown = flipped && backUrl ? backUrl : frontUrl || backUrl;

  const toggle = (e: { preventDefault(): void; stopPropagation(): void }) => {
    e.preventDefault();
    e.stopPropagation();
    if (canFlip) setFlipped((v) => !v);
  };

  const preview = hasPreview ? (
    <div
      className={`collection-spotify-preview${canFlip ? " is-flippable" : ""}`}
      role={canFlip ? "button" : undefined}
      tabIndex={canFlip ? 0 : undefined}
      title={canFlip ? (flipped ? "Show banner" : "Show Spotify code") : undefined}
      onClick={toggle}
      onKeyDown={(e) => {
        if (!canFlip) return;
        if (e.key === "Enter" || e.key === " ") toggle(e);
      }}
    >
      <img
        key={shown}
        src={shown}
        alt={flipped && backUrl ? "Spotify code" : "Cover banner"}
        draggable={false}
      />
      {canFlip ? (
        <span className="collection-spotify-preview__face-label">
          {flipped ? "Code" : "Banner"}
        </span>
      ) : null}
    </div>
  ) : (
    <span className="muted">
      Missing Cover - Banner or Code - Spotify (or Code - Spotify Card)
    </span>
  );

  return (
    <HoverBubble bare content={preview} interactive={canFlip} disabled={!hasPreview}>
      <button
        type="button"
        className={`collection-spotify${
          hasPreview && (active || canFlip || Boolean(frontUrl || backUrl))
            ? " is-active"
            : " is-muted"
        }`}
        title={
          hasPreview
            ? canFlip
              ? "Spotify — hover then click preview to flip"
              : "Spotify"
            : "Missing Cover - Banner or Code - Spotify (or Code - Spotify Card)"
        }
        onClick={toggle}
      >
        <span className="collection-spotify__icon" aria-hidden>
          <IconSpotify />
        </span>
      </button>
    </HoverBubble>
  );
}

/** Cover front ↔ Photo - Square flip for edition hover / click. */
export function CoverPhotoFlip({
  coverUrl,
  photoSquareUrl,
  flipped: flippedProp,
  onFlippedChange,
}: {
  coverUrl?: string | null;
  photoSquareUrl?: string | null;
  flipped?: boolean;
  onFlippedChange?: (next: boolean) => void;
}) {
  const [flippedLocal, setFlippedLocal] = useState(false);
  const flipped = flippedProp ?? flippedLocal;
  const setFlipped = (next: boolean) => {
    if (onFlippedChange) onFlippedChange(next);
    else setFlippedLocal(next);
  };
  const front = (coverUrl || "").trim();
  const back = (photoSquareUrl || "").trim();
  if (!front && !back) return <span className="muted">No cover</span>;
  const canFlip = Boolean(front && back && front !== back);
  const shown = flipped && back ? back : front || back;
  return (
    <div
      className={`collection-cover-flip${canFlip ? " is-flippable" : ""}`}
      role={canFlip ? "button" : undefined}
      tabIndex={canFlip ? 0 : undefined}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (canFlip) setFlipped(!flipped);
      }}
      onKeyDown={(e) => {
        if (!canFlip) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setFlipped(!flipped);
        }
      }}
      title={canFlip ? (flipped ? "Show cover" : "Show photo") : undefined}
    >
      <img
        key={shown}
        src={shown}
        alt={flipped && back ? "Photo square" : "Cover"}
        className="collection-hover__img"
        draggable={false}
      />
      {canFlip ? (
        <span className="collection-cover-flip__label">
          {flipped ? "Photo" : "Cover"}
        </span>
      ) : null}
    </div>
  );
}

/** Edition label: hover cover, click flips to Photo - Square when available. */
export function EditionCoverHover({
  coverUrl,
  photoSquareUrl,
  children,
  onNavigate,
}: {
  coverUrl?: string | null;
  photoSquareUrl?: string | null;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const canFlip = Boolean(coverUrl && photoSquareUrl);
  const hasPreview = Boolean(coverUrl || photoSquareUrl);
  return (
    <HoverBubble
      bare
      disabled={!hasPreview}
      interactive={canFlip}
      content={
        <CoverPhotoFlip
          coverUrl={coverUrl}
          photoSquareUrl={photoSquareUrl}
          flipped={flipped}
          onFlippedChange={setFlipped}
        />
      }
    >
      <button
        type="button"
        className="linkish"
        onClick={(e) => {
          e.stopPropagation();
          if (canFlip) {
            setFlipped((v) => !v);
            return;
          }
          onNavigate?.();
        }}
      >
        {children}
      </button>
    </HoverBubble>
  );
}

type EditionAsset = {
  id?: number;
  label: string;
  logo_url?: string | null;
  photocard_pairs?: PhotocardPair[] | null;
};

/** Tabs to pick edition assets (logo / photocards) when title/artist are grouped.
 * Returns null when nothing to show (caller should disable HoverBubble). */
export function EditionAssetPreview({
  editions,
  mode,
}: {
  editions: EditionAsset[];
  mode: "logo" | "photocards";
}): ReactNode {
  const usable = editions.filter((e) =>
    mode === "logo" ? Boolean(e.logo_url) : Boolean(e.photocard_pairs?.length)
  );
  const [tab, setTab] = useState(0);
  if (!usable.length) return null;
  const active = usable[Math.min(tab, usable.length - 1)];
  return (
    <div className="collection-edition-assets" onClick={(e) => e.stopPropagation()}>
      {usable.length > 1 ? (
        <div className="collection-edition-assets__tabs" role="tablist">
          {usable.map((e, i) => (
            <button
              key={e.id ?? `${e.label}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === tab}
              className={i === tab ? "active" : undefined}
              onClick={() => setTab(i)}
            >
              {e.label}
            </button>
          ))}
        </div>
      ) : null}
      {mode === "logo" ? (
        active?.logo_url ? (
          <img src={active.logo_url} alt="" className="collection-hover__img" />
        ) : null
      ) : active?.photocard_pairs && active.photocard_pairs.length > 0 ? (
        <PhotocardFlipPreview pairs={active.photocard_pairs} />
      ) : null}
    </div>
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
