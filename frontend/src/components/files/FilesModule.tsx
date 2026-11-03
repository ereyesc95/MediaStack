import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  copyFilesFiles,
  deleteFilesFiles,
  fetchFilesTabFiles,
  fetchFilesTabs,
  moveFilesFiles,
  renameFilesFile,
  uploadFilesFiles,
  type FilesItem,
  type FilesNestedFolder,
  type FilesTab,
} from "../../api";
import { getStoredProfile } from "../../auth";
import {
  pushFilesRootRoute,
  pushFilesTabRoute,
} from "../../filesRoute";
import { withMediaAccess } from "../../mediaFileUrl";
import type { MediaOption } from "../ModuleTopBar";
import ModuleTopBar from "../ModuleTopBar";
import AppMenu from "../AppMenu";
import ConfirmDialog from "../ConfirmDialog";
import ModalPortal from "../ModalPortal";
import {
  IconFileTags,
  IconList,
  IconSearch,
} from "../MenuIcons";
import ManageFilesModal from "./ManageFilesModal";

type SortMode = "title" | "format";

const TAB_OVERFLOW = 6;

type Props = {
  mediaOptions: MediaOption[];
  onSelectMedia: (opt: MediaOption) => void;
  tabId?: string;
  busy?: string;
  isAdmin?: boolean;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onImport?: () => void;
  onSync?: () => void;
  onChooseSource?: () => void;
};

async function openLocal(url: string) {
  try {
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || res.statusText || "Could not open file");
    }
  } catch (e) {
    window.alert(e instanceof Error ? e.message : String(e));
  }
}

function openFile(item: FilesItem) {
  if (item.previewable && item.url) {
    window.open(withMediaAccess(item.url), "_blank", "noopener,noreferrer");
    return;
  }
  if (item.open_url) void openLocal(item.open_url);
}

