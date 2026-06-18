import { useState } from "react";
import { patchReleaseOverview } from "../../../api";
import type { ReleaseOverview } from "../../../types";
import ModalPortal from "../../ModalPortal";

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
  const [subgenres, setSubgenres] = useState(
    data.subgenres.map((s) => s.name).join("; ")
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await patchReleaseOverview(bandId, releaseId, {
        description,
        producer,
        label,
        subgenres: subgenres
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean),
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
          <label>
            Description
            <textarea
              className="release-about-edit-modal__textarea ms-scrollbar"
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Subgenres (semicolon-separated)
            <input
              type="text"
              value={subgenres}
              onChange={(e) => setSubgenres(e.target.value)}
            />
          </label>
          <label>
            Producer
            <input
              type="text"
              value={producer}
              onChange={(e) => setProducer(e.target.value)}
            />
          </label>
          <label>
            Label
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
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
