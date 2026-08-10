import { useState } from "react";
import {
  patchUniverse,
  pullUniverseTmdbPortrait,
  uploadUniverseArt,
} from "../api";
import type { Universe } from "../types";
import ModalPortal from "./ModalPortal";

type Props = {
  universe: Universe;
  onClose: () => void;
  onSaved: (next: Universe) => void;
};

const ART_KINDS = ["Portrait", "Landscape", "Banner", "Logo"] as const;

function artHint(u: Universe, kind: (typeof ART_KINDS)[number]) {
  const url =
    kind === "Portrait"
      ? u.portrait_url || u.cover_url
      : kind === "Landscape"
        ? u.landscape_url
        : kind === "Banner"
          ? u.banner_url
          : u.logo_url;
  return url
    ? `Current ${kind.toLowerCase()} on file — choose to replace`
    : "Choose image…";
}

export default function UniverseAboutEditModal({
  universe,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState(universe.name || "");
  const [overview, setOverview] = useState(universe.overview || "");
  const [artFiles, setArtFiles] = useState<
    Partial<Record<(typeof ART_KINDS)[number], File | null>>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(universe);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let next = await patchUniverse(universe.id, {
        name: trimmed,
        overview: overview.trim() || null,
      });
      for (const kind of ART_KINDS) {
        const file = artFiles[kind];
        if (file) {
          next = await uploadUniverseArt(universe.id, kind, file);
        }
      }
      setCurrent(next);
      onSaved(next);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function fetchPortrait() {
    setBusy(true);
    setError(null);
    try {
      const next = await pullUniverseTmdbPortrait(universe.id);
      setCurrent(next);
      onSaved(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-admin-modal add-universe-modal"
        role="dialog"
        aria-modal
        aria-labelledby="universe-about-edit-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3 id="universe-about-edit-title">Update universe</h3>
          <button
            type="button"
            className="modal-close-x"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="artist-admin-form">
          <label className="artist-admin-form__inline">
            <span className="artist-admin-form__inline-label">Name</span>
            <input
              className="artist-admin-form__inline-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </label>
          <label className="artist-admin-form__inline artist-admin-form__inline--top">
            <span className="artist-admin-form__inline-label">Overview</span>
            <textarea
              className="artist-admin-form__inline-field"
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              rows={6}
              disabled={busy}
              placeholder="Optional"
            />
          </label>
          {ART_KINDS.map((kind) => (
            <label key={kind} className="artist-admin-form__inline">
              <span className="artist-admin-form__inline-label">{kind}</span>
              <span className="artist-admin-form__inline-field add-universe-modal__file">
                <span className="add-universe-modal__file-label">
                  {artFiles[kind]?.name || artHint(current, kind)}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="add-universe-modal__file-input"
                  disabled={busy}
                  onChange={(e) =>
                    setArtFiles((prev) => ({
                      ...prev,
                      [kind]: e.target.files?.[0] ?? null,
                    }))
                  }
                />
              </span>
            </label>
          ))}
          {error ? <p className="error">{error}</p> : null}
        </div>
        <div className="modal-panel-actions modal-panel-actions--end add-universe-modal__actions">
          <button
            type="button"
            className="btn btn--small"
            disabled={busy}
            onClick={() => void fetchPortrait()}
          >
            Fetch portrait
          </button>
          <button
            type="button"
            className="btn btn--small btn--primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
