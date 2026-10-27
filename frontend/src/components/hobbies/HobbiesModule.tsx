import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  adjustHobbyItemQuantity,
  addHobbyFieldOption,
  commitHobbyImport,
  createHobbyItem,
  deleteHobbyCollection,
  deleteHobbyItem,
  deleteHobbyItemsBatch,
  downloadHobbyTemplateXlsx,
  ensureHobbyCollection,
  exportHobbyXlsx,
  fetchHobbyCollections,
  fetchHobbyFieldOptions,
  fetchHobbyItems,
  fetchHobbyPresets,
  previewHobbyImport,
  updateHobbyCollection,
  updateHobbyItem,
  uploadHobbyCollectionIcon,
  uploadHobbyItemImage,
  type HobbyCollection,
  type HobbyItem,
  type HobbyPreset,
} from "../../api";
import { getStoredProfile } from "../../auth";
import {
  pushHobbiesCollectionRoute,
  pushHobbiesRootRoute,
} from "../../hobbiesRoute";
import { withMediaAccess } from "../../mediaFileUrl";
import type { MediaOption } from "../ModuleTopBar";
import ModuleTopBar from "../ModuleTopBar";
import AppMenu from "../AppMenu";
import ModalPortal from "../ModalPortal";
import ConfirmDialog from "../ConfirmDialog";
import GalleryViewerModal, {
  type GalleryViewerItem,
} from "../music/artist/GalleryViewerModal";
import {
  IconExternalLink,
  IconPencil,
  IconTrash,
} from "../MenuIcons";

type HobbyCollectionMenu = {
  onAdd: () => void;
  onImport: () => void;
  onExport: () => void;
  onTemplate: () => void;
  onDeleteItems: () => void;
  deleteItemsActive: boolean;
  onDelete: () => void;
  privateChecked: boolean | null;
  privateBusy: boolean;
  onPrivateChange: (next: boolean) => void;
};

type SortState = { col: string; dir: "asc" | "desc" };

function normalizeExternalUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  return `https://${url}`;
}

function cellSortValue(it: HobbyItem, col: string): string | number {
  if (col === "image") return it.image ? 1 : 0;
  if (col === "quantity" || col === "total_slots" || col === "items_collected") {
    const n = Number((it as Record<string, unknown>)[col]);
    return Number.isFinite(n) ? n : -Infinity;
  }
  if (col === "completion_pct") return it.completion_pct ?? -Infinity;
  if (col === "missing" || col === "duplicates") {
    return ((it[col as "missing" | "duplicates"] || []) as string[]).join(", ");
  }
  const val = (it as Record<string, unknown>)[col];
  return val == null ? "" : String(val);
}

type Props = {
  mediaOptions: MediaOption[];
  onSelectMedia: (opt: MediaOption) => void;
  collectionId?: number;
  busy?: string;
  isAdmin?: boolean;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onImport?: () => void;
  onSync?: () => void;
  onChooseSource?: () => void;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  brand: "Brand",
  theme: "Theme",
  type: "Type",
  category: "Category",
  size: "Size",
  style: "Style",
  quantity: "Qty",
  total_slots: "Total slots",
  items_collected: "Collected",
  missing_count: "Missing #",
  completion_pct: "Complete %",
  box_size: "Box size",
  missing: "Missing",
  duplicates: "Duplicates",
  image: "Image",
  shop_url: "Shop",
  tutorial_url: "Tutorial",
  notes: "Notes",
};

function fieldLabel(col: string, preset?: string): string {
  if (col === "size" && preset === "puzzle") return "Pieces";
  return FIELD_LABELS[col] || col;
}

