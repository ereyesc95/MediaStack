import { useCallback, useEffect, useState } from "react";
import {
  exportApiCredentials,
  fetchApiCredentials,
  saveApiCredential,
  type ApiCredentialService,
} from "../api";
import {
  IconCheck,
  IconDoc,
  IconDownload,
  IconEye,
  IconEyeOff,
} from "./MenuIcons";
import ModalPortal, { useModalClose } from "./ModalPortal";

type Props = {
  onClose: () => void;
};

type Draft = {
  key: string;
  secret: string;
  user_agent: string;
};

const EMPTY_DRAFT: Draft = { key: "", secret: "", user_agent: "" };

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

function fieldPlaceholder(
  field: keyof Draft,
  svc: ApiCredentialService
): string {
  const hint = (svc.hints[field] || "").trim();
  if (hint) return hint;
  if (field === "user_agent") return "MyStack/1.0 (contact@example.com)";
  return "";
}

function ApiCredentialsPanel({ onClose }: Props) {
  const requestClose = useModalClose(onClose);
  const [services, setServices] = useState<ApiCredentialService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [revealSecret, setRevealSecret] = useState<Record<string, boolean>>(
    {}
  );

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

  function draftFor(id: string): Draft {
    return drafts[id] ?? EMPTY_DRAFT;
  }

  function setField(id: string, field: keyof Draft, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? EMPTY_DRAFT), [field]: value },
    }));
  }

  function clearField(id: string, field: keyof Draft) {
    setDrafts((prev) => {
      const next = { ...(prev[id] ?? EMPTY_DRAFT), [field]: "" };
      if (!next.key && !next.secret && !next.user_agent) {
        const rest = { ...prev };
        delete rest[id];
        return rest;
      }
      return { ...prev, [id]: next };
    });
  }

  function fieldDirty(id: string, field: keyof Draft): boolean {
    return Boolean(draftFor(id)[field].trim());
  }

  async function handleExport() {
    setExportBusy(true);
    setError(null);
    try {
      const res = await exportApiCredentials();
      const blob = new Blob([res.text || ""], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename || "mystack-api-credentials.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportBusy(false);
    }
  }

  async function handleSave(svc: ApiCredentialService, field: keyof Draft) {
    const draft = draftFor(svc.id);
    const value = draft[field].trim();
    if (!value) return;

    const needsPair =
      svc.fields.includes("key") && svc.fields.includes("secret");
    if (needsPair && (!draft.key.trim() || !draft.secret.trim())) {
      setError(`${svc.name} needs both Client ID and Client Secret to save.`);
      return;
    }

    setBusyId(svc.id);
    setError(null);
    try {
      const body: { key?: string; secret?: string; user_agent?: string } = {};
      if (svc.fields.includes("key")) body.key = draft.key.trim() || value;
      if (svc.fields.includes("secret")) {
        body.secret = draft.secret.trim() || undefined;
      }
      if (svc.fields.includes("user_agent")) {
        body.user_agent = draft.user_agent.trim() || value;
      }
      if (svc.fields.length === 1) {
        if (field === "key") body.key = value;
        if (field === "secret") body.secret = value;
        if (field === "user_agent") body.user_agent = value;
      }
      const res = await saveApiCredential(svc.id, body);
      setServices((prev) =>
        prev.map((s) => (s.id === svc.id ? res.service : s))
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[svc.id];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  function renderRow(
    svc: ApiCredentialService,
    field: keyof Draft,
    opts?: { password?: boolean }
  ) {
    const busy = busyId === svc.id;
    const draft = draftFor(svc.id);
    const inputId = `api-cred-${svc.id}-${field}`;
    const revealed = Boolean(revealSecret[svc.id]);
    const isPassword = Boolean(opts?.password);

    return (
      <div className="api-creds__row" key={field}>
        <label className="api-creds__label" htmlFor={inputId}>
          {fieldLabel(field, svc.id)}
        </label>
        <div className="api-creds__input-wrap">
          <input
            id={inputId}
            type={isPassword && !revealed ? "password" : "text"}
            autoComplete={isPassword ? "new-password" : "off"}
            value={draft[field]}
            onChange={(e) => setField(svc.id, field, e.target.value)}
            disabled={busy}
            placeholder={fieldPlaceholder(field, svc)}
          />
          {isPassword ? (
            <button
              type="button"
              className="api-creds__reveal"
              aria-label={revealed ? "Hide value" : "Show value"}
              title={revealed ? "Hide" : "Show"}
              disabled={busy}
              onClick={() =>
                setRevealSecret((prev) => ({
                  ...prev,
                  [svc.id]: !prev[svc.id],
                }))
              }
            >
              {revealed ? <IconEyeOff /> : <IconEye />}
            </button>
          ) : null}
        </div>
        <div className="api-creds__row-actions">
          <button
            type="button"
            className="api-creds__icon-btn"
            aria-label={`Save ${svc.name} ${fieldLabel(field, svc.id)}`}
            title="Save"
            disabled={busy || !fieldDirty(svc.id, field)}
            onClick={() => void handleSave(svc, field)}
          >
            <IconCheck />
          </button>
          <button
            type="button"
            className="api-creds__icon-btn"
            aria-label="Clear"
            title="Clear"
            disabled={busy || !fieldDirty(svc.id, field)}
            onClick={() => clearField(svc.id, field)}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="modal-panel modal-panel--api-creds"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="modal-panel-header">
        <h3>API credentials</h3>
        <div className="api-creds__header-actions">
          <button
            type="button"
            className="api-creds__icon-btn api-creds__export-btn"
            aria-label="Export credentials"
            title="Export"
            disabled={exportBusy || loading}
            onClick={() => void handleExport()}
          >
            <IconDownload />
          </button>
          <button
            type="button"
            className="modal-close-x"
            aria-label="Close"
            onClick={() => requestClose()}
          >
            ×
          </button>
        </div>
      </div>
      <p className="muted api-creds__lead">
        Keys for enrichment and imports. Secrets stay masked.
      </p>
      {loading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="error-inline">{error}</p> : null}
      <div className="api-creds__scroll">
        <ul className="api-creds__list">
          {services.map((svc) => (
            <li key={svc.id} className="api-creds__item">
              <div className="api-creds__head">
                <div className="api-creds__title-row">
                  <strong>{svc.name}</strong>
                  {svc.description ? (
                    <span className="api-creds__desc">{svc.description}</span>
                  ) : null}
                </div>
                {svc.doc_url ? (
                  <a
                    href={svc.doc_url}
                    target="_blank"
                    rel="noreferrer"
                    className="api-creds__doc"
                    aria-label={`${svc.name} documentation`}
                    title="Documentation"
                  >
                    <IconDoc />
                  </a>
                ) : null}
              </div>
              <div className="api-creds__fields">
                {svc.fields.includes("key")
                  ? renderRow(svc, "key")
                  : null}
                {svc.fields.includes("secret")
                  ? renderRow(svc, "secret", { password: true })
                  : null}
                {svc.fields.includes("user_agent")
                  ? renderRow(svc, "user_agent")
                  : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
