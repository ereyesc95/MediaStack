import { useEffect, useMemo, useState } from "react";
import { fetchFilterOptions, patchReleaseOverview } from "../../../api";
import type { ReleaseOverview } from "../../../types";
import ModalPortal from "../../ModalPortal";
import SearchableDropdown, {
  type DropdownOption,
} from "../../SearchableDropdown";

type GenreChip = { id: string; name: string };

type Props = {
  bandId: number;
  releaseId: string;
  data: ReleaseOverview;
  onClose: () => void;
  onSaved: () => void;
};

export default function ReleaseAboutEditModal({
  bandId,
  releaseId,
  data,
  onClose,
  onSaved,
}: Props) {
  const [description, setDescription] = useState(data.description ?? "");
  const [producer, setProducer] = useState(data.producer ?? "");
  const [label, setLabel] = useState(data.label ?? "");
  const [genres, setGenres] = useState<GenreChip[]>(() =>
    data.subgenres.map((s) => ({ id: String(s.id), name: s.name }))
  );
  const [genreOptions, setGenreOptions] = useState<DropdownOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFilterOptions()
      .then((opts) => {
        if (cancelled) return;
        const groups = opts.all_subgenre_groups?.length
          ? opts.all_subgenre_groups
          : opts.subgenre_groups;
        setGenreOptions(
          (groups || []).flatMap((g) =>
            g.items
              .filter((s) => s.name)
              .map((s) => ({
                value: String(s.id),
                label: s.name,
                group: g.genre,
              }))
          )
        );
      })
      .catch(() => {
        if (!cancelled) setGenreOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const availableGenres = useMemo(
    () =>
      genreOptions.filter(
        (o) =>
          !genres.some(
            (g) =>
              g.id === o.value ||
              g.name.toLowerCase() === o.label.toLowerCase()
          )
      ),
    [genreOptions, genres]
  );

  function addGenre(value: string) {
    const opt = genreOptions.find((o) => o.value === value);
    if (!opt) return;
    setGenres((prev) =>
      prev.some((g) => g.id === opt.value || g.name === opt.label)
        ? prev
        : [...prev, { id: opt.value, name: opt.label }]
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await patchReleaseOverview(bandId, releaseId, {
        description,
        producer,
        label,
        subgenres: genres.map((g) => g.name.trim()).filter(Boolean),
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="artist-word-cloud-modal__panel release-about-edit-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="artist-word-cloud-modal__head">
          <h3>About</h3>
          <button
            type="button"
            className="artist-word-cloud-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {error && <p className="error">{error}</p>}

        <div className="artist-admin-form release-about-edit-modal__form">
          <label className="release-about-edit-modal__field--description">
            Description
            <textarea
              className="release-about-edit-modal__textarea ms-scrollbar"
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="artist-admin-form__inline release-about-edit-modal__genres">
            <span className="artist-admin-form__inline-label">Genres</span>
            <div className="release-about-edit-modal__genre-body">
              {genres.length > 0 && (
                <div className="release-about-edit-modal__chips ms-scrollbar">
                  {genres.map((g) => (
                    <span key={g.id} className="series-about-edit__chip">
                      {g.name}
                      <button
                        type="button"
                        className="series-about-edit__chip-x"
                        aria-label={`Remove ${g.name}`}
                        disabled={saving}
                        onClick={() =>
                          setGenres((prev) =>
                            prev.filter((x) => x.id !== g.id)
                          )
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <SearchableDropdown
                key={genres.map((g) => g.id).join("|")}
                options={availableGenres}
                value=""
                onChange={addGenre}
                placeholder="Add genre…"
                visibleRows={8}
                portal
              />
            </div>
          </div>
          <label className="artist-admin-form__inline">
            <span className="artist-admin-form__inline-label">Producer</span>
            <input
              className="artist-admin-form__inline-field"
              type="text"
              value={producer}
              onChange={(e) => setProducer(e.target.value)}
            />
          </label>
          <label className="artist-admin-form__inline">
            <span className="artist-admin-form__inline-label">Label</span>
            <input
              className="artist-admin-form__inline-field"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
        </div>

        <div className="modal-actions-row">
          <button
            type="button"
            className="btn"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