export default function HobbiesModule({
  mediaOptions,
  onSelectMedia,
  collectionId,
  busy,
  isAdmin = false,
  onSwitchProfile,
  onEditProfile,
  onImport,
  onSync,
  onChooseSource,
}: Props) {
  const [collections, setCollections] = useState<HobbyCollection[]>([]);
  const [hiddenPrivatePresets, setHiddenPrivatePresets] = useState<string[]>(
    []
  );
  const [presets, setPresets] = useState<HobbyPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingPreset, setOpeningPreset] = useState<string | null>(null);
  const [hubError, setHubError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | undefined>(collectionId);
  const [collectionMenu, setCollectionMenu] =
    useState<HobbyCollectionMenu | null>(null);
  const nsfwUnlocked = Boolean(getStoredProfile()?.nsfw_unlocked);

  useEffect(() => {
    setActiveId(collectionId);
  }, [collectionId]);

  const active = useMemo(
    () => collections.find((c) => c.id === activeId) ?? null,
    [collections, activeId]
  );

  const byPreset = useMemo(() => {
    const map = new Map<string, HobbyCollection>();
    for (const c of collections) map.set(c.preset, c);
    return map;
  }, [collections]);

  const hubTiles = useMemo(() => {
    const hidden = new Set(hiddenPrivatePresets);
    const list = presets.filter((p) => !hidden.has(p.id));
    list.sort((a, b) => {
      if (a.id === "generic") return 1;
      if (b.id === "generic") return -1;
      return a.label.localeCompare(b.label);
    });
    return list;
  }, [presets, hiddenPrivatePresets]);

  function goHome() {
    pushHobbiesRootRoute();
    setActiveId(undefined);
    setCollectionMenu(null);
  }

  function openCollection(id: number) {
    pushHobbiesCollectionRoute(id);
    setActiveId(id);
  }

  const reloadCollections = useCallback(async () => {
    const data = await fetchHobbyCollections();
    setCollections(data.collections || []);
    setHiddenPrivatePresets(data.hidden_private_presets || []);
  }, []);

  async function openPreset(presetId: string) {
    const existing = byPreset.get(presetId);
    if (existing) {
      openCollection(existing.id);
      return;
    }
    setOpeningPreset(presetId);
    setHubError(null);
    try {
      const created = await ensureHobbyCollection(presetId);
      await reloadCollections();
      openCollection(created.id);
    } catch (e) {
      setHubError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpeningPreset(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([fetchHobbyCollections(), fetchHobbyPresets()])
      .then(([cols, pr]) => {
        if (cancelled) return;
        setCollections(cols.collections || []);
        setHiddenPrivatePresets(cols.hidden_private_presets || []);
        setPresets(pr.presets || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nsfwUnlocked]);

  return (
    <div className="hobbies-module">
      <ModuleTopBar
        media={
          mediaOptions.find((m) => m.kind === "hobbies") ?? {
            id: 800,
            kind: "hobbies",
            label: "Hobbies",
          }
        }
        mediaOptions={mediaOptions}
        onSelectMedia={onSelectMedia}
        tabs={[
          {
            id: "home",
            label: "HOME",
            active: activeId == null,
            onClick: () => goHome(),
          },
          ...(active
            ? [
                {
                  id: "collection",
                  label: active.name.toUpperCase(),
                  active: true,
                  onClick: () => openCollection(active.id),
                },
              ]
            : []),
        ]}
        menu={
          <>
            {busy ? <span className="status-bar module-top-bar__status">{busy}</span> : null}
            <AppMenu
              isAdmin={isAdmin}
              onSwitchProfile={onSwitchProfile}
              onEditProfile={onEditProfile}
              onImport={onImport}
              onSync={onSync ?? (() => {})}
              onChooseSource={onChooseSource}
              showManageCollection={Boolean(collectionMenu)}
              manageCollectionLabel="My Collections"
              collectionAddLabel="Add"
              onCollectionAddManual={collectionMenu?.onAdd}
              onCollectionImport={collectionMenu?.onImport}
              onCollectionExport={collectionMenu?.onExport}
              onCollectionTemplate={collectionMenu?.onTemplate}
              onCollectionDeleteItems={collectionMenu?.onDeleteItems}
              collectionDeleteItemsActive={
                collectionMenu?.deleteItemsActive ?? false
              }
              onCollectionDelete={collectionMenu?.onDelete}
              collectionPrivate={collectionMenu?.privateChecked ?? null}
              collectionPrivateBusy={collectionMenu?.privateBusy}
              onCollectionPrivateChange={collectionMenu?.onPrivateChange}
            />
          </>
        }
      />

      <div className="hobbies-module__body">
        {activeId == null ? (
          <div className="hobbies-hub">
            {loading ? <p className="muted hobbies-hub__status">Loading…</p> : null}
            {hubError ? <p className="error hobbies-hub__status">{hubError}</p> : null}
            <div className="hobbies-hub__grid">
              {hubTiles.map((p) => {
                const col = byPreset.get(p.id);
                const busyTile = openingPreset === p.id;
                const coverUrl = p.cover_url || null;
                const hoverLogo =
                  col?.icon_url || p.logo_url || p.icon_url || null;
                const status = busyTile
                  ? "Opening…"
                  : !col
                    ? "Not started"
                    : col.item_count === 0
                      ? "Empty"
                      : `${col.item_count} item${
                          col.item_count === 1 ? "" : "s"
                        }`;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="hobbies-hub__card"
                    disabled={busyTile || openingPreset != null}
                    onClick={() => void openPreset(p.id)}
                    aria-label={`${p.label}, ${status}`}
                  >
                    <span
                      className="hobbies-hub__card-bg card-bg-layer"
                      style={
                        coverUrl
                          ? {
                              backgroundImage: `url("${withMediaAccess(
                                coverUrl
                              )}")`,
                            }
                          : undefined
                      }
                    />
                    <span className="hobbies-hub__card-dim" />
                    <span className="hobbies-hub__card-footer">
                      {hoverLogo ? (
                        <img
                          src={withMediaAccess(hoverLogo)}
                          alt=""
                          className="hobbies-hub__card-logo"
                        />
                      ) : (
                        <span className="hobbies-hub__card-name">{p.label}</span>
                      )}
                      <span className="hobbies-hub__card-meta">{status}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : active ? (
          <HobbyCollectionView
            collection={active}
            isAdmin={isAdmin}
            nsfwUnlocked={nsfwUnlocked}
            onRegisterMenu={setCollectionMenu}
            onChanged={() => void reloadCollections()}
            onDeleted={() => {
              void reloadCollections().then(() => goHome());
            }}
          />
        ) : (
          <p className="muted">Collection not found.</p>
        )}
      </div>
    </div>
  );
}

function HobbyCollectionView({
  collection,
  isAdmin,
  nsfwUnlocked,
  onRegisterMenu,
  onChanged,
  onDeleted,
}: {
  collection: HobbyCollection;
  isAdmin: boolean;
  nsfwUnlocked: boolean;
  onRegisterMenu: (menu: HobbyCollectionMenu | null) => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [items, setItems] = useState<HobbyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<HobbyItem | null | "new">(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [sort, setSort] = useState<SortState>({ col: "title", dir: "asc" });
  const [privateBusy, setPrivateBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [itemDeleteTarget, setItemDeleteTarget] = useState<HobbyItem | null>(
    null
  );
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [itemDeleteBusy, setItemDeleteBusy] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{
    url: string;
    x: number;
    y: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLInputElement>(null);
  const showPrivateToggle = isAdmin && nsfwUnlocked;

  const fields = collection.fields;

  const reload = useCallback(async () => {
    try {
      const data = await fetchHobbyItems(collection.id);
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }, [collection.id]);

  useEffect(() => {
    setLoading(true);
    setSelected(new Set());
    setSelectMode(false);
    void reload();
  }, [reload]);

  const runImport = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const runExport = useCallback(() => {
    void exportHobbyXlsx(collection.id).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${collection.name}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }, [collection.id, collection.name]);

  const runTemplate = useCallback(() => {
    void downloadHobbyTemplateXlsx().then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "hobby-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    });
  }, []);

  const runDeleteCollection = useCallback(() => {
    setDeleteConfirmOpen(true);
  }, []);

  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) setSelected(new Set());
      return !prev;
    });
  }, []);

  const confirmDeleteCollection = useCallback(() => {
    setDeleteBusy(true);
    void deleteHobbyCollection(collection.id)
      .then(onDeleted)
      .catch((err) => {
        window.alert(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setDeleteBusy(false);
        setDeleteConfirmOpen(false);
      });
  }, [collection.id, onDeleted]);

  const runPrivateChange = useCallback(
    (next: boolean) => {
      setPrivateBusy(true);
      void updateHobbyCollection(collection.id, { private: next })
        .then(() => onChanged())
        .catch((err) => {
          window.alert(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setPrivateBusy(false));
    },
    [collection.id, onChanged]
  );

  useEffect(() => {
    onRegisterMenu({
      onAdd: () => setEditItem("new"),
      onImport: runImport,
      onExport: runExport,
      onTemplate: runTemplate,
      onDeleteItems: toggleSelectMode,
      deleteItemsActive: selectMode,
      onDelete: runDeleteCollection,
      privateChecked: showPrivateToggle ? Boolean(collection.private) : null,
      privateBusy,
      onPrivateChange: runPrivateChange,
    });
    return () => onRegisterMenu(null);
  }, [
    onRegisterMenu,
    runImport,
    runExport,
    runTemplate,
    toggleSelectMode,
    selectMode,
    runDeleteCollection,
    runPrivateChange,
    showPrivateToggle,
    collection.private,
    privateBusy,
  ]);

  const tableCols = useMemo(() => {
    const cols = fields.filter((f) => f !== "image" && f !== "notes");
    if (collection.preset === "fillable_album") {
      for (const extra of [
        "items_collected",
        "completion_pct",
        "missing_count",
      ] as const) {
        if (!cols.includes(extra)) cols.push(extra);
      }
    }
    return cols;
  }, [fields, collection.preset]);

  const sortedItems = useMemo(() => {
    const list = [...items];
    const { col, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const va = cellSortValue(a, col);
      const vb = cellSortValue(b, col);
      if (typeof va === "number" && typeof vb === "number") {
        if (va === vb) return 0;
        return va < vb ? -mul : mul;
      }
      return (
        String(va).localeCompare(String(vb), undefined, {
          sensitivity: "base",
          numeric: true,
        }) * mul
      );
    });
    return list;
  }, [items, sort]);

  const galleryItems: GalleryViewerItem[] = useMemo(
    () =>
      sortedItems
        .filter((it) => Boolean(it.image))
        .map((it) => ({
          id: String(it.id),
          url: withMediaAccess(String(it.image)),
          caption: it.title || "Item",
        })),
    [sortedItems]
  );

  function toggleSort(col: string) {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "asc" }
    );
  }

  function sortMark(col: string) {
    if (sort.col !== col) return "";
    return sort.dir === "asc" ? " ▲" : " ▼";
  }

  const colSpan = tableCols.length + 2 + (selectMode ? 1 : 0);

  return (
    <div className="hobbies-collection">
      <div className="hobbies-collection__toolbar">
        <div className="hobbies-collection__identity">
          <button
            type="button"
            className="hobbies-collection__icon-btn"
            title="Change icon"
            onClick={() => iconRef.current?.click()}
          >
            <img
              src={withMediaAccess(collection.icon_url)}
              alt=""
              className="hobbies-collection__icon"
            />
            <span className="hobbies-collection__icon-edit" aria-hidden>
              <IconPencil />
            </span>
          </button>
          <input
            ref={iconRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void uploadHobbyCollectionIcon(collection.id, file).then(() =>
                onChanged()
              );
              e.target.value = "";
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void (async () => {
                const preview = await previewHobbyImport(collection.id, file);
                if (!preview.ok) {
                  window.alert(preview.error || "Import failed");
                  return;
                }
                if (
                  !window.confirm(
                    `Import ${preview.count ?? preview.rows.length} row(s)?`
                  )
                ) {
                  return;
                }
                await commitHobbyImport(collection.id, preview.rows);
                await reload();
                onChanged();
              })();
              e.target.value = "";
            }}
          />
          <h2 className="hobbies-collection__title">
            {collection.name}
            {collection.private ? (
              <span className="hobbies-collection__private-badge">Private</span>
            ) : null}
          </h2>
        </div>
        {selectMode && selected.size > 0 ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setBatchDeleteOpen(true)}
          >
            Delete selected ({selected.size})
          </button>
        ) : null}
      </div>

      <div className="hobbies-collection__table-wrap">
        <table className="hobbies-collection__table">
          <thead>
            <tr>
              {selectMode ? (
                <th className="hobbies-collection__select-col">
                  <input
                    type="checkbox"
                    checked={
                      sortedItems.length > 0 &&
                      selected.size === sortedItems.length
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelected(new Set(sortedItems.map((i) => i.id)));
                      } else setSelected(new Set());
                    }}
                    aria-label="Select all"
                  />
                </th>
              ) : null}
              <th>
                <button
                  type="button"
                  className="hobbies-collection__sort-btn"
                  onClick={() => toggleSort("image")}
                >
                  Image{sortMark("image")}
                </button>
              </th>
              {tableCols.map((col) => (
                <th key={col}>
                  <button
                    type="button"
                    className="hobbies-collection__sort-btn"
                    onClick={() => toggleSort(col)}
                  >
                    {fieldLabel(col, collection.preset)}
                    {sortMark(col)}
                  </button>
                </th>
              ))}
              <th className="hobbies-collection__actions-col" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="muted">
                  Loading…
                </td>
              </tr>
            ) : sortedItems.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="muted">
                  No items yet.
                </td>
              </tr>
            ) : (
              sortedItems.map((it) => (
                <tr key={it.id} className="hobbies-collection__row">
                  {selectMode ? (
                    <td className="hobbies-collection__select-col">
                      <input
                        type="checkbox"
                        checked={selected.has(it.id)}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(it.id);
                            else next.delete(it.id);
                            return next;
                          });
                        }}
                        aria-label={`Select ${it.title || it.id}`}
                      />
                    </td>
                  ) : null}
                  <td>
                    {it.image ? (
                      <button
                        type="button"
                        className="hobbies-collection__thumb-btn"
                        onMouseEnter={(e) => {
                          const rect = (
                            e.currentTarget as HTMLElement
                          ).getBoundingClientRect();
                          const previewW = 260;
                          const x =
                            rect.right + 12 + previewW > window.innerWidth
                              ? Math.max(8, rect.left - previewW - 12)
                              : rect.right + 12;
                          setHoverPreview({
                            url: withMediaAccess(String(it.image)),
                            x,
                            y: Math.max(8, rect.top),
                          });
                        }}
                        onMouseLeave={() => setHoverPreview(null)}
                        onClick={() => {
                          setHoverPreview(null);
                          const idx = galleryItems.findIndex(
                            (g) => g.id === String(it.id)
                          );
                          if (idx >= 0) setViewerIndex(idx);
                        }}
                        aria-label={`View ${it.title || "image"}`}
                      >
                        <img
                          src={withMediaAccess(String(it.image))}
                          alt=""
                          className="hobbies-collection__thumb"
                        />
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  {tableCols.map((col) => (
                    <td key={col}>{renderCell(it, col, collection)}</td>
                  ))}
                  <td className="hobbies-collection__actions-col">
                    <div className="hobbies-collection__row-actions">
                      {collection.preset === "marbles" ? (
                        <>
                          <button
                            type="button"
                            className="hobbies-collection__icon-action"
                            title="Decrease qty"
                            onClick={() => {
                              void adjustHobbyItemQuantity(
                                collection.id,
                                it.id,
                                { delta: -1 }
                              ).then(() => {
                                void reload();
                                onChanged();
                              });
                            }}
                          >
                            −
                          </button>
                          <button
                            type="button"
                            className="hobbies-collection__icon-action"
                            title="Increase qty"
                            onClick={() => {
                              void adjustHobbyItemQuantity(
                                collection.id,
                                it.id,
                                { delta: 1 }
                              ).then(() => {
                                void reload();
                                onChanged();
                              });
                            }}
                          >
                            +
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="hobbies-collection__icon-action"
                        title="Edit"
                        aria-label="Edit"
                        onClick={() => setEditItem(it)}
                      >
                        <IconPencil />
                      </button>
                      <button
                        type="button"
                        className="hobbies-collection__icon-action hobbies-collection__icon-action--danger"
                        title="Delete"
                        aria-label="Delete"
                        onClick={() => setItemDeleteTarget(it)}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hoverPreview ? (
        <div
          className="hobbies-collection__thumb-preview"
          style={{ left: hoverPreview.x, top: hoverPreview.y }}
          aria-hidden
        >
          <img src={hoverPreview.url} alt="" />
        </div>
      ) : null}

      {viewerIndex != null && galleryItems.length ? (
        <GalleryViewerModal
          items={galleryItems}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}

      {editItem !== null ? (
        <HobbyItemModal
          collection={collection}
          item={editItem === "new" ? null : editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
            void reload();
            onChanged();
          }}
        />
      ) : null}
      {deleteConfirmOpen ? (
        <ConfirmDialog
          title="Delete collection"
          message={`Delete collection “${collection.name}” and all items?`}
          confirmLabel="Delete"
          destructive
          hideCancel
          busy={deleteBusy}
          onConfirm={confirmDeleteCollection}
          onClose={() => {
            if (!deleteBusy) setDeleteConfirmOpen(false);
          }}
        />
      ) : null}
      {itemDeleteTarget ? (
        <ConfirmDialog
          title="Delete item"
          message={`Delete “${itemDeleteTarget.title || "this item"}”?`}
          confirmLabel="Delete"
          destructive
          busy={itemDeleteBusy}
          onConfirm={() => {
            setItemDeleteBusy(true);
            void deleteHobbyItem(collection.id, itemDeleteTarget.id)
              .then(() => {
                setItemDeleteTarget(null);
                void reload();
                onChanged();
              })
              .finally(() => setItemDeleteBusy(false));
          }}
          onClose={() => {
            if (!itemDeleteBusy) setItemDeleteTarget(null);
          }}
        />
      ) : null}
      {batchDeleteOpen ? (
        <ConfirmDialog
          title="Delete items"
          message={`Delete ${selected.size} selected item(s)?`}
          confirmLabel="Delete"
          destructive
          busy={itemDeleteBusy}
          onConfirm={() => {
            setItemDeleteBusy(true);
            void deleteHobbyItemsBatch(collection.id, [...selected])
              .then(() => {
                setSelected(new Set());
                setBatchDeleteOpen(false);
                void reload();
                onChanged();
              })
              .finally(() => setItemDeleteBusy(false));
          }}
          onClose={() => {
            if (!itemDeleteBusy) setBatchDeleteOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function renderCell(
  it: HobbyItem,
  col: string,
  collection: HobbyCollection
): ReactNode {
  if (col === "shop_url" || col === "tutorial_url") {
    const raw = (it as Record<string, unknown>)[col];
    const url = typeof raw === "string" ? normalizeExternalUrl(raw) : "";
    if (!url) return "—";
    const label = col === "shop_url" ? "Open shop" : "Open tutorial";
    return (
      <a
        className="hobbies-collection__ext-link"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <IconExternalLink />
      </a>
    );
  }
  if (col === "missing" || col === "duplicates") {
    const list = (it[col as "missing" | "duplicates"] || []) as string[];
    return list.length ? list.join(", ") : "—";
  }
  if (col === "completion_pct") {
    return it.completion_pct != null ? `${it.completion_pct}%` : "—";
  }
  if (col === "quantity" && collection.preset === "marbles") {
    return it.quantity;
  }
  const val = (it as Record<string, unknown>)[col];
  if (val == null || val === "") return "—";
  return String(val);
}

function HobbyItemModal({
  collection,
  item,
  onClose,
  onSaved,
}: {
  collection: HobbyCollection;
  item: HobbyItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fields = collection.fields;
  const [form, setForm] = useState<Record<string, unknown>>(() => ({
    title: item?.title ?? "",
    brand: item?.brand ?? "",
    theme: item?.theme ?? "",
    type: item?.type ?? "",
    category: item?.category ?? "",
    size: item?.size ?? "",
    style: item?.style ?? "",
    quantity: item?.quantity ?? 1,
    total_slots: item?.total_slots ?? "",
    box_size: item?.box_size ?? "",
    missing: (item?.missing || []).join(", "),
    duplicates: (item?.duplicates || []).join(", "),
    image_url: item?.image_url ?? "",
    shop_url: item?.shop_url ?? "",
    tutorial_url: item?.tutorial_url ?? "",
    notes: item?.notes ?? "",
  }));
  const [options, setOptions] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);

  useEffect(() => {
    const dropdownFields = ["type", "size", "style", "theme", "category", "brand"];
    void Promise.all(
      dropdownFields
        .filter((f) => fields.includes(f))
        .map(async (f) => {
          const res = await fetchHobbyFieldOptions(collection.id, f);
          return [f, res.options] as const;
        })
    ).then((pairs) => {
      const map: Record<string, string[]> = {};
      for (const [f, opts] of pairs) map[f] = opts;
      setOptions(map);
    });
  }, [collection.id, fields]);

  function setField(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      for (const f of fields) {
        if (f === "image") continue;
        if (f === "missing" || f === "duplicates") {
          const raw = String(form[f] ?? "");
          body[f] = raw
            .split(/[,|;]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          continue;
        }
        if (f === "quantity" || f === "total_slots") {
          const raw = form[f];
          body[f] =
            raw === "" || raw == null ? (f === "quantity" ? 1 : null) : Number(raw);
          continue;
        }
        if (f in form) body[f === "image" ? "image_url" : f] = form[f] || null;
      }
      if ("image_url" in form) body.image_url = form.image_url || null;

      let saved: HobbyItem;
      if (item) {
        saved = await updateHobbyItem(collection.id, item.id, body);
      } else {
        saved = await createHobbyItem(collection.id, body);
      }
      if (pendingImage && saved.id && !saved.deleted) {
        await uploadHobbyItemImage(collection.id, saved.id, pendingImage);
      }
      // Remember new dropdown values
      for (const f of ["type", "size", "style", "theme", "category", "brand"]) {
        const v = String(form[f] || "").trim();
        if (v) {
          void addHobbyFieldOption(collection.id, f, v).catch(() => {});
        }
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-admin-modal hobbies-item-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>{item ? "Edit item" : "Add item"}</h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="artist-admin-form">
          {fields.map((f) => {
            if (f === "image") {
              return (
                <label key={f} className="hobbies-item-modal__image-field">
                  Image
                  <div className="hobbies-item-modal__image-row">
                    <input
                      ref={imageRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) =>
                        setPendingImage(e.target.files?.[0] ?? null)
                      }
                    />
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => imageRef.current?.click()}
                    >
                      {pendingImage ? pendingImage.name : "Choose file…"}
                    </button>
                    <span className="muted hobbies-item-modal__image-or">
                      or
                    </span>
                    <input
                      className="hobbies-item-modal__image-url"
                      value={String(form.image_url ?? "")}
                      onChange={(e) => setField("image_url", e.target.value)}
                      placeholder="Add image URL"
                    />
                  </div>
                </label>
              );
            }
            if (f === "missing" || f === "duplicates" || f === "notes") {
              return (
                <label key={f}>
                  {fieldLabel(f, collection.preset)}
                  <textarea
                    value={String(form[f] ?? "")}
                    onChange={(e) => setField(f, e.target.value)}
                    rows={2}
                    placeholder={
                      f === "missing" || f === "duplicates"
                        ? "Comma-separated tags"
                        : undefined
                    }
                  />
                </label>
              );
            }
            const isDropdown = [
              "type",
              "size",
              "style",
              "theme",
              "category",
              "brand",
            ].includes(f);
            if (isDropdown) {
              const list = options[f] || [];
              return (
                <label key={f}>
                  {fieldLabel(f, collection.preset)}
                  <input
                    list={`hobby-opts-${f}`}
                    value={String(form[f] ?? "")}
                    onChange={(e) => setField(f, e.target.value)}
                    placeholder={
                      f === "size" && collection.preset === "puzzle"
                        ? "e.g. 1000"
                        : undefined
                    }
                  />
                  <datalist id={`hobby-opts-${f}`}>
                    {list.map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </label>
              );
            }
            const placeholder =
              f === "shop_url" || f === "tutorial_url"
                ? "https://…"
                : undefined;
            return (
              <label key={f}>
                {fieldLabel(f, collection.preset)}
                <input
                  type={
                    f === "quantity" || f === "total_slots" ? "number" : "text"
                  }
                  value={String(form[f] ?? "")}
                  onChange={(e) => setField(f, e.target.value)}
                  placeholder={placeholder}
                />
              </label>
            );
          })}
          {collection.preset === "fillable_album" && form.total_slots ? (
            <p className="muted">
              Collected / completion update from total slots − missing tags.
            </p>
          ) : null}
        </div>
        <div className="modal-actions-row">
          <span className="modal-actions__spacer" />
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
