import { useState } from "react";
import { IconContinueArrow } from "./MenuIcons";

type Props = {
  onSubmit: (password: string) => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
};

export default function AdminPasswordModal({
  onSubmit,
  onCancel,
  busy = false,
  error,
}: Props) {
  const [password, setPassword] = useState("");

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-panel modal-panel--admin-pw"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>Admin access</h3>
          <button
            type="button"
            className="modal-close-x"
            aria-label="Close"
            onClick={onCancel}
            disabled={busy}
          >
            ×
          </button>
        </div>
        <p className="muted">Enter the admin password to continue.</p>
        <div className="admin-pw-row">
          <input
            type="password"
            className="admin-pw-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            disabled={busy}
            onKeyDown={(e) =>
              e.key === "Enter" && password.trim() && onSubmit(password)
            }
          />
          <button
            type="button"
            className="admin-pw-submit"
            aria-label="Continue"
            disabled={busy || !password.trim()}
            onClick={() => onSubmit(password)}
          >
            <IconContinueArrow />
          </button>
        </div>
        {error && <p className="error-inline">{error}</p>}
      </div>
    </div>
  );
}
