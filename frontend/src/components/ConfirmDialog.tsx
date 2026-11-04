import ModalPortal, { useModalClose } from "./ModalPortal";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  /** Hide bottom cancel — close via × only (default false). */
  hideCancel?: boolean;
};

export default function ConfirmDialog(props: Props) {
  return (
    <ModalPortal onClose={props.onClose} layer={2}>
      <ConfirmDialogPanel {...props} />
    </ModalPortal>
  );
}

function ConfirmDialogPanel({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  error = null,
  onConfirm,
  onClose,
  hideCancel = false,
}: Props) {
  const requestClose = useModalClose(onClose);
  return (
      <div
        className="modal-panel artist-admin-modal confirm-dialog"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close-x" onClick={() => requestClose()}>
            ×
          </button>
        </div>
        <p className="confirm-dialog__message">{message}</p>
        {error ? <p className="error">{error}</p> : null}
        <div className="modal-actions-row confirm-dialog__actions">
          {!hideCancel ? (
            <button
              type="button"
              className="btn"
              onClick={() => requestClose()}
              disabled={busy}
            >
              {cancelLabel}
            </button>
          ) : (
            <span className="modal-actions__spacer" />
          )}
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
  );
}
