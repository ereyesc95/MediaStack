import { useRef, useState } from "react";
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
  const pressedOnBackdrop = useRef(false);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (pressedOnBackdrop.current && e.target === e.currentTarget) {
          onCancel();
        }
        pressedOnBackdrop.current = false;
      }}
    >
      <div
        className="modal-panel modal-panel--admin-pw"
        onMouseDown={(e) => e.stopPropagation()}
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
