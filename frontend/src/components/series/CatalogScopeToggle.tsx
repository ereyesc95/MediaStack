import { IconMediaSeries, IconSeriesScope, IconUniverse } from "../MenuIcons";
import type { SeriesCatalogScope } from "./SeriesBrowse";
import type { ReactNode } from "react";

type Props = {
  value: SeriesCatalogScope;
  onChange: (next: SeriesCatalogScope) => void;
  className?: string;
  /** Secondary scope label when not Groups (default Shows; Movies uses Films). */
  itemsLabel?: string;
  /** Icon for the leaf items mode (Shows / Films / Books / Games). */
  itemsIcon?: ReactNode;
  /** When true, cycle includes Universes. */
  hasUniverses?: boolean;
  /** When true (Games), cycle starts with Platforms. */
  hasPlatforms?: boolean;
  platformsIcon?: ReactNode;
};

/** Single control that cycles Franchises → Shows/Films → Universes (like Cover/Banner). */
export default function CatalogScopeToggle({
  value,
  onChange,
  className = "",
  itemsLabel = "SHOWS",
  itemsIcon,
  hasUniverses = false,
  hasPlatforms = false,
  platformsIcon,
}: Props) {
  const order: SeriesCatalogScope[] = [
    ...(hasPlatforms ? (["platforms"] as const) : []),
    "franchises",
    "shows",
    ...(hasUniverses ? (["universes"] as const) : []),
  ];
  const safeValue =
    value === "universes" && !hasUniverses
      ? "franchises"
      : value === "platforms" && !hasPlatforms
        ? "franchises"
        : value;
  const idx = Math.max(0, order.indexOf(safeValue));
  const current = order[idx] ?? "franchises";
  const next = order[(idx + 1) % order.length] ?? "franchises";

  const label =
    current === "platforms"
      ? "PLATFORMS"
      : current === "franchises"
        ? "FRANCHISES"
        : current === "universes"
          ? "UNIVERSES"
          : itemsLabel.toLocaleUpperCase();

  const title =
    next === "platforms"
      ? "Switch to Platforms"
      : next === "franchises"
        ? "Switch to Franchises"
        : next === "universes"
          ? "Switch to Universes"
          : `Switch to ${itemsLabel}`;

  return (
    <button
      type="button"
      className={`catalog-scope-toggle catalog-scope-toggle--switch ${className}`.trim()}
      aria-label={label}
      title={title}
      onClick={() => onChange(next)}
    >
      {current === "platforms" ? (
        platformsIcon ?? <IconSeriesScope className="catalog-scope-toggle__icon" />
      ) : current === "franchises" ? (
        <IconSeriesScope className="catalog-scope-toggle__icon" />
      ) : current === "universes" ? (
        <IconUniverse className="catalog-scope-toggle__icon" />
      ) : (
        itemsIcon ?? <IconMediaSeries className="catalog-scope-toggle__icon" />
      )}
      {label}
    </button>
  );
}
