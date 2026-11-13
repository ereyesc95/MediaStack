import { useState } from "react";
import {
  patchUniverse,
  pullUniverseTmdbPortrait,
  uploadUniverseArt,
} from "../api";
import { withMediaAccess } from "../mediaFileUrl";
import type { Universe } from "../types";
import ArtPickSquare from "./ArtPickSquare";
import ModalPortal from "./ModalPortal";

type Props = {
  universe: Universe;
  onClose: () => void;
  onSaved: (next: Universe) => void;
};

const ART_KINDS = ["Portrait", "Landscape", "Banner", "Logo"] as const;

function artUrl(
  u: Universe,
  kind: (typeof ART_KINDS)[number]
): string | null {
  const url =
    kind === "Portrait"
      ? u.portrait_url || u.cover_url
      : kind === "Landscape"
        ? u.landscape_url
        : kind === "Banner"
          ? u.banner_url
          : u.logo_url;
  return url ? withMediaAccess(url) : null;
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
          <div
            className="add-universe-modal__art-row"
            role="group"
            aria-label="Universe artwork"
          >
            {ART_KINDS.map((kind) => (
              <ArtPickSquare
                key={kind}
                label={kind.toLowerCase()}
                previewUrl={artUrl(current, kind)}
                file={artFiles[kind] ?? null}
                disabled={busy}
                onPick={(file) =>
                  setArtFiles((prev) => ({
                    ...prev,
                    [kind]: file,
                  }))
                }
              />
            ))}
          </div>
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
