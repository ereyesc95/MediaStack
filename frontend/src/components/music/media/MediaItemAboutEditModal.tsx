import { useState } from "react";
import { patchMediaItemOverview } from "../../../api";
import type { MediaItemOverview } from "../../../types";
import ModalPortal from "../../ModalPortal";

type Props = {
  bandId: number;
  kind: "video" | "library";
  itemId: string;
  data: MediaItemOverview;
  onClose: () => void;
  onSaved: (data: MediaItemOverview) => void;
};

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
  const [genres, setGenres] = useState((data.genres ?? []).join("; "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await patchMediaItemOverview(bandId, kind, itemId, {
        description,
        director: kind === "video" ? director : null,
        author: kind === "library" ? author : null,
        publisher,
        genres: genres
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean),
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
              />
            </label>
          ) : (
            <label>
              Author
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </label>
          )}
          <label>
            Publisher
            <input
              type="text"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
            />
          </label>
          <label>
            Genres (semicolon-separated)
            <input
              type="text"
              value={genres}
              onChange={(e) => setGenres(e.target.value)}
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
