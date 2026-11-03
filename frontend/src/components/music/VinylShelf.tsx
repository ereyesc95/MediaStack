import { useMemo, useState, type CSSProperties } from "react";
import type { CollectionLeaf } from "../../types";
import { DEFAULT_DISC_URL } from "./release/releaseTrackPanelMeta";

const VINYL_MEDIA = new Set(["lp", '7"', '10"', "vinyl"]);

export function isVinylMediaType(media?: string | null): boolean {
  return VINYL_MEDIA.has((media || "").trim().toLowerCase());
}

export function vinylSizeClass(media?: string | null): "lp" | "ten" | "seven" {
  const m = (media || "").trim().toLowerCase();
  if (m === '7"') return "seven";
  if (m === '10"') return "ten";
  return "lp";
}

/** Prefer a vinyl edition leaf from a card / group. */
export function pickVinylLeaf(card: CollectionLeaf): CollectionLeaf | null {
  const versions =
    card.versions && card.versions.length > 0 ? card.versions : [card];
  const vinyl = versions.find((v) => isVinylMediaType(v.media_type));
  if (vinyl) return vinyl;
  return isVinylMediaType(card.media_type) ? card : null;
}

function spineTone(title: string, artist: string): string {
  let h = 0;
  const s = `${artist}|${title}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const sat = 28 + (h % 28);
  const light = 22 + (h % 18);
  return `hsl(${hue} ${sat}% ${light}%)`;
}

type ShelfItem = {
  key: string;
  leaf: CollectionLeaf;
  coverUrl: string;
  size: "lp" | "ten" | "seven";
  tone: string;
};

type Props = {
  items: CollectionLeaf[];
  onOpen: (leaf: CollectionLeaf) => void;
};

export default function VinylShelf({ items, onOpen }: Props) {
  const [pulledKey, setPulledKey] = useState<string | null>(null);

  const spines = useMemo(() => {
    const out: ShelfItem[] = [];
    const seen = new Set<string>();
    for (const card of items) {
      const leaf = pickVinylLeaf(card);
      if (!leaf) continue;
      const key = String(
        leaf.id ??
          `${leaf.artist}|${leaf.title}|${leaf.media_type}|${leaf.edition || ""}`
      );
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        leaf,
        coverUrl: leaf.cover_url || card.cover_url || DEFAULT_DISC_URL,
        size: vinylSizeClass(leaf.media_type),
        tone: spineTone(leaf.title || card.title, leaf.artist || card.artist),
      });
    }
    return out;
  }, [items]);

  const pulled = spines.find((s) => s.key === pulledKey) || null;

  if (!spines.length) {
    return (
      <div className="vinyl-shelf vinyl-shelf--empty">
        <p>No vinyl on this shelf yet.</p>
        <p className="muted">
          Add LP, 7&quot;, or 10&quot; editions in Collection — they show here as
          spines.
        </p>
      </div>
    );
  }

  return (
    <div className="vinyl-shelf">
      <div className="vinyl-shelf__stage" role="list" aria-label="Vinyl shelf">
        {spines.map((item) => {
          const active = item.key === pulledKey;
          const label = `${item.leaf.artist} — ${item.leaf.title}`;
          return (
            <button
              key={item.key}
              type="button"
              role="listitem"
              className={`vinyl-shelf__spine vinyl-shelf__spine--${item.size}${
                active ? " is-pulled" : ""
              }`}
              title={label}
              aria-label={label}
              aria-pressed={active}
              style={
                {
                  "--spine-tone": item.tone,
                  "--spine-art": `url("${item.coverUrl}")`,
                } as CSSProperties
              }
              onClick={() => {
                if (active) {
                  onOpen(item.leaf);
                  return;
                }
                setPulledKey(item.key);
              }}
              onDoubleClick={() => onOpen(item.leaf)}
            >
              <span className="vinyl-shelf__spine-art" aria-hidden />
              <span className="vinyl-shelf__spine-label">
                <span className="vinyl-shelf__spine-artist">
                  {item.leaf.artist}
                </span>
                <span className="vinyl-shelf__spine-title">
                  {item.leaf.title}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="vinyl-shelf__plank" aria-hidden />

      {pulled ? (
        <div className="vinyl-shelf__pullout">
          <button
            type="button"
            className="vinyl-shelf__sleeve"
            onClick={() => onOpen(pulled.leaf)}
            aria-label={`Open ${pulled.leaf.title}`}
          >
            <img
              src={pulled.coverUrl}
              alt=""
              className="vinyl-shelf__sleeve-cover"
              draggable={false}
            />
            <span className="vinyl-shelf__disc" aria-hidden />
          </button>
          <div className="vinyl-shelf__meta">
            <p className="vinyl-shelf__meta-artist">{pulled.leaf.artist}</p>
            <p className="vinyl-shelf__meta-title">{pulled.leaf.title}</p>
            <p className="vinyl-shelf__meta-line muted">
              {[
                pulled.leaf.media_type,
                pulled.leaf.edition,
                pulled.leaf.edition_date_display ||
                  pulled.leaf.display_date_display ||
                  pulled.leaf.year,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="vinyl-shelf__meta-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => onOpen(pulled.leaf)}
              >
                Open release
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setPulledKey(null)}
              >
                Reshelve
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="vinyl-shelf__hint muted">
          Tap a spine to pull the sleeve · tap again to open
        </p>
      )}
    </div>
  );
}
