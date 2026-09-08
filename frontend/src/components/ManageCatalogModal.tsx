import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCatalogImport,
  previewCatalogImport,
  removeCatalogRegistration,
  searchCatalogImport,
  searchCatalogRegistrations,
  type CatalogImportItem,
  type CatalogImportModule,
  type CatalogImportSearchItem,
  type CatalogRegistration,
} from "../api";
import useSlowLookupHint from "../useSlowLookupHint";
import ModalPortal from "./ModalPortal";

type Props = {
  module: CatalogImportModule;
  onClose: () => void;
  onChanged: () => void;
};

/** A title queued for scaffolding. `key` is local only; `provider_id` may be empty. */
type PickedItem = CatalogImportItem & { key: string };

const LABELS: Record<
  CatalogImportModule,
  {
    singular: string;
    plural: string;
    titlePlaceholder: string;
    provider: string;
    providerUrl: string;
  }
> = {
  movies: {
    singular: "movie",
    plural: "Movies",
    titlePlaceholder: "Movie title or ID",
    provider: "TMDb",
    providerUrl: "https://www.themoviedb.org/",
  },
  series: {
    singular: "series",
    plural: "Series",
    titlePlaceholder: "Series title or ID",
    provider: "TMDb",
    providerUrl: "https://www.themoviedb.org/",
  },
  books: {
    singular: "book",
    plural: "Books",
    titlePlaceholder: "Book title or ID",
    provider: "Google Books",
    providerUrl: "https://books.google.com/",
  },
};

