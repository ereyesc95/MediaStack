import { useCallback, useEffect, useState } from "react";
import {
  clearApiCredential,
  fetchApiCredentials,
  saveApiCredential,
  type ApiCredentialService,
} from "../api";
import ModalPortal, { useModalClose } from "./ModalPortal";

type Props = {
  onClose: () => void;
};

export default function ApiCredentialsModal({ onClose }: Props) {
  return (
    <ModalPortal onClose={onClose} layer={2}>
      <ApiCredentialsPanel onClose={onClose} />
    </ModalPortal>
  );
}

function fieldLabel(field: string, serviceId: string): string {
  if (field === "user_agent") return "User-Agent";
  if (field === "secret") {
    return serviceId === "spotify" || serviceId === "igdb"
      ? "Client Secret"
      : "Secret";
  }
  if (serviceId === "spotify" || serviceId === "igdb") return "Client ID";
  return "API key";
}

function ApiCredentialsPanel({ onClose }: Props) {
  const requestClose = useModalClose(onClose);
  const [services, setServices] = useState<ApiCredentialService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyVal, setKeyVal] = useState("");
  const [secretVal, setSecretVal] = useState("");
  const [uaVal, setUaVal] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApiCredentials();
      setServices(res.services || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function startEdit(svc: ApiCredentialService) {
    setEditingId(svc.id);
    setKeyVal("");
    setSecretVal("");
    setUaVal(
      svc.fields.includes("user_agent")
        ? String(svc.hints.user_agent || "")
        : ""
    );
    setError(null);
  }

  async function handleSave(svc: ApiCredentialService) {
    setBusyId(svc.id);
    setError(null);
    try {
      const body: { key?: string; secret?: string; user_agent?: string } = {};
      if (svc.fields.includes("key")) body.key = keyVal;
      if (svc.fields.includes("secret")) body.secret = secretVal;
      if (svc.fields.includes("user_agent")) body.user_agent = uaVal;
      const res = await saveApiCredential(svc.id, body);
      setServices((prev) =>
        prev.map((s) => (s.id === svc.id ? res.service : s))
      );
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleClear(svc: ApiCredentialService) {
    if (
      !window.confirm(
        `Remove saved ${svc.name} credentials from MyStack? Env overrides (if any) stay in effect.`
      )
    ) {
      return;
    }
    setBusyId(svc.id);
    setError(null);
    try {
      const res = await clearApiCredential(svc.id);
      setServices((prev) =>
        prev.map((s) => (s.id === svc.id ? res.service : s))
      );
      if (editingId === svc.id) setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="modal-panel modal-panel--api-creds"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="modal-panel-header">
        <h3>API credentials</h3>
        <button
          type="button"
          className="modal-close-x"
          aria-label="Close"
          onClick={() => requestClose()}
        >
          ×
        </button>
      </div>
      <p className="muted api-creds__lead">
        Keys for enrichment and imports. Secrets stay masked.
      </p>
      {loading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="error-inline">{error}</p> : null}
      <ul className="api-creds__list">
        {services.map((svc) => {
          const editing = editingId === svc.id;
          const busy = busyId === svc.id;
          return (
            <li key={svc.id} className="api-creds__item">
              <div className="api-creds__head">
                <div>
                  <strong>{svc.name}</strong>
                  <span
                    className={`api-creds__badge${
                      svc.configured ? " is-ok" : ""
                    }`}
                  >
                    {svc.configured
                      ? `Configured (${svc.source})`
                      : "Not configured"}
                  </span>
                  <p className="muted api-creds__desc">{svc.description}</p>
                  {svc.doc_url ? (
                    <a
                      href={svc.doc_url}
                      target="_blank"
                      rel="noreferrer"
                      className="api-creds__doc"
                    >
                      Provider docs
                    </a>
                  ) : null}
                </div>
                <div className="api-creds__actions">
                  {!editing ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => startEdit(svc)}
                      disabled={busy}
                    >
                      {svc.configured ? "Replace…" : "Add…"}
                    </button>
                  ) : null}
                  {svc.configured && svc.source !== "env" ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void handleClear(svc)}
                      disabled={busy}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
              {!editing && svc.configured ? (
                <div className="api-creds__hints muted">
                  {svc.fields.map((f) => (
                    <span key={f}>
                      {fieldLabel(f, svc.id)}: {svc.hints[f] || "—"}
                    </span>
                  ))}
                </div>
              ) : null}
              {editing ? (
                <div className="api-creds__form">
                  {svc.fields.includes("key") ? (
                    <label className="api-creds__field">
                      <span>{fieldLabel("key", svc.id)}</span>
                      <input
                        type="text"
                        autoComplete="off"
                        value={keyVal}
                        onChange={(e) => setKeyVal(e.target.value)}
                        disabled={busy}
                        placeholder={svc.hints.key || ""}
                      />
                    </label>
                  ) : null}
                  {svc.fields.includes("secret") ? (
                    <label className="api-creds__field">
                      <span>{fieldLabel("secret", svc.id)}</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={secretVal}
                        onChange={(e) => setSecretVal(e.target.value)}
                        disabled={busy}
                      />
                    </label>
                  ) : null}
                  {svc.fields.includes("user_agent") ? (
                    <label className="api-creds__field">
                      <span>User-Agent</span>
                      <input
                        type="text"
                        value={uaVal}
                        onChange={(e) => setUaVal(e.target.value)}
                        disabled={busy}
                        placeholder="MyStack/1.0 (contact@example.com)"
                      />
                    </label>
                  ) : null}
                  <div className="api-creds__form-actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => void handleSave(svc)}
                      disabled={busy}
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setEditingId(null)}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
