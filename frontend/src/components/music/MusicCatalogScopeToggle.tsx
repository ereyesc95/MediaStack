import { IconAddArtist, IconDisc, IconHeadphones } from "../MenuIcons";
import type { MusicCatalogScope } from "../../types";

type Props = {
  value: MusicCatalogScope;
  onChange: (next: MusicCatalogScope) => void;
  className?: string;
};

const ORDER: MusicCatalogScope[] = ["artists", "albums", "singles"];

const LABELS: Record<MusicCatalogScope, string> = {
  artists: "ARTISTS",
  albums: "ALBUMS",
  singles: "SINGLES",
};

/** Cycles ARTISTS → ALBUMS → SINGLES. */
export default function MusicCatalogScopeToggle({
  value,
  onChange,
  className = "",
}: Props) {
  const idx = Math.max(0, ORDER.indexOf(value));
  const current = ORDER[idx] ?? "artists";
  const next = ORDER[(idx + 1) % ORDER.length] ?? "artists";
  const label = LABELS[current];
  const title = `Switch to ${LABELS[next].charAt(0)}${LABELS[next].slice(1).toLowerCase()}`;

  return (
    <button
      type="button"
      className={`catalog-scope-toggle catalog-scope-toggle--switch ${className}`.trim()}
      aria-label={label}
      title={title}
      onClick={() => onChange(next)}
    >
      {current === "artists" ? (
        <IconAddArtist className="catalog-scope-toggle__icon" />
      ) : current === "singles" ? (
        <IconHeadphones className="catalog-scope-toggle__icon" />
      ) : (
        <IconDisc className="catalog-scope-toggle__icon" />
      )}
      {label}
    </button>
  );
}
