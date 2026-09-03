import { useCallback, useEffect, useState } from "react";
import {
  deleteBand,
  estimateBandImport,
  importBandFromMb,
  importUnregisteredBand,
  searchMusicBrainz,
  searchRosterBands,
  type ArtistImportEstimate,
  type ArtistImportResult,
} from "../../api";
import type { MbArtistMatch } from "../../types";
import SearchableDropdown, {
  type DropdownOption,
} from "../SearchableDropdown";

type Props = {
  onClose: () => void;
  onChanged: () => void;
};

type SelectedArtist = {
  id: number;
  name: string;
};

function approximateTimeLabel(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60) || 1);
  return `Approximate time: ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export default function ManageArtistsModal({ onClose, onChanged }: Props) {
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<MbArtistMatch[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [catalogMatches, setCatalogMatches] = useState<DropdownOption[]>([]);
  const [selectedValue, setSelectedValue] = useState("");
  const [selected, setSelected] = useState<SelectedArtist[]>([]);
  const [busy, setBusy] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingArtist, setPendingArtist] = useState<MbArtistMatch | null>(null);
  const [estimate, setEstimate] = useState<ArtistImportEstimate | null>(null);
  const [writeUserGuide, setWriteUserGuide] = useState(false);
  const [closeWarning, setCloseWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!importing) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [importing]);

  function requestClose() {
    if (importing) {
      setCloseWarning(
        "Artist data and folders are still being created. Closing now can hide " +
          "the result and may leave the import incomplete. Keep this window open " +
          "until MyStack confirms it has finished."
      );
      return;
    }
    if (busy) return;
    onClose();
  }

  const searchCatalog = useCallback(async (value: string) => {
    const data = await searchRosterBands(value, 50);
    const options = (data.items || []).map((artist) => ({
      value: String(artist.id),
      label: artist.name,
    }));
    setCatalogMatches(options);
    return options;
  }, []);

  function finishImport(result: ArtistImportResult) {
    const warnings = result.warnings?.length
      ? ` Warnings: ${result.warnings.join(" ")}`
      : "";
    setNotice(`${result.message}${warnings}`);
    setMatches([]);
    setQuery("");
    setNotFound(false);
    setPendingArtist(null);
    setEstimate(null);
    setWriteUserGuide(false);
    onChanged();
  }

  async function handleSearch() {
    setError(null);
    setNotice(null);
    setBusy(true);
    setMatches([]);
    setNotFound(false);
    setPendingArtist(null);
    setEstimate(null);
    try {
      const data = await searchMusicBrainz(query);
      const items = data.items ?? [];
      setMatches(items);
      setNotFound(items.length === 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function prepareArtist(match: MbArtistMatch) {
    setPendingArtist(match);
    setEstimate(null);
    setWriteUserGuide(false);
    setError(null);
    setNotice(null);
    setCloseWarning(null);
    setNotFound(false);
    setEstimating(true);
    try {
      setEstimate(await estimateBandImport(match.mbid));
    } catch (e) {
      setError(
        `Could not estimate this import: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    } finally {
      setEstimating(false);
    }
  }

  async function addArtist() {
    if (!pendingArtist || !estimate) return;
    setBusy(true);
    setImporting(true);
    setError(null);
    setNotice(null);
    setCloseWarning(null);
    try {
      finishImport(
        await importBandFromMb(pendingArtist.mbid, writeUserGuide)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
      setBusy(false);
    }
  }

  async function addUnregisteredArtist() {
    const name = query.trim();
    if (!name) return;
    setBusy(true);
    setImporting(true);
    setError(null);
    setNotice(null);
    setCloseWarning(null);
    try {
      finishImport(await importUnregisteredBand(name));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
      setBusy(false);
    }
  }

  function selectForRemoval(value: string) {
    setSelectedValue("");
    const id = Number(value);
    if (!Number.isFinite(id) || selected.some((artist) => artist.id === id)) {
      return;
    }
    const option = catalogMatches.find((item) => item.value === value);
    setSelected((current) => [
      ...current,
      { id, name: option?.label || `Artist ${id}` },
    ]);
  }

  async function removeSelected() {
    if (!selected.length) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const removed: SelectedArtist[] = [];
    const failures: string[] = [];

    for (const artist of selected) {
      try {
        await deleteBand(artist.id);
        removed.push(artist);
      } catch (e) {
        failures.push(
          `${artist.name}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    if (removed.length) {
      const removedIds = new Set(removed.map((artist) => artist.id));
      setSelected((current) =>
        current.filter((artist) => !removedIds.has(artist.id))
      );
      setNotice(
        `${removed.length} artist${removed.length === 1 ? "" : "s"} removed.`
      );
      onChanged();
    }
    if (failures.length) setError(failures.join("\n"));
    setBusy(false);
  }

  const canCreate =
    Boolean(pendingArtist && estimate) &&
    !(estimate?.local_folder_exists && estimate?.catalog_exists);

  return (
    <div className="modal-backdrop" onClick={requestClose}>
      <div
        className="modal-panel artist-admin-modal manage-artists-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>Manage Artists</h3>
          <button
            type="button"
            className="modal-close-x"
            aria-label="Close"
            onClick={requestClose}
            disabled={busy && !importing}
          >
            ×
          </button>
        </div>

        <div className="series-cast-add__tabs" role="tablist">
          <button
            type="button"
            className={mode === "add" ? "active" : ""}
            disabled={busy || estimating}
            onClick={() => {
              setMode("add");
              setError(null);
              setNotice(null);
            }}
          >
            Add artist
          </button>
          <button
            type="button"
            className={mode === "remove" ? "active" : ""}
            disabled={busy || estimating}
            onClick={() => {
              setMode("remove");
              setError(null);
              setNotice(null);
            }}
          >
            Remove artists
          </button>
        </div>

        <div className="artist-admin-form">
          {mode === "add" ? (
            <>
              <div className="modal-search-row">
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setNotFound(false);
                  }}
                  placeholder="Artist or band name"
                  disabled={busy || estimating}
                  onKeyDown={(event) =>
                    event.key === "Enter" && void handleSearch()
                  }
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => void handleSearch()}
                  disabled={busy || estimating || !query.trim()}
                >
                  Search
                </button>
              </div>
              {!importing && !pendingArtist && (
                <ul className="mb-matches">
                  {matches.map((match) => (
                    <li key={match.mbid}>
                      <button
                        type="button"
                        onClick={() => void prepareArtist(match)}
                        disabled={busy || estimating}
                      >
                        <strong>{match.name}</strong>
                        {match.disambiguation && (
                          <span className="muted">
                            {" "}
                            — {match.disambiguation}
                          </span>
                        )}
                        {match.type && (
                          <span className="badge">{match.type}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {notFound && !importing && !pendingArtist && (
                <p className="manage-artists-modal__not-found">
                  Artist not found,{" "}
                  <a
                    href="https://musicbrainz.org/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="manage-artists-modal__inline-link"
                  >
                    register in MusicBrainz
                  </a>{" "}
                  or{" "}
                  <button
                    type="button"
                    className="manage-artists-modal__inline-link"
                    onClick={() => void addUnregisteredArtist()}
                    disabled={busy}
                  >
                    continue with no registration
                  </button>
                </p>
              )}
              {pendingArtist && (
                <div className="manage-artists-modal__import">
                  <div className="manage-artists-modal__import-heading">
                    <strong>{pendingArtist.name}</strong>
                    {!importing && (
                      <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => {
                          setPendingArtist(null);
                          setEstimate(null);
                          setError(null);
                        }}
                        disabled={estimating}
                      >
                        Choose another
                      </button>
                    )}
                  </div>
                  {estimating && (
                    <p className="muted">Calculating...</p>
                  )}
                  {estimate && (
                    <>
                      <div className="manage-artists-modal__estimate">
                        {!estimate.local_folder_exists && (
                          <>
                            <p>{approximateTimeLabel(estimate.estimated_seconds)}</p>
                            <p>
                              {estimate.release_group_count} release
                              {estimate.release_group_count === 1 ? "" : "s"} found
                            </p>
                          </>
                        )}
                        {estimate.local_folder_exists &&
                          !estimate.catalog_exists && (
                            <small className="muted">
                              The local folder will not be changed. Only missing
                              catalog data will be imported.
                            </small>
                          )}
                      </div>
                      {!estimate.local_folder_exists && !importing && (
                        <label className="ms-checkbox manage-artists-modal__guide-option">
                          <input
                            type="checkbox"
                            checked={writeUserGuide}
                            onChange={(event) =>
                              setWriteUserGuide(event.target.checked)
                            }
                          />
                          <span className="ms-checkbox__box" aria-hidden="true" />
                          <span className="ms-checkbox__label">
                            Include user guide
                          </span>
                        </label>
                      )}
                      {estimate.local_folder_exists &&
                      estimate.catalog_exists ? (
                        <p className="modal-notice">
                          This artist already exists locally and in the catalog.
                          Nothing will be changed.
                        </p>
                      ) : importing ? (
                        <div
                          className="manage-artists-modal__progress"
                          role="status"
                        >
                          <span className="manage-artists-modal__spinner" />
                          <div>
                            <strong>Creating artist…</strong>
                            <small className="muted">
                              Keep this window open. Create and search controls
                              are unavailable until the import finishes.
                            </small>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              )}
              {importing && !pendingArtist && (
                <div
                  className="manage-artists-modal__progress"
                  role="status"
                >
                  <span className="manage-artists-modal__spinner" />
                  <div>
                    <strong>Creating artist…</strong>
                    <small className="muted">
                      Keep this window open. Create and search controls are
                      unavailable until the import finishes.
                    </small>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="muted">
                Select the artists to be removed. This action cannot be undone.
              </p>
              <SearchableDropdown
                options={[]}
                value={selectedValue}
                onSearch={searchCatalog}
                minQueryLength={1}
                visibleRows={8}
                portal
                placeholder="Search catalog artists…"
                onChange={(value) => {
                  setSelectedValue(value);
                  selectForRemoval(value);
                }}
              />
              <div className="manage-artists-modal__selection">
                {selected.map((artist) => (
                  <span key={artist.id} className="manage-artists-modal__chip">
                    {artist.name}
                    <button
                      type="button"
                      aria-label={`Remove ${artist.name} from selection`}
                      onClick={() =>
                        setSelected((current) =>
                          current.filter((item) => item.id !== artist.id)
                        )
                      }
                      disabled={busy}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {!selected.length && (
                  <span className="muted">No artists selected.</span>
                )}
              </div>
            </>
          )}
        </div>

        {notice && <p className="modal-notice">{notice}</p>}
        {closeWarning && (
          <p className="manage-artists-modal__close-warning" role="alert">
            {closeWarning}
          </p>
        )}
        {error && <p className="error manage-artists-modal__error">{error}</p>}

        {mode === "add" && canCreate && !importing && (
          <div className="modal-panel-actions modal-panel-actions--end">
            <button
              type="button"
              className="btn manage-artists-modal__create"
              onClick={() => void addArtist()}
              disabled={busy || estimating}
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="manage-artists-modal__plus"
              >
                <path
                  d="M8 2.5v11M2.5 8h11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
              Create artist
            </button>
          </div>
        )}

        {mode === "remove" && (
          <div className="modal-panel-actions modal-panel-actions--end">
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy || !selected.length}
              onClick={() => void removeSelected()}
            >
              {busy
                ? "Removing…"
                : `Remove ${selected.length || ""} artist${
                    selected.length === 1 ? "" : "s"
                  }`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
