import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminSecurity,
  renameGuestProfile,
  saveAdminPasswords,
  saveAppUrls,
  type AdminSecurityPayload,
} from "../api";
import ModalPortal, { useModalClose } from "./ModalPortal";

type Props = {
  onClose: () => void;
};

export default function AdminAppSettingsModal({ onClose }: Props) {
  return (
    <ModalPortal onClose={onClose} layer={2}>
      <AdminAppSettingsPanel onClose={onClose} />
    </ModalPortal>
  );
}

function AdminAppSettingsPanel({ onClose }: Props) {
  const requestClose = useModalClose(onClose);
  const [data, setData] = useState<AdminSecurityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [adminPw, setAdminPw] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [mediaServerUrl, setMediaServerUrl] = useState("");
  const [guestNames, setGuestNames] = useState<Record<number, string>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminSecurity();
      setData(res);
      setPublicUrl(res.public_url || "");
      setMediaServerUrl(res.media_server_url || "");
      const names: Record<number, string> = {};
      for (const p of res.profiles) {
        if (!p.is_admin) names[p.user_id] = p.username;
      }
      setGuestNames(names);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleSavePasswords() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (!adminPw.trim()) {
        setError("Enter a new password to save.");
        return;
      }
      await saveAdminPasswords({ admin_password: adminPw.trim() });
      setAdminPw("");
      setStatus("Password updated.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveUrls() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await saveAppUrls({
        public_url: publicUrl,
        media_server_url: mediaServerUrl,
      });
      setStatus("App URLs saved.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRenameGuest(userId: number) {
    const name = (guestNames[userId] || "").trim();
    if (!name) {
      setError("Guest name cannot be empty.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await renameGuestProfile(userId, name);
      setStatus("Profile name updated.");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-panel modal-panel--admin-app"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="modal-panel-header">
        <h3>Profiles and URLs</h3>
        <button
          type="button"
          className="modal-close-x"
          aria-label="Close"
          onClick={() => requestClose()}
        >
          ×
        </button>
      </div>

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="error-inline">{error}</p> : null}
      {status ? <p className="muted admin-app__status">{status}</p> : null}

      <section className="admin-app__section">
        <h4>Profiles</h4>
        <p className="muted">Rename guest profiles. Admin name stays fixed.</p>
        <ul className="admin-app__profiles">
          {(data?.profiles || []).map((p) => (
            <li key={p.user_id} className="admin-app__profile-row">
              {p.is_admin ? (
                <>
                  <strong>{p.username}</strong>
                  <span className="muted">Admin</span>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={guestNames[p.user_id] ?? p.username}
                    onChange={(e) =>
                      setGuestNames((prev) => ({
                        ...prev,
                        [p.user_id]: e.target.value,
                      }))
                    }
                    disabled={busy}
                    maxLength={40}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void handleRenameGuest(p.user_id)}
                  >
                    Save name
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-app__section">
        <h4>Admin password</h4>
        <p className="muted">
          {data?.admin_password_custom
            ? "A custom password is set."
            : "Using the default password."}
        </p>
        <label className="admin-app__field">
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={adminPw}
            onChange={(e) => setAdminPw(e.target.value)}
            disabled={busy}
            placeholder="New admin password"
          />
        </label>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void handleSavePasswords()}
          disabled={busy}
        >
          Save password
        </button>
      </section>

      <section className="admin-app__section">
        <h4>App URLs</h4>
        <p className="muted">Used for remote access and streaming.</p>
        <label className="admin-app__field">
          <span>Public URL</span>
          <input
            type="url"
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
            disabled={busy}
            placeholder="https://mystack.example.com"
          />
        </label>
        <label className="admin-app__field">
          <span>Media server URL</span>
          <input
            type="url"
            value={mediaServerUrl}
            onChange={(e) => setMediaServerUrl(e.target.value)}
            disabled={busy}
            placeholder="http://127.0.0.1:8887"
          />
        </label>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void handleSaveUrls()}
          disabled={busy}
        >
          Save URLs
        </button>
      </section>
    </div>
  );
}
