import { IconMediaSeries, IconSeriesScope } from "../MenuIcons";
import type { SeriesCatalogScope } from "./SeriesBrowse";

type Props = {
  value: SeriesCatalogScope;
  onChange: (next: SeriesCatalogScope) => void;
  className?: string;
  /** Secondary scope label when not Groups (default Shows; Movies uses Films). */
  itemsLabel?: string;
};

/** Single control that flips between Groups and Shows/Films (like Cover/Banner). */
export default function CatalogScopeToggle({
  value,
  onChange,
  className = "",
  itemsLabel = "SHOWS",
}: Props) {
  const isGroups = value === "franchises";
  const items = itemsLabel.toLocaleUpperCase();
  return (
    <button
      type="button"
      className={`catalog-scope-toggle catalog-scope-toggle--switch ${className}`.trim()}
      aria-label={isGroups ? "Groups view" : `${itemsLabel} view`}
      title={isGroups ? `Switch to ${itemsLabel}` : "Switch to Groups"}
      onClick={() => onChange(isGroups ? "shows" : "franchises")}
    >
      {isGroups ? (
        <IconSeriesScope className="catalog-scope-toggle__icon" />
      ) : (
        <IconMediaSeries className="catalog-scope-toggle__icon" />
      )}
      {isGroups ? "GROUPS" : items}
    </button>
  );
}
