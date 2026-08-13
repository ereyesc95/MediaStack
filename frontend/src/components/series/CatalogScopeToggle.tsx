import { IconMediaSeries, IconSeriesScope, IconUniverse } from "../MenuIcons";
import type { SeriesCatalogScope } from "./SeriesBrowse";

type Props = {
  value: SeriesCatalogScope;
  onChange: (next: SeriesCatalogScope) => void;
  className?: string;
  /** Secondary scope label when not Groups (default Shows; Movies uses Films). */
  itemsLabel?: string;
  /** When true, cycle includes Universes as a third mode. */
  hasUniverses?: boolean;
};

const ORDER_BASE: SeriesCatalogScope[] = ["franchises", "shows"];
const ORDER_WITH_UNI: SeriesCatalogScope[] = [
  "franchises",
  "shows",
  "universes",
];

/** Single control that cycles Franchises → Shows/Films → Universes (like Cover/Banner). */
export default function CatalogScopeToggle({
  value,
  onChange,
  className = "",
  itemsLabel = "SHOWS",
  hasUniverses = false,
}: Props) {
  const order = hasUniverses ? ORDER_WITH_UNI : ORDER_BASE;
  const idx = Math.max(0, order.indexOf(value === "universes" && !hasUniverses ? "franchises" : value));
  const current = order[idx] ?? "franchises";
  const next = order[(idx + 1) % order.length] ?? "franchises";

  const label =
    current === "franchises"
      ? "FRANCHISES"
      : current === "universes"
        ? "UNIVERSES"
        : itemsLabel.toLocaleUpperCase();

  const title =
    next === "franchises"
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
      {current === "franchises" ? (
        <IconSeriesScope className="catalog-scope-toggle__icon" />
      ) : current === "universes" ? (
        <IconUniverse className="catalog-scope-toggle__icon" />
      ) : (
        <IconMediaSeries className="catalog-scope-toggle__icon" />
      )}
      {label}
    </button>
  );
}
