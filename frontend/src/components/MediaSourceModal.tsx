import { useEffect, useState } from "react";
import {
  createMediaLibrary,
  fetchAppSettings,
  pickCreateLibrary,
  pickMediaRoot,
  setMediaRoot,
} from "../api";

type Props = {
  required?: boolean;
  canConfigure?: boolean;
  title?: string;
  onDone: (path: string) => void;
  onClose?: () => void;
  onSwitchProfile?: () => void;
  /** When true, open directly on the create-library panel. */
  initialMode?: "choose" | "create";
};

export default function MediaSourceModal({
  required = false,
  canConfigure = true,
  title,
  onDone,
  onClose,
  onSwitchProfile,
  initialMode = "choose",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState("");
  const [mode, setMode] = useState<"choose" | "create">(initialMode);
  const [suggestedParent, setSuggestedParent] = useState("");

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    let cancelled = false;
    void fetchAppSettings()
      .then((s) => {
        if (!cancelled) {
          setSuggestedParent(s.suggested_library_parent || "");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const heading =
    title ??
    (required
      ? "Welcome to MyStack"
      : mode === "create"
        ? "Create media library"
        : "Choose source folder");

  async function handlePickExisting() {
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

  async function handleManualExisting() {
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

  async function handlePickCreate() {
    setError(null);
    setBusy(true);
    try {
      const res = await pickCreateLibrary();
      onDone(res.media_root);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateAtParent(parent: string) {
    const path = parent.trim();
    if (!path) return;
    setError(null);
    setBusy(true);
    try {
      const res = await createMediaLibrary(path);
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
        ) : mode === "create" ? (
          <>
            <p className="muted">
              Pick a parent folder. MyStack creates <code>Media</code> and the
              module folders inside it.
            </p>
            {suggestedParent ? (
              <button
                type="button"
                className="btn btn--primary welcome-pick-btn"
                onClick={() => void handleCreateAtParent(suggestedParent)}
                disabled={busy}
              >
                {busy
                  ? "Creating…"
                  : `Create in Documents (${suggestedParent})`}
              </button>
            ) : null}
            <button
              type="button"
              className={`btn welcome-pick-btn${suggestedParent ? "" : " btn--primary"}`}
              onClick={() => void handlePickCreate()}
              disabled={busy}
            >
              {busy ? "Waiting for folder…" : "Browse for parent folder…"}
            </button>
            <p className="muted welcome-or">or paste a parent path</p>
            <div className="modal-search-row">
              <input
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder={suggestedParent || "C:\\Users\\you\\Documents"}
                disabled={busy}
                onKeyDown={(e) =>
                  e.key === "Enter" && void handleCreateAtParent(manualPath)
                }
              />
              <button
                type="button"
                className="btn"
                onClick={() => void handleCreateAtParent(manualPath)}
                disabled={busy || !manualPath.trim()}
              >
                Create
              </button>
            </div>
            <button
              type="button"
              className="btn welcome-secondary-btn"
              onClick={() => {
                setError(null);
                setManualPath("");
                setMode("choose");
              }}
              disabled={busy}
            >
              Use an existing library instead
            </button>
          </>
        ) : (
          <>
            {required ? (
              <p className="muted">
                Choose an existing library, or create a new one.
              </p>
            ) : (
              <p className="muted">Point MyStack at your media library folder.</p>
            )}
            <button
              type="button"
              className="btn btn--primary welcome-pick-btn"
              onClick={() => void handlePickExisting()}
              disabled={busy}
            >
              {busy ? "Waiting for folder…" : "Browse existing…"}
            </button>
            <button
              type="button"
              className="btn welcome-pick-btn"
              onClick={() => {
                setError(null);
                setManualPath("");
                setMode("create");
              }}
              disabled={busy}
            >
              Create new library
            </button>
            <p className="muted welcome-or">or paste an existing Media path</p>
            <div className="modal-search-row">
              <input
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder="C:\Media"
                disabled={busy}
                onKeyDown={(e) => e.key === "Enter" && void handleManualExisting()}
              />
              <button
                type="button"
                className="btn"
                onClick={() => void handleManualExisting()}
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
