import { useState } from "react";
import { pickMediaRoot, setMediaRoot } from "../api";

type Props = {
  required?: boolean;
  canConfigure?: boolean;
  title?: string;
  onDone: (path: string) => void;
  onClose?: () => void;
  onSwitchProfile?: () => void;
};

export default function MediaSourceModal({
  required = false,
  canConfigure = true,
  title,
  onDone,
  onClose,
  onSwitchProfile,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState("");

  const heading = title ?? (required ? "Welcome to MediaStack" : "Choose source folder");

  async function handlePick() {
    setError(null);
    setBusy(true);
    try {
      const res = await pickMediaRoot();
      onDone(res.media_root);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleManual() {
    const path = manualPath.trim();
    if (!path) return;
    setError(null);
    setBusy(true);
    try {
      const res = await setMediaRoot(path);
      onDone(res.media_root);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={required ? undefined : onClose}
    >
      <div className="modal-panel modal-panel--welcome" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel-header">
          <h3>{heading}</h3>
          {!required && onClose && (
            <button
              type="button"
              className="modal-close-x"
              aria-label="Close"
              onClick={onClose}
              disabled={busy}
            >
              ×
            </button>
          )}
        </div>
        {!canConfigure ? (
          <>
            <p className="muted">
              The media library has not been configured yet. Switch to the{" "}
              <strong>Admin</strong> profile and use Setup → Choose source.
            </p>
            {onSwitchProfile && (
              <button
                type="button"
                className="btn btn--primary welcome-pick-btn"
                onClick={onSwitchProfile}
              >
                Switch profile
              </button>
            )}
          </>
        ) : (
          <>
            {required ? (
              <p className="muted">
                Choose the folder that contains your media library (e.g. a folder with{" "}
                <strong>Music</strong>, <strong>Series</strong>, and other modules inside).
              </p>
            ) : (
              <p className="muted">
                Select a new source folder for your media library. Gallery images, audio
                paths, and folder sync all use this location.
              </p>
            )}
            <button
              type="button"
              className="btn btn--primary welcome-pick-btn"
              onClick={handlePick}
              disabled={busy}
            >
              {busy ? "Waiting for folder…" : "Browse…"}
            </button>
            <p className="muted welcome-or">or paste a path</p>
            <div className="modal-search-row">
              <input
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder="C:\Media"
                disabled={busy}
                onKeyDown={(e) => e.key === "Enter" && handleManual()}
              />
              <button
                type="button"
                className="btn"
                onClick={handleManual}
                disabled={busy || !manualPath.trim()}
              >
                Use path
              </button>
            </div>
          </>
        )}
        {error && <p className="error-inline">{error}</p>}
      </div>
    </div>
  );
}
