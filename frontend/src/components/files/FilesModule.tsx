import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchFilesTabFiles,
  fetchFilesTabs,
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
  const searchRef = useRef<HTMLInputElement>(null);
  const searchRootRef = useRef<HTMLDivElement>(null);
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
          (t) => t.file_count > 0 || t.id === routeTabId
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
  }, [reloadTabs, reloadFiles, routeTabId, nsfwUnlocked]);

  useEffect(() => {
    setNestedFilter("all");
    setSearch("");
    setSearchOpen(false);
  }, [activeTab]);

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
    return tabs.filter((t) => t.file_count > 0 || t.id === activeTab);
  }, [tabs, activeTab]);

  const useTabSelect = visibleTabs.length > TAB_OVERFLOW;

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
            No folders yet. Add folders under Files/ on disk.
          </p>
        ) : null}
        {!loading && !error && activeTab && filtered.length === 0 ? (
          <p className="muted files-module__empty">No files in this folder.</p>
        ) : null}
        {filtered.length > 0 ? (
          <ul className="files-module__list">
            {filtered.map((item) => (
              <li key={item.id} className="files-module__row">
                <button
                  type="button"
                  className="files-module__file"
                  onClick={() => openFile(item)}
                  title={item.name}
                >
                  <span className="files-module__file-name">{item.name}</span>
                </button>
              </li>
            ))}
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
    </div>
  );
}
