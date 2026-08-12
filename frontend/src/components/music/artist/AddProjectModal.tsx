import { useEffect, useMemo, useState } from "react";
import { addBandProject, searchMusicBrainz } from "../../../api";
import type { MbArtistMatch } from "../../../types";
import ModalPortal from "../../ModalPortal";

type MemberOption = {
  id: number;
  name: string;
};

type Props = {
  bandId: number;
  members: MemberOption[];
  onClose: () => void;
  onSaved: () => void;
};

export default function AddProjectModal({
  bandId,
  members,
  onClose,
  onSaved,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MbArtistMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MbArtistMatch | null>(null);
  const [pickedMembers, setPickedMembers] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [members]
  );

  useEffect(() => {
    if (selected || query.trim().length < 2) {
      if (!selected) setResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      setSearching(true);
      searchMusicBrainz(query.trim())
        .then((d) => setResults(d.items))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => window.clearTimeout(t);
  }, [query, selected]);

  function toggleMember(id: number) {
    setPickedMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function save() {
    if (!selected || pickedMembers.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await addBandProject(bandId, {
        name: selected.name,
        mbid: selected.mbid,
        member_artist_ids: pickedMembers,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-admin-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>Add project</h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="artist-admin-form">
          {!selected ? (
            <label>
              Search MusicBrainz project
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Band or project name…"
                autoFocus
              />
            </label>
          ) : (
            <p className="muted">
              Project: <strong>{selected.name}</strong>{" "}
              <button
                type="button"
                className="btn btn--small"
                onClick={() => {
                  setSelected(null);
                  setQuery("");
                }}
              >
                Change
              </button>
            </p>
          )}

          {searching && <p className="muted">Searching…</p>}

          {!selected && results.length > 0 && (
            <ul className="add-similar-results">
              {results.map((item) => (
                <li key={item.mbid || item.name}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(item);
                      setResults([]);
                    }}
                  >
                    {item.name}
                    {item.disambiguation ? (
                      <span className="muted"> — {item.disambiguation}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected ? (
            <>
              <span className="series-about-edit__label">
                Via members of this band
              </span>
              {sortedMembers.length === 0 ? (
                <p className="muted">No lineup members to select.</p>
              ) : (
                <div className="artist-admin-form__checks">
                  {sortedMembers.map((m) => (
                    <label key={m.id}>
                      <input
                        type="checkbox"
                        checked={pickedMembers.includes(m.id)}
                        onChange={() => toggleMember(m.id)}
                      />
                      {m.name}
                    </label>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="modal-panel-actions modal-panel-actions--end">
          <button
            type="button"
            className="btn btn--primary"
            disabled={
              saving || !selected || pickedMembers.length === 0
            }
            onClick={() => void save()}
          >
            {saving ? "Adding…" : "Add project"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
