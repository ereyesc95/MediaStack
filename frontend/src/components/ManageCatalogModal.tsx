import { useEffect, useMemo, useState } from "react";
import {
  createCatalogImport,
  previewCatalogImport,
  searchCatalogImport,
  type CatalogImportItem,
  type CatalogImportModule,
  type CatalogImportSearchItem,
} from "../api";
import ModalPortal from "./ModalPortal";

type Props = {
  module: CatalogImportModule;
  onClose: () => void;
  onChanged: () => void;
};

const LABELS: Record<CatalogImportModule, { singular: string; plural: string }> = {
  movies: { singular: "movie", plural: "Movies" },
  series: { singular: "series", plural: "Series" },
  books: { singular: "book", plural: "Books" },
};

export default function ManageCatalogModal({
  module,
  onClose,
  onChanged,
}: Props) {
  const labels = LABELS[module];
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogImportSearchItem[]>([]);
  const [localFranchises, setLocalFranchises] = useState<
    CatalogImportSearchItem[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CatalogImportSearchItem | null>(null);
  const [items, setItems] = useState<CatalogImportItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [franchiseName, setFranchiseName] = useState("");
  const [scope, setScope] = useState<"single" | "collection" | "series">(
    "single"
  );
  const [franchiseHome, setFranchiseHome] = useState(false);
  const [includeGuide, setIncludeGuide] = useState(true);
  const [nestedSeries, setNestedSeries] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closeWarning, setCloseWarning] = useState(false);

  useEffect(() => {
    setNestedSeries(
      module === "series" &&
        Boolean(selected && franchiseName && franchiseName !== selected.title)
    );
  }, [franchiseName, module, selected]);

  async function search() {
    const value = query.trim();
    if (value.length < 2 || searching) return;
    setSearching(true);
    setError(null);
    setSelected(null);
    setItems([]);
    try {
      const data = await searchCatalogImport(module, value);
      setLocalFranchises(data.local_franchises);
      setResults(data.items);
    } catch (e) {
      setResults([]);
      setLocalFranchises([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }

  async function choose(item: CatalogImportSearchItem) {
    if (item.source === "local") {
      setFranchiseName(item.title);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const data = await previewCatalogImport(module, item);
      setSelected(item);
      setItems(data.items);
      setSelectedIds(new Set(data.items.map((entry) => entry.provider_id)));
      setFranchiseName((current) => current || data.franchise_name || item.title);
      setScope(data.scope);
      setNestedSeries(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }

  function toggleItem(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const chosenItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.provider_id)),
    [items, selectedIds]
  );
  const estimatedSeconds = Math.max(
    10,
    chosenItems.length * (module === "books" ? 5 : 12)
  );

  async function create() {
    if (!franchiseName.trim() || !chosenItems.length || saving) return;
    setSaving(true);
    setCloseWarning(false);
    setError(null);
    try {
      const result = await createCatalogImport(module, {
        franchise_name: franchiseName.trim(),
        franchise_home: franchiseHome,
        include_guide: includeGuide,
        nested_series: nestedSeries,
        items: chosenItems,
      });
      if (result.metadata_errors.length) {
        setError(
          `Folders created, but some metadata could not be saved: ${result.metadata_errors.join(
            "; "
          )}`
        );
      }
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function requestClose() {
    if (saving) {
      setCloseWarning(true);
      return;
    }
    onClose();
  }

  return (
    <ModalPortal onClose={requestClose}>
      <div
        className="modal-panel artist-admin-modal manage-catalog-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>Add {labels.singular}</h3>
          <button
            type="button"
            className="modal-close-x"
            onClick={requestClose}
          >
            ×
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        {!selected ? (
          <div className="artist-admin-form">
            <label>
              Search {module === "books" ? "Google Books" : "TMDb"}
              <span className="manage-catalog-modal__search">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void search();
                    }
                  }}
                  placeholder={`${labels.singular} title…`}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn"
                  disabled={searching || query.trim().length < 2}
                  onClick={() => void search()}
                >
                  {searching ? "…" : "Search"}
                </button>
              </span>
            </label>

            {localFranchises.length ? (
              <section>
                <small className="muted">Local franchise matches</small>
                <ul className="add-similar-results">
                  {localFranchises.map((item) => (
                    <li key={`${item.kind}-${item.title}`}>
                      <button
                        type="button"
                        className="btn btn--block"
                        onClick={() => setFranchiseName(item.title)}
                      >
                        <span className="add-similar-results__name">
                          {item.title}
                        </span>
                        <span className="muted add-similar-results__dis">
                          {item.subtitle}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {results.length ? (
              <ul className="add-similar-results">
                {results.map((item) => (
                  <li key={`${item.kind}-${item.provider_id}`}>
                    <button
                      type="button"
                      className="btn btn--block"
                      disabled={searching}
                      onClick={() => void choose(item)}
                    >
                      <span className="add-similar-results__name">
                        {item.title}
                      </span>
                      <span className="muted add-similar-results__dis">
                        {item.subtitle}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="artist-admin-form">
            <label>
              Franchise name
              <input
                value={franchiseName}
                onChange={(e) => setFranchiseName(e.target.value)}
              />
            </label>

            {module === "series" ? (
              <label className="manage-artists-modal__guide-option">
                <input
                  type="checkbox"
                  checked={nestedSeries}
                  onChange={(e) => setNestedSeries(e.target.checked)}
                />
                Create as a show inside the franchise
              </label>
            ) : null}

            <div className="manage-catalog-modal__items">
              <small className="muted">
                {scope === "collection"
                  ? "TMDb collection"
                  : scope === "series" && module === "books"
                    ? "Possible Google Books series"
                    : "Selected title"}
              </small>
              {items.map((item) => (
                <label
                  key={item.provider_id}
                  className="manage-catalog-modal__item"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.provider_id)}
                    onChange={() => toggleItem(item.provider_id)}
                  />
                  <span>
                    <strong>{item.title}</strong>
                    {item.date ? (
                      <small className="muted"> {item.date}</small>
                    ) : null}
                    {module === "series" && item.seasons?.length ? (
                      <small className="muted">
                        {" "}
                        · {item.seasons.filter((season) => season.number > 0).length}{" "}
                        seasons
                        {item.seasons.some((season) => season.number === 0)
                          ? " + Specials"
                          : ""}
                      </small>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>

            <small className="muted">
              {chosenItems.length} folder{chosenItems.length === 1 ? "" : "s"}{" "}
              will be scaffolded
            </small>
            <small className="muted">
              Approximate time:{" "}
              {estimatedSeconds >= 60
                ? `${Math.ceil(estimatedSeconds / 60)} minute(s)`
                : `${estimatedSeconds} seconds`}
            </small>
            <label className="manage-artists-modal__guide-option">
              <input
                type="checkbox"
                checked={franchiseHome}
                onChange={(e) => setFranchiseHome(e.target.checked)}
              />
              Use {labels.plural} as franchise home
            </label>
            <label className="manage-artists-modal__guide-option">
              <input
                type="checkbox"
                checked={includeGuide}
                onChange={(e) => setIncludeGuide(e.target.checked)}
              />
              Include user guide
            </label>

            {saving ? (
              <small className="muted">Creating folders, please wait...</small>
            ) : null}
            {closeWarning ? (
              <small className="muted">
                Closing now may interrupt the process and result in incomplete
                data.
              </small>
            ) : null}

            <div className="modal-actions-row">
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={() => {
                  setSelected(null);
                  setItems([]);
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={
                  saving || !franchiseName.trim() || chosenItems.length === 0
                }
                onClick={() => void create()}
              >
                + Create
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalPortal>
  );
}
