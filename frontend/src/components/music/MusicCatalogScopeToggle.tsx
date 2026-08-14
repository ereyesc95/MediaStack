import { IconAddArtist, IconDisc } from "../MenuIcons";
import type { MusicCatalogScope } from "../../types";

type Props = {
  value: MusicCatalogScope;
  onChange: (next: MusicCatalogScope) => void;
  className?: string;
};

const ORDER: MusicCatalogScope[] = ["artists", "albums"];

/** Cycles ARTISTS ↔ ALBUMS (same pattern as Series CatalogScopeToggle). */
export default function MusicCatalogScopeToggle({
  value,
  onChange,
  className = "",
}: Props) {
  const idx = Math.max(0, ORDER.indexOf(value));
  const current = ORDER[idx] ?? "artists";
  const next = ORDER[(idx + 1) % ORDER.length] ?? "artists";
  const label = current === "artists" ? "ARTISTS" : "ALBUMS";
  const title = next === "artists" ? "Switch to Artists" : "Switch to Albums";

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
      ) : (
        <IconDisc className="catalog-scope-toggle__icon" />
      )}
      {label}
    </button>
  );
}