function SearchIconButton({
  searching,
  disabled,
  onClick,
}: {
  searching: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="manage-artists-modal__search-btn"
      aria-label={searching ? "Searching" : "Search"}
      onClick={onClick}
      disabled={disabled}
    >
      {searching ? (
        <span
          className="manage-artists-modal__spinner manage-artists-modal__spinner--sm"
          aria-hidden="true"
        />
      ) : (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle
            cx="7"
            cy="7"
            r="4.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M10.4 10.4 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}

function Checkbox({
  checked,
  disabled,
  onChange,
  className,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`ms-checkbox${disabled ? " ms-checkbox--disabled" : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ms-checkbox__box" aria-hidden="true" />
      <span className="ms-checkbox__label">{children}</span>
    </label>
  );
}

function itemIdentity(item: CatalogImportItem) {
  return item.provider_id || item.title.trim().toLowerCase();
}

export default function ManageCatalogModal({
  module,
  onClose,
  onChanged,
}: Props) {
  const labels = LABELS[module];
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [step, setStep] = useState<"search" | "details">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogImportSearchItem[]>([]);
  const [localFranchises, setLocalFranchises] = useState<
    CatalogImportSearchItem[]
  >([]);
  const [notFound, setNotFound] = useState(false);
  const [searching, setSearching] = useState(false);
  const [firstPick, setFirstPick] = useState<CatalogImportSearchItem | null>(
    null
  );
  const [items, setItems] = useState<PickedItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
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
  const [registrationQuery, setRegistrationQuery] = useState("");
  const [registrations, setRegistrations] = useState<CatalogRegistration[]>([]);
  const [selectedRegistrations, setSelectedRegistrations] = useState<
    Set<string>
  >(new Set());
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const lookupControllerRef = useRef<AbortController | null>(null);
  const slowLookup = useSlowLookupHint(searching);

  useEffect(() => {
    setNestedSeries(
      module === "series" &&
        Boolean(firstPick && franchiseName && franchiseName !== firstPick.title)
    );
  }, [franchiseName, module, firstPick]);

  function stopLookup() {
    const controller = lookupControllerRef.current;
    lookupControllerRef.current = null;
    controller?.abort();
    setSearching(false);
  }

  async function search() {
    const value = query.trim();
    if (value.length < 1 || searching) return;
    setSearching(true);
    setError(null);
    setNotFound(false);
    const controller = new AbortController();
    lookupControllerRef.current = controller;
    try {
      const data = await searchCatalogImport(module, value, controller.signal);
      setLocalFranchises(data.local_franchises);
      setResults(data.items);
      setNotFound(data.items.length === 0);
    } catch (e) {
      if (controller.signal.aborted) return;
      setResults([]);
      setLocalFranchises([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (lookupControllerRef.current === controller) {
        lookupControllerRef.current = null;
        setSearching(false);
      }
    }
  }

  function addPicked(incoming: CatalogImportItem[]) {
    const added: PickedItem[] = [];
    setItems((current) => {
      const seen = new Set(current.map(itemIdentity));
      for (const entry of incoming) {
        const identity = itemIdentity(entry);
        if (!identity || seen.has(identity)) continue;
        seen.add(identity);
        added.push({ ...entry, key: `${identity}-${current.length + added.length}` });
      }
      return [...current, ...added];
    });
    setSelectedKeys((current) => {
      const next = new Set(current);
      for (const entry of added) next.add(entry.key);
      return next;
    });
  }

  async function choose(item: CatalogImportSearchItem) {
    if (item.source === "local") {
      setFranchiseName(item.title);
      return;
    }
    setSearching(true);
    setError(null);
    const controller = new AbortController();
    lookupControllerRef.current = controller;
    try {
      const data = await previewCatalogImport(module, item, controller.signal);
      addPicked(data.items);
      if (!firstPick) {
        setFirstPick(item);
        setScope(data.scope);
        setNestedSeries(false);
      }
      setFranchiseName(
        (current) => current || data.franchise_name || item.title
      );
      setStep("details");
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (lookupControllerRef.current === controller) {
        lookupControllerRef.current = null;
        setSearching(false);
      }
    }
  }

  /** Queue the typed title with no provider metadata and stop the lookup. */
  function continueWithoutRegistration() {
    const title = query.trim();
    stopLookup();
    if (!title) return;
    addPicked([{ provider_id: "", title, date: null }]);
    setFranchiseName((current) => current || title);
    setResults([]);
    setNotFound(false);
    setStep("details");
  }

  function toggleItem(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const chosenItems = useMemo(
    () => items.filter((item) => selectedKeys.has(item.key)),
    [items, selectedKeys]
  );
  const estimatedSeconds = Math.max(
    10,
    chosenItems.length * (module === "books" ? 5 : 12)
  );
  const queuedIdentities = useMemo(
    () => new Set(items.map(itemIdentity)),
    [items]
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
        items: chosenItems.map(({ key: _key, ...item }) => item),
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

  async function searchRegistrations() {
    if (registrationBusy) return;
    setRegistrationBusy(true);
    setError(null);
    try {
      const data = await searchCatalogRegistrations(
        module,
        registrationQuery.trim()
      );
      setRegistrations(data.items);
      setSelectedRegistrations(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegistrationBusy(false);
    }
  }

  async function removeRegistrations() {
    if (!selectedRegistrations.size || registrationBusy) return;
    setRegistrationBusy(true);
    setError(null);
    try {
      for (const id of selectedRegistrations) {
        await removeCatalogRegistration(module, id);
      }
      setRegistrations((current) =>
        current.filter((item) => !selectedRegistrations.has(item.id))
      );
      setSelectedRegistrations(new Set());
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegistrationBusy(false);
    }
  }

  function requestClose() {
    if (saving) {
      setCloseWarning(true);
      return;
    }
    stopLookup();
    onClose();
  }

  const searchRow = (
    <>
      <p className="manage-artists-modal__search-instruction">
        Search {labels.singular} by title or by{" "}
        <a
          href={labels.providerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="manage-artists-modal__inline-link"
          title={`Get ID from ${labels.provider}`}
        >
          ID
        </a>
      </p>
      <div className="modal-search-row">
        <input
          aria-label={labels.titlePlaceholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setNotFound(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder={labels.titlePlaceholder}
          autoFocus={step === "search"}
          disabled={saving}
        />
        <SearchIconButton
          searching={searching}
          disabled={searching || saving || query.trim().length < 1}
          onClick={() => void search()}
        />
      </div>
      {searching && slowLookup ? (
        <p className="manage-artists-modal__not-found-body">
          You can also{" "}
          <button
            type="button"
            className="manage-artists-modal__inline-link"
            onClick={continueWithoutRegistration}
          >
            continue with no registration
          </button>
        </p>
      ) : null}
      {notFound && !searching ? (
        <div className="manage-artists-modal__not-found">
          <p className="manage-artists-modal__not-found-title">
            {labels.singular[0].toUpperCase()}
            {labels.singular.slice(1)} not found
          </p>
          <p className="manage-artists-modal__not-found-body">
            <a
              href={labels.providerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="manage-artists-modal__inline-link"
            >
              Find it on {labels.provider}
            </a>{" "}
            or{" "}
            <button
              type="button"
              className="manage-artists-modal__inline-link"
              onClick={continueWithoutRegistration}
            >
              continue with no registration
            </button>{" "}
            to proceed
          </p>
        </div>
      ) : null}
    </>
  );

  const resultsList = (
    <>
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
          {results.map((item) => {
            const queued = queuedIdentities.has(
              item.provider_id || item.title.trim().toLowerCase()
            );
            return (
              <li key={`${item.kind}-${item.provider_id}`}>
                <button
                  type="button"
                  className="btn btn--block"
                  disabled={searching || saving || queued}
                  onClick={() => void choose(item)}
                >
                  <span className="add-similar-results__name">
                    {item.title}
                  </span>
                  <span className="muted add-similar-results__dis">
                    {queued ? "Already added" : item.subtitle}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );

  return (
    <ModalPortal onClose={requestClose}>
      <div
        className="modal-panel artist-admin-modal manage-catalog-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>Manage {labels.plural}</h3>
          <button
            type="button"
            className="modal-close-x"
            onClick={requestClose}
          >
            ×
          </button>
        </div>

        <div className="series-cast-add__tabs" role="tablist">
          <button
            type="button"
            className={mode === "add" ? "active" : ""}
            disabled={saving || registrationBusy}
            onClick={() => {
              setMode("add");
              setError(null);
            }}
          >
            Add {labels.singular}
          </button>
          <button
            type="button"
            className={mode === "remove" ? "active" : ""}
            disabled={saving || registrationBusy}
            onClick={() => {
              setMode("remove");
              setError(null);
            }}
          >
            Remove {labels.singular}
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        {mode === "remove" ? (
          <div className="artist-admin-form">
            <p className="muted">
              Select the {labels.plural.toLowerCase()} to be removed. This
              action cannot be undone.
            </p>
            <div className="modal-search-row">
              <input
                aria-label={`Find ${labels.singular} registrations`}
                value={registrationQuery}
                onChange={(e) => setRegistrationQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchRegistrations();
                  }
                }}
                placeholder={labels.titlePlaceholder}
              />
              <SearchIconButton
                searching={registrationBusy}
                disabled={registrationBusy}
                onClick={() => void searchRegistrations()}
              />
            </div>
            {registrations.length ? (
              <div className="manage-catalog-modal__items">
                {registrations.map((item) => (
                  <Checkbox
                    key={item.id}
                    className="manage-catalog-modal__item"
                    checked={selectedRegistrations.has(item.id)}
                    disabled={item.has_local_folder || registrationBusy}
                    onChange={() =>
                      setSelectedRegistrations((current) => {
                        const next = new Set(current);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                  >
                    {item.name}
                    {item.has_local_folder ? (
                      <span className="muted"> · Local folder protected</span>
                    ) : null}
                  </Checkbox>
                ))}
              </div>
            ) : null}
            <div className="modal-actions-row">
              <button
                type="button"
                className="btn btn--danger"
                disabled={registrationBusy || selectedRegistrations.size === 0}
                onClick={() => void removeRegistrations()}
              >
                Remove selected
              </button>
            </div>
          </div>
        ) : step === "search" ? (
          <div className="artist-admin-form">
            {searchRow}
            {resultsList}
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
              <Checkbox
                className="manage-artists-modal__guide-option"
                checked={nestedSeries}
                onChange={setNestedSeries}
              >
                Create as a show inside the franchise
              </Checkbox>
            ) : null}

            <div className="manage-catalog-modal__items">
              <small className="muted">
                {scope === "collection"
                  ? "TMDb collection"
                  : scope === "series" && module === "books"
                    ? "Possible Google Books series"
                    : "Selected titles"}
              </small>
              {items.map((item) => (
                <Checkbox
                  key={item.key}
                  className="manage-catalog-modal__item"
                  checked={selectedKeys.has(item.key)}
                  disabled={saving}
                  onChange={() => toggleItem(item.key)}
                >
                  {item.title}
                  {item.date ? (
                    <span className="muted"> {item.date}</span>
                  ) : null}
                  {module === "series" && item.seasons?.length ? (
                    <span className="muted">
                      {" · "}
                      {item.seasons.filter((season) => season.number > 0).length}{" "}
                      seasons
                      {item.seasons.some((season) => season.number === 0)
                        ? " + Specials"
                        : ""}
                    </span>
                  ) : null}
                  {!item.provider_id ? (
                    <span className="muted"> · No registration</span>
                  ) : null}
                </Checkbox>
              ))}
            </div>

            <small className="muted">
              Search to add more {labels.plural.toLowerCase()} to this franchise
            </small>
            {searchRow}
            {resultsList}

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
            <Checkbox
              className="manage-artists-modal__guide-option"
              checked={franchiseHome}
              onChange={setFranchiseHome}
            >
              Use {labels.plural} as franchise home
            </Checkbox>
            <Checkbox
              className="manage-artists-modal__guide-option"
              checked={includeGuide}
              onChange={setIncludeGuide}
            >
              Include user guide
            </Checkbox>

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
                  stopLookup();
                  setStep("search");
                  setFirstPick(null);
                  setItems([]);
                  setSelectedKeys(new Set());
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
