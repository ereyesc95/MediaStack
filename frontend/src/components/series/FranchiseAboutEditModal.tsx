import { useState } from "react";
import {
  patchBooksWorkAbout,
  patchMoviesWorkAbout,
  patchSeriesAbout,
} from "../../api";
import type { SeriesOverview } from "../../types";
import ModalPortal from "../ModalPortal";

type Props = {
  module: "series" | "movies" | "books";
  franchiseId: string;
  data: SeriesOverview;
  onClose: () => void;
  onSaved: () => void;
};

function asWriterList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((w) => String(w).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(";")
      .map((w) => w.trim())
      .filter(Boolean);
  }
  return [];
}

export default function FranchiseAboutEditModal({
  module,
  franchiseId,
  data,
  onClose,
  onSaved,
}: Props) {
  const writersSeed = asWriterList(
    (data as { authors?: unknown }).authors ?? data.writers
  );
  const [bio, setBio] = useState(data.bio || "");
  const [authors, setAuthors] = useState(writersSeed.join("; "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (module === "movies") {
        await patchMoviesWorkAbout(franchiseId, {
          bio,
          writers: authors,
        });
      } else if (module === "books") {
        await patchBooksWorkAbout(franchiseId, {
          bio,
          writers: authors,
        });
      } else {
        await patchSeriesAbout(franchiseId, {
          bio,
          writers: authors,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-admin-modal franchise-about-edit-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>Update franchise</h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="artist-admin-form">
          <label>
            Description / bio
            <textarea
              rows={8}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </label>
          <label>
            Authors (semicolon-separated)
            <input
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
            />
          </label>
        </div>
        <div className="modal-panel-actions modal-panel-actions--end">
          <button
            type="button"
            className="btn btn--primary franchise-about-edit-modal__save"
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