export default function FilesModule({
  mediaOptions,
  onSelectMedia,
  tabId: routeTabId,
  busy,
  isAdmin = false,
  onSwitchProfile,
  onEditProfile,
  onImport,
  onSync,
  onChooseSource,
}: Props) {
  const [tabs, setTabs] = useState<FilesTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | undefined>(routeTabId);
  const [files, setFiles] = useState<FilesItem[]>([]);
  const [nested, setNested] = useState<FilesNestedFolder[]>([]);
  const [nestedFilter, setNestedFilter] = useState<string | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<SortMode>("title");
  const [manageOpen, setManageOpen] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<FilesItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [transferPaths, setTransferPaths] = useState<string[]>([]);
  const [transferMode, setTransferMode] = useState<"move" | "copy">("move");
  const [moveTab, setMoveTab] = useState("");
  const [moveFolder, setMoveFolder] = useState<string>("");
  const [moveNested, setMoveNested] = useState<FilesNestedFolder[]>([]);
  const [deletePaths, setDeletePaths] = useState<string[]>([]);
  const [deleteNames, setDeleteNames] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchRootRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const nsfwUnlocked = Boolean(getStoredProfile()?.nsfw_unlocked);

  const reloadTabs = useCallback(async () => {
    const data = await fetchFilesTabs();
    setTabs(data.tabs || []);
    return data.tabs || [];
  }, []);

  const reloadFiles = useCallback(async (tab: string) => {
    const data = await fetchFilesTabFiles(tab);
    setFiles(data.files || []);
    setNested(data.nested_folders || []);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void reloadTabs()
      .then((list) => {
        if (cancelled) return;
        const visible = list.filter(
          (t) =>
            t.file_count > 0 ||
            t.id === routeTabId ||
            isAdmin
        );
        let next = routeTabId;
        if (next && !list.some((t) => t.id === next)) {
          next = undefined;
        }
        if (!next) {
          next = visible[0]?.id ?? list[0]?.id;
        }
        setActiveTab(next);
        if (next) {
          if (routeTabId !== next) pushFilesTabRoute(next, true);
          return reloadFiles(next);
        }
        pushFilesRootRoute(true);
        setFiles([]);
        setNested([]);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTabs, reloadFiles, routeTabId, nsfwUnlocked, isAdmin]);

  useEffect(() => {
    setNestedFilter("all");
    setSearch("");
    setSearchOpen(false);
    setSelectedIds([]);
  }, [activeTab]);

  useEffect(() => {
    setSelectedIds([]);
  }, [nestedFilter, search]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    function onDoc(e: MouseEvent) {
      if (
        searchRootRef.current &&
        !searchRootRef.current.contains(e.target as Node)
      ) {
        if (!search.trim()) setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [searchOpen, search]);

  const visibleTabs = useMemo(() => {
    return tabs.filter(
      (t) => t.file_count > 0 || t.id === activeTab || isAdmin
    );
  }, [tabs, activeTab, isAdmin]);

  const useTabSelect = visibleTabs.length > TAB_OVERFLOW;

  async function refreshAfterMutate(opts?: {
    followTab?: string | null;
    followFolder?: string | null;
  }) {
    const list = await reloadTabs();
    const dest = opts?.followTab;
    if (dest && list.some((t) => t.id === dest)) {
      setActiveTab(dest);
      pushFilesTabRoute(dest);
      await reloadFiles(dest);
      if (opts.followFolder) setNestedFilter(opts.followFolder);
      else setNestedFilter("all");
      return;
    }
    if (activeTab) await reloadFiles(activeTab);
  }

  function openTransfer(paths: string[], mode: "move" | "copy") {
    if (!paths.length) return;
    setModalError(null);
    setTransferMode(mode);
    setTransferPaths(paths);
    setMoveTab(activeTab || tabs[0]?.id || "");
    const first = files.find((f) => f.id === paths[0]);
    setMoveFolder(first?.nested_folder || "");
    setMoveNested(nested);
  }

  function openDelete(paths: string[]) {
    if (!paths.length) return;
    setModalError(null);
    setDeletePaths(paths);
    setDeleteNames(
      paths.map((id) => files.find((f) => f.id === id)?.name || id)
    );
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAllVisible() {
    const ids = filtered.map((f) => f.id);
    const allOn = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    setSelectedIds(allOn ? [] : ids);
  }

  async function handleUpload(fileList: FileList | null) {
    if (!fileList?.length || !activeTab) return;
    setFileBusy(true);
    setError(null);
    try {
      const folder = nestedFilter === "all" ? null : nestedFilter;
      await uploadFilesFiles(activeTab, Array.from(fileList), folder);
      await refreshAfterMutate({
        followTab: activeTab,
        followFolder: folder,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFileBusy(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  const selectedCount = selectedIds.length;
  const allVisibleSelected =
    filtered.length > 0 &&
    filtered.every((f) => selectedIds.includes(f.id));

  const filtered = useMemo(() => {
    let list = files;
    if (nestedFilter !== "all") {
      list = list.filter((f) => f.nested_folder === nestedFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((f) => f.name.toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (sort === "format") {
      sorted.sort((a, b) => {
        const ea = (a.ext || "").toLowerCase();
        const eb = (b.ext || "").toLowerCase();
        if (ea !== eb) return ea.localeCompare(eb);
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
    } else {
      sorted.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
    }
    return sorted;
  }, [files, search, sort, nestedFilter]);

  function selectTab(id: string) {
    setActiveTab(id);
    pushFilesTabRoute(id);
    setLoading(true);
    void reloadFiles(id)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    void reloadTabs();
  }

  const sortLabel = sort === "title" ? "TITLE" : "FORMAT";
  const nextSort: SortMode = sort === "title" ? "format" : "title";

  return (
    <div className="files-module">
      <ModuleTopBar
        media={
          mediaOptions.find((m) => m.kind === "files") ?? {
            id: 750,
            kind: "files",
            label: "Files",
          }
        }
        mediaOptions={mediaOptions}
        onSelectMedia={onSelectMedia}
        tabs={
          useTabSelect
            ? []
            : visibleTabs.map((t) => ({
                id: t.id,
                label: t.label.toUpperCase(),
                active: activeTab === t.id,
                onClick: () => selectTab(t.id),
              }))
        }
        center={
          useTabSelect ? (
            <label className="files-module__tab-select">
              <span className="sr-only">Folder</span>
              <select
                value={activeTab || ""}
                onChange={(e) => {
                  if (e.target.value) selectTab(e.target.value);
                }}
                aria-label="Folder"
              >
                {visibleTabs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          ) : undefined
        }
        menu={
          <>
            {busy ? (
              <span className="status-bar module-top-bar__status">{busy}</span>
            ) : null}
            <div
              ref={searchRootRef}
              className={`files-module__search${
                searchOpen ? " is-open" : ""
              }`}
            >
              <button
                type="button"
                className="files-module__search-toggle icon-btn"
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
                title="Search"
                tabIndex={searchOpen ? -1 : 0}
                aria-hidden={searchOpen}
              >
                <IconSearch />
              </button>
              <div className="files-module__search-panel" aria-hidden={!searchOpen}>
                <input
                  ref={searchRef}
                  type="search"
                  className="files-module__search-input"
                  placeholder="Search files…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search files"
                  tabIndex={searchOpen ? 0 : -1}
                />
                <button
                  type="button"
                  className="files-module__search-close"
                  onClick={() => {
                    setSearch("");
                    setSearchOpen(false);
                  }}
                  aria-label="Close search"
                  tabIndex={searchOpen ? 0 : -1}
                >
                  ×
                </button>
              </div>
            </div>
            <button
              type="button"
              className="catalog-scope-toggle catalog-scope-toggle--switch"
              aria-label={sortLabel}
              title={`Switch to ${nextSort === "title" ? "Title" : "Format"}`}
              onClick={() => setSort(nextSort)}
            >
              {sort === "title" ? (
                <IconList className="catalog-scope-toggle__icon" />
              ) : (
                <IconFileTags className="catalog-scope-toggle__icon" />
              )}
              {sortLabel}
            </button>
            <AppMenu
              isAdmin={isAdmin}
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              onImport={onImport}
              onSync={onSync ?? (() => {})}
              onChooseSource={onChooseSource}
              onManageCatalog={
                isAdmin ? () => setManageOpen(true) : undefined
              }
              manageCatalogLabel="Manage Files"
            />
          </>
        }
      />

      {nested.length > 0 ? (
        <div
          className="filter-subbar filter-subbar--spread files-module__nested-bar"
          role="tablist"
          aria-label="Subfolders"
        >
          <button
            type="button"
            role="tab"
            className={nestedFilter === "all" ? "active" : ""}
            aria-selected={nestedFilter === "all"}
            onClick={() => setNestedFilter("all")}
          >
            ALL
          </button>
          {nested.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              className={nestedFilter === f.id ? "active" : ""}
              aria-selected={nestedFilter === f.id}
              onClick={() => setNestedFilter(f.id)}
            >
              {f.label.toUpperCase()}
            </button>
          ))}
        </div>
      ) : null}

      <div className="files-module__body">
        {loading ? <p className="muted">Loading…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {!loading && !error && visibleTabs.length === 0 ? (
          <p className="muted files-module__empty">
            No folders yet. Add folders under Files/ on disk
            {isAdmin ? " or use Manage Files." : "."}
          </p>
        ) : null}
        {isAdmin && activeTab ? (
          <div className="files-module__toolbar">
            <input
              ref={uploadRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => void handleUpload(e.target.files)}
            />
            <button
              type="button"
              className="btn"
              disabled={fileBusy}
              onClick={() => uploadRef.current?.click()}
            >
              {fileBusy ? "Working…" : "Upload"}
            </button>
            {filtered.length > 0 ? (
              <button
                type="button"
                className="ghost"
                disabled={fileBusy}
                onClick={toggleSelectAllVisible}
              >
                {allVisibleSelected ? "Clear selection" : "Select all"}
              </button>
            ) : null}
            {selectedCount > 0 ? (
              <>
                <span className="muted files-module__sel-count">
                  {selectedCount} selected
                </span>
                <button
                  type="button"
                  className="ghost"
                  disabled={fileBusy}
                  onClick={() => openTransfer(selectedIds, "move")}
                >
                  Move
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={fileBusy}
                  onClick={() => openTransfer(selectedIds, "copy")}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={fileBusy}
                  onClick={() => openDelete(selectedIds)}
                >
                  Delete
                </button>
              </>
            ) : null}
            {nestedFilter !== "all" ? (
              <span className="muted files-module__upload-hint">
                Upload → {nested.find((n) => n.id === nestedFilter)?.label || nestedFilter}
              </span>
            ) : null}
          </div>
        ) : null}
        {!loading && !error && activeTab && filtered.length === 0 ? (
          <p className="muted files-module__empty">No files in this folder.</p>
        ) : null}
        {filtered.length > 0 ? (
          <ul className="files-module__list">
            {filtered.map((item) => {
              const checked = selectedIds.includes(item.id);
              return (
                <li
                  key={item.id}
                  className={`files-module__row${checked ? " is-selected" : ""}`}
                >
                  {isAdmin ? (
                    <label className="files-module__check">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={fileBusy}
                        onChange={() => toggleSelected(item.id)}
                        aria-label={`Select ${item.name}`}
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className="files-module__file"
                    onClick={() => openFile(item)}
                    title={item.name}
                  >
                    <span className="files-module__file-name">{item.name}</span>
                  </button>
                  {isAdmin ? (
                    <div className="files-module__actions">
                      <button
                        type="button"
                        className="ghost"
                        disabled={fileBusy}
                        onClick={() => {
                          setModalError(null);
                          setRenameTarget(item);
                          setRenameValue(item.name);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={fileBusy}
                        onClick={() => openTransfer([item.id], "move")}
                      >
                        Move
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={fileBusy}
                        onClick={() => openTransfer([item.id], "copy")}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={fileBusy}
                        onClick={() => openDelete([item.id])}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {manageOpen && isAdmin ? (
        <ManageFilesModal
          tabs={tabs}
          activeTab={activeTab}
          nested={nested}
          nestedFilter={nestedFilter}
          onClose={() => setManageOpen(false)}
          onChanged={(nextTabId) => {
            void (async () => {
              const list = await reloadTabs();
              let next: string | undefined;
              if (nextTabId === null) {
                next = list[0]?.id;
              } else if (nextTabId !== undefined) {
                next = list.some((t) => t.id === nextTabId)
                  ? nextTabId
                  : list[0]?.id;
              } else if (activeTab && list.some((t) => t.id === activeTab)) {
                next = activeTab;
              } else {
                next = list[0]?.id;
              }
              setActiveTab(next);
              setNestedFilter("all");
              if (next) {
                pushFilesTabRoute(next, true);
                await reloadFiles(next);
              } else {
                pushFilesRootRoute(true);
                setFiles([]);
                setNested([]);
              }
            })().catch((e) =>
              setError(e instanceof Error ? e.message : String(e))
            );
          }}
        />
      ) : null}

      {renameTarget && isAdmin ? (
        <ModalPortal
          onClose={() => {
            if (!fileBusy) {
              setRenameTarget(null);
              setModalError(null);
            }
          }}
        >
          <div
            className="modal-panel artist-admin-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-panel-header">
              <h3>Rename file</h3>
              <button
                type="button"
                className="modal-close-x"
                disabled={fileBusy}
                onClick={() => {
                  setRenameTarget(null);
                  setModalError(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="artist-admin-form">
              <label>
                New name
                <input
                  value={renameValue}
                  onChange={(e) => {
                    setRenameValue(e.target.value);
                    setModalError(null);
                  }}
                  autoFocus
                  disabled={fileBusy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && renameValue.trim()) {
                      e.preventDefault();
                      void (async () => {
                        setFileBusy(true);
                        setModalError(null);
                        try {
                          await renameFilesFile(
                            renameTarget.id,
                            renameValue.trim()
                          );
                          setRenameTarget(null);
                          await refreshAfterMutate();
                        } catch (err) {
                          setModalError(
                            err instanceof Error ? err.message : String(err)
                          );
                        } finally {
                          setFileBusy(false);
                        }
                      })();
                    }
                  }}
                />
              </label>
            </div>
            {modalError ? <p className="error">{modalError}</p> : null}
            <div className="modal-actions-row">
              <button
                type="button"
                className="btn"
                disabled={fileBusy}
                onClick={() => {
                  setRenameTarget(null);
                  setModalError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={fileBusy || !renameValue.trim()}
                onClick={() => {
                  void (async () => {
                    setFileBusy(true);
                    setModalError(null);
                    try {
                      await renameFilesFile(
                        renameTarget.id,
                        renameValue.trim()
                      );
                      setRenameTarget(null);
                      await refreshAfterMutate();
                    } catch (err) {
                      setModalError(
                        err instanceof Error ? err.message : String(err)
                      );
                    } finally {
                      setFileBusy(false);
                    }
                  })();
                }}
              >
                {fileBusy ? "Saving…" : "Rename"}
              </button>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {transferPaths.length > 0 && isAdmin ? (
        <ModalPortal
          onClose={() => {
            if (!fileBusy) {
              setTransferPaths([]);
              setModalError(null);
            }
          }}
        >
          <div
            className="modal-panel artist-admin-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-panel-header">
              <h3>
                {transferMode === "copy" ? "Copy" : "Move"}{" "}
                {transferPaths.length === 1
                  ? "file"
                  : `${transferPaths.length} files`}
              </h3>
              <button
                type="button"
                className="modal-close-x"
                disabled={fileBusy}
                onClick={() => {
                  setTransferPaths([]);
                  setModalError(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="artist-admin-form">
              <label>
                Tab
                <select
                  value={moveTab}
                  disabled={fileBusy}
                  onChange={(e) => {
                    const next = e.target.value;
                    setMoveTab(next);
                    setMoveFolder("");
                    setModalError(null);
                    void fetchFilesTabFiles(next)
                      .then((data) => setMoveNested(data.nested_folders || []))
                      .catch(() => setMoveNested([]));
                  }}
                >
                  {tabs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Subfolder
                <select
                  value={moveFolder}
                  disabled={fileBusy}
                  onChange={(e) => {
                    setMoveFolder(e.target.value);
                    setModalError(null);
                  }}
                >
                  <option value="">(tab root)</option>
                  {moveNested.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {modalError ? <p className="error">{modalError}</p> : null}
            <div className="modal-actions-row">
              <button
                type="button"
                className="btn"
                disabled={fileBusy}
                onClick={() => {
                  setTransferPaths([]);
                  setModalError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={fileBusy || !moveTab}
                onClick={() => {
                  void (async () => {
                    setFileBusy(true);
                    setModalError(null);
                    try {
                      if (transferMode === "copy") {
                        await copyFilesFiles(
                          transferPaths,
                          moveTab,
                          moveFolder || null
                        );
                      } else {
                        await moveFilesFiles(
                          transferPaths,
                          moveTab,
                          moveFolder || null
                        );
                      }
                      setTransferPaths([]);
                      setSelectedIds([]);
                      await refreshAfterMutate({
                        followTab: moveTab,
                        followFolder: moveFolder || null,
                      });
                    } catch (err) {
                      setModalError(
                        err instanceof Error ? err.message : String(err)
                      );
                    } finally {
                      setFileBusy(false);
                    }
                  })();
                }}
              >
                {fileBusy
                  ? transferMode === "copy"
                    ? "Copying…"
                    : "Moving…"
                  : transferMode === "copy"
                    ? "Copy"
                    : "Move"}
              </button>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {deletePaths.length > 0 && isAdmin ? (
        <ConfirmDialog
          title={deletePaths.length === 1 ? "Delete file" : "Delete files"}
          message={
            deletePaths.length === 1
              ? `Delete “${deleteNames[0]}”? This cannot be undone.`
              : `Delete ${deletePaths.length} files? This cannot be undone.`
          }
          confirmLabel={fileBusy ? "Deleting…" : "Delete"}
          destructive
          busy={fileBusy}
          error={modalError}
          onClose={() => {
            if (!fileBusy) {
              setDeletePaths([]);
              setDeleteNames([]);
              setModalError(null);
            }
          }}
          onConfirm={() => {
            void (async () => {
              setFileBusy(true);
              setModalError(null);
              try {
                await deleteFilesFiles(deletePaths);
                setDeletePaths([]);
                setDeleteNames([]);
                setSelectedIds([]);
                await refreshAfterMutate();
              } catch (err) {
                setModalError(
                  err instanceof Error ? err.message : String(err)
                );
              } finally {
                setFileBusy(false);
              }
            })();
          }}
        />
      ) : null}
    </div>
  );
}
