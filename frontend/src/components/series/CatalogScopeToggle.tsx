import { IconMediaSeries, IconSeriesScope } from "../MenuIcons";
import type { SeriesCatalogScope } from "./SeriesBrowse";

type Props = {
  value: SeriesCatalogScope;
  onChange: (next: SeriesCatalogScope) => void;
  className?: string;
};

/** Single control that flips between Groups and Shows (like Cover/Banner). */
export default function CatalogScopeToggle({
  value,
  onChange,
  className = "",
}: Props) {
  const isGroups = value === "franchises";
  return (
    <button
      type="button"
      className={`catalog-scope-toggle catalog-scope-toggle--switch ${className}`.trim()}
      aria-label={isGroups ? "Groups view" : "Shows view"}
      title={isGroups ? "Switch to Shows" : "Switch to Groups"}
      onClick={() => onChange(isGroups ? "shows" : "franchises")}
    >
      {isGroups ? (
        <IconSeriesScope className="catalog-scope-toggle__icon" />
      ) : (
        <IconMediaSeries className="catalog-scope-toggle__icon" />
      )}
      {isGroups ? "GROUPS" : "SHOWS"}
    </button>
  );
}
