import ModalPortal from "./ModalPortal";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}: Props) {
  return (
    <ModalPortal onClose={onClose} layer={2}>
      <div
        className="modal-panel artist-admin-modal confirm-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="confirm-dialog__message">{message}</p>
        <div className="modal-actions-row confirm-dialog__actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn${destructive ? " btn--danger" : ""}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
