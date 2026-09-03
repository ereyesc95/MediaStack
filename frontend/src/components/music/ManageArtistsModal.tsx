import { useCallback, useState } from "react";
import {
  deleteBand,
  importBandFromMb,
  searchMusicBrainz,
  searchRosterBands,
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

export default function ManageArtistsModal({ onClose, onChanged }: Props) {
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<MbArtistMatch[]>([]);
  const [catalogMatches, setCatalogMatches] = useState<DropdownOption[]>([]);
  const [selectedValue, setSelectedValue] = useState("");
  const [selected, setSelected] = useState<SelectedArtist[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const searchCatalog = useCallback(async (value: string) => {
    const data = await searchRosterBands(value, 50);
    const options = (data.items || []).map((artist) => ({
      value: String(artist.id),
      label: artist.name,
    }));
    setCatalogMatches(options);
    return options;
  }, []);

  async function handleSearch() {
    setError(null);
    setNotice(null);
    setBusy(true);
    setMatches([]);
    try {
      const data = await searchMusicBrainz(query);
      setMatches(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addArtist(match: MbArtistMatch) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await importBandFromMb(match.mbid);
      setNotice(
        result.existing
          ? `${result.name} is already in the catalog.`
          : `${result.name} was added.`
      );
      setMatches([]);
      setQuery("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
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

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
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
            onClick={onClose}
            disabled={busy}
          >
            ×
          </button>
        </div>

        <div className="series-cast-add__tabs" role="tablist">
          <button
            type="button"
            className={mode === "add" ? "active" : ""}
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
              <p className="muted">Search MusicBrainz (up to 3 matches).</p>
              <div className="modal-search-row">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Artist or band name"
                  onKeyDown={(event) =>
                    event.key === "Enter" && void handleSearch()
                  }
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => void handleSearch()}
                  disabled={busy || !query.trim()}
                >
                  Search
                </button>
              </div>
              <ul className="mb-matches">
                {matches.map((match) => (
                  <li key={match.mbid}>
                    <button
                      type="button"
                      onClick={() => void addArtist(match)}
                      disabled={busy}
                    >
                      <strong>{match.name}</strong>
                      {match.disambiguation && (
                        <span className="muted">
                          {" "}
                          — {match.disambiguation}
                        </span>
                      )}
                      {match.type && <span className="badge">{match.type}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="muted">
                Search the catalog and add one or more artists to the removal
                list. Artists with a local Music folder remain protected.
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
        {error && <p className="error manage-artists-modal__error">{error}</p>}

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
