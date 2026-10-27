import { useEffect, useState } from "react";
import {
  createFilesFolder,
  createFilesTab,
  deleteFilesFolder,
  deleteFilesTab,
  renameFilesFolder,
  renameFilesTab,
  type FilesNestedFolder,
  type FilesTab,
} from "../../api";
import ModalPortal from "../ModalPortal";
import ConfirmDialog from "../ConfirmDialog";

type Props = {
  tabs: FilesTab[];
  activeTab?: string;
  nested: FilesNestedFolder[];
  nestedFilter: string | "all";
  onClose: () => void;
  /** Tab id to select, `null` to clear, omit/`undefined` to keep current. */
  onChanged: (nextTabId?: string | null) => void;
};

type PromptKind =
  | "new-tab"
  | "rename-tab"
  | "new-folder"
  | "rename-folder"
  | null;

export default function ManageFilesModal({
  tabs,
  activeTab,
  nested,
  nestedFilter,
  onClose,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptKind>(null);
  const [promptValue, setPromptValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<
    "tab" | "folder" | null
  >(null);

  const tab = tabs.find((t) => t.id === activeTab);
  const folder =
    nestedFilter !== "all"
      ? nested.find((f) => f.id === nestedFilter)
      : undefined;

  useEffect(() => {
    if (!prompt) return;
    const defaults: Record<Exclude<PromptKind, null>, string> = {
      "new-tab": "",
      "rename-tab": tab?.name || "",
      "new-folder": "",
      "rename-folder": folder?.name || "",
    };
    setPromptValue(defaults[prompt]);
    setError(null);
  }, [prompt, tab?.name, folder?.name]);

  async function run(
    action: () => Promise<string | null | void>,
    fallbackTab?: string | null
  ) {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      setPrompt(null);
      setConfirmDelete(null);
      onChanged(next === undefined ? fallbackTab : next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function submitPrompt() {
    const name = promptValue.trim();
    if (!name || !prompt) return;
    if (prompt === "new-tab") {
      void run(async () => {
        const created = await createFilesTab(name);
        return created.id;
      });
      return;
    }
    if (prompt === "rename-tab" && activeTab) {
      void run(async () => {
        const renamed = await renameFilesTab(activeTab, name);
        return renamed.id;
      });
      return;
    }
    if (prompt === "new-folder" && activeTab) {
      void run(async () => {
        await createFilesFolder(activeTab, name);
      }, activeTab);
      return;
    }
    if (prompt === "rename-folder" && activeTab && folder) {
      void run(async () => {
        await renameFilesFolder(activeTab, folder.id, name);
      }, activeTab);
    }
  }

  return (
    <>
      <ModalPortal onClose={onClose}>
        <div
          className="modal-panel artist-admin-modal manage-files-modal"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="modal-panel-header">
            <h3>Manage Files</h3>
            <button type="button" className="modal-close-x" onClick={onClose}>
              ×
            </button>
          </div>

          <p className="muted manage-files-modal__hint">
            Tabs map to folders under <code>Files/</code> on disk. Nested
            folders are optional subfolders inside a tab.
          </p>

          {error ? <p className="error">{error}</p> : null}

          <div className="manage-files-modal__section">
            <h4>Tab{tab ? `: ${tab.label}` : ""}</h4>
            <div className="modal-actions-row">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setPrompt("new-tab")}
              >
                New tab
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || !activeTab}
                onClick={() => setPrompt("rename-tab")}
              >
                Rename
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy || !activeTab}
                onClick={() => setConfirmDelete("tab")}
              >
                Delete
              </button>
            </div>
          </div>

          <div className="manage-files-modal__section">
            <h4>
              Subfolder
              {folder ? `: ${folder.label}` : " (select one in the bar)"}
            </h4>
            <div className="modal-actions-row">
              <button
                type="button"
                className="btn"
                disabled={busy || !activeTab}
                onClick={() => setPrompt("new-folder")}
              >
                New subfolder
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || !folder}
                onClick={() => setPrompt("rename-folder")}
              >
                Rename
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy || !folder}
                onClick={() => setConfirmDelete("folder")}
              >
                Delete
              </button>
            </div>
          </div>

          {prompt ? (
            <div className="manage-files-modal__prompt">
              <label>
                Name
                <input
                  type="text"
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitPrompt();
                  }}
                  autoFocus
                  disabled={busy}
                />
              </label>
              <div className="modal-actions-row">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setPrompt(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !promptValue.trim()}
                  onClick={submitPrompt}
                >
                  Save
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </ModalPortal>

      {confirmDelete === "tab" && activeTab && tab ? (
        <ConfirmDialog
          title="Delete tab"
          message={`Delete “${tab.label}” and all files inside? This cannot be undone.`}
          confirmLabel="Delete"
          destructive
          busy={busy}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            void run(async () => {
              await deleteFilesTab(activeTab);
              return null;
            });
          }}
        />
      ) : null}

      {confirmDelete === "folder" && activeTab && folder ? (
        <ConfirmDialog
          title="Delete subfolder"
          message={`Delete “${folder.label}” and its files? This cannot be undone.`}
          confirmLabel="Delete"
          destructive
          busy={busy}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            void run(async () => {
              await deleteFilesFolder(activeTab, folder.id);
            }, activeTab);
          }}
        />
      ) : null}
    </>
  );
}
