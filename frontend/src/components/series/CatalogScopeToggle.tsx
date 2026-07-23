import type { SeriesCatalogScope } from "./SeriesBrowse";

type Props = {
  value: SeriesCatalogScope;
  onChange: (next: SeriesCatalogScope) => void;
  className?: string;
};

export default function CatalogScopeToggle({
  value,
  onChange,
  className = "",
}: Props) {
  return (
    <div
      className={`catalog-scope-toggle ${className}`.trim()}
      role="group"
      aria-label="Catalog scope"
    >
      <button
        type="button"
        className={value === "franchises" ? "active" : ""}
        aria-pressed={value === "franchises"}
        onClick={() => onChange("franchises")}
        title="Franchises"
      >
        FRANCHISES
      </button>
      <button
        type="button"
        className={value === "shows" ? "active" : ""}
        aria-pressed={value === "shows"}
        onClick={() => onChange("shows")}
        title="Series"
      >
        SERIES
      </button>
    </div>
  );
}
