import { useEffect, useState } from "react";
import { fetchMediaGenres, patchMediaItemOverview } from "../../../api";
import type { MediaItemOverview } from "../../../types";
import ModalPortal from "../../ModalPortal";
import GenreTagsInput from "./GenreTagsInput";

type Props = {
  bandId: number;
  kind: "video" | "library";
  itemId: string;
  data: MediaItemOverview;
  onClose: () => void;
  onSaved: (data: MediaItemOverview) => void;
};

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export default function MediaItemAboutEditModal({
  bandId,
  kind,
  itemId,
  data,
  onClose,
  onSaved,
}: Props) {
  const [description, setDescription] = useState(data.description ?? "");
  const [director, setDirector] = useState(data.director ?? "");
  const [author, setAuthor] = useState(data.author ?? "");
  const [publisher, setPublisher] = useState(data.publisher ?? "");
  const [genres, setGenres] = useState<string[]>(data.genres ?? []);
  const [genreOptions, setGenreOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMediaGenres(kind)
      .then((res) => {
        if (!cancelled) {
          setGenreOptions(res.genres.map((g) => g.name).filter(Boolean));
        }
      })
      .catch(() => {
        if (!cancelled) setGenreOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await patchMediaItemOverview(bandId, kind, itemId, {
        description,
        director: kind === "video" ? titleCaseWords(director.trim()) : null,
        author: kind === "library" ? titleCaseWords(author.trim()) : null,
        publisher: titleCaseWords(publisher.trim()),
        genres,
      });
      onSaved(updated);
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
          <h3>Edit Release</h3>
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
          <label>
            Description
            <textarea
              className="release-about-edit-modal__textarea ms-scrollbar"
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {kind === "video" ? (
            <label>
              Director
              <input
                type="text"
                value={director}
                onChange={(e) => setDirector(e.target.value)}
                onBlur={() => setDirector(titleCaseWords(director.trim()))}
              />
            </label>
          ) : (
            <label>
              Author
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                onBlur={() => setAuthor(titleCaseWords(author.trim()))}
              />
            </label>
          )}
          <label>
            Publisher
            <input
              type="text"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              onBlur={() => setPublisher(titleCaseWords(publisher.trim()))}
            />
          </label>
          <GenreTagsInput
            label="Genres"
            options={genreOptions}
            value={genres}
            onChange={setGenres}
            disabled={saving}
          />
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
