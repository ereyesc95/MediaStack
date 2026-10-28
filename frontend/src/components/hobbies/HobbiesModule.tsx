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
  createHobbyCustomCollection,
  createHobbyItem,
  deleteHobbyCollection,
  deleteHobbyItem,
  deleteHobbyItemsBatch,
  downloadHobbyTemplateXlsx,
  ensureHobbyCollection,
  exportHobbyXlsx,
  fetchHobbyCollections,
  fetchHobbyFieldCatalog,
  fetchHobbyFieldOptions,
  fetchHobbyFranchiseOptions,
  fetchHobbyItems,
  fetchHobbyPresets,
  fetchHobbyThemeItems,
  fetchHobbyThemes,
  previewHobbyImport,
  updateHobbyCollection,
  updateHobbyItem,
  uploadHobbyCollectionIcon,
  uploadHobbyItemImage,
  type HobbyCollection,
  type HobbyCustomFieldDef,
  type HobbyFieldCatalogEntry,
  type HobbyItem,
  type HobbyPreset,
} from "../../api";
import { getStoredProfile } from "../../auth";
import {
  pushHobbiesCollectionRoute,
  pushHobbiesRootRoute,
  pushHobbiesThemesRoute,
  type HobbiesHubTab,
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
  if (col === "pdf_url") return it.pdf_url ? 1 : 0;
  if (
    col === "quantity" ||
    col === "total_slots" ||
    col === "items_collected" ||
    col === "year"
  ) {
    const n = Number((it as Record<string, unknown>)[col]);
    return Number.isFinite(n) ? n : -Infinity;
  }
  if (col === "completion_pct") return it.completion_pct ?? -Infinity;
  if (col === "missing" || col === "duplicates") {
    return ((it[col as "missing" | "duplicates"] || []) as string[]).join(", ");
  }
  if (col.startsWith("custom_")) {
    const extra = (it as { extra?: Record<string, string> }).extra;
    return extra?.[col] ?? (it as Record<string, unknown>)[col] ?? "";
  }
  const val = (it as Record<string, unknown>)[col];
  return val == null ? "" : String(val);
}

type Props = {
  mediaOptions: MediaOption[];
  onSelectMedia: (opt: MediaOption) => void;
  collectionId?: number;
  /** Hub tab when not inside a collection (`/hobbies` vs `/hobbies/themes`). */
  hubTab?: HobbiesHubTab;
  busy?: string;
  isAdmin?: boolean;
  onSwitchProfile?: () => void;
  onEditProfile?: () => void;
  onImport?: () => void;
  onSync?: () => void;
  onChooseSource?: () => void;
};

const THEMES_TABLE_COLS = [
  "title",
  "collection",
  "brand",
  "type_category",
  "year",
  "shop_url",
] as const;

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  year: "Year",
  brand: "Brand",
  theme: "Theme",
  type: "Type",
  category: "Category",
  size: "Size",
  style: "Style",
  quantity: "Quantity",
  total_slots: "Total slots",
  items_collected: "Collected",
  completion_pct: "Complete %",
  box_size: "Box size",
  missing: "Missing",
  duplicates: "Duplicates",
  image: "Image",
  shop_url: "Shop",
  tutorial_url: "Tutorial",
  pdf_url: "PDF",
  collection: "Collection",
  type_category: "Type",
  notes: "Notes",
};

/** Album table column order (image is rendered as the leading fixed column). */
const ALBUM_TABLE_COLS = [
  "title",
  "year",
  "brand",
  "theme",
  "type",
  "total_slots",
  "missing",
  "items_collected",
  "completion_pct",
  "shop_url",
  "pdf_url",
] as const;

function fieldLabel(
  col: string,
  preset?: string,
  labels?: Record<string, string> | null
): string {
  if (labels?.[col]) return labels[col];
  if (col === "size" && preset === "puzzle") return "Pieces";
  if (col.startsWith("custom_")) return col.replace(/^custom_/, "").replace(/_/g, " ");
  return FIELD_LABELS[col] || col;
}

function mergeUniqueOptions(...lists: string[][]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const raw of list) {
      const val = String(raw || "").trim();
      if (!val) continue;
      const key = val.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(val);
    }
  }
  return out;
}

export default function HobbiesModule({
  mediaOptions,
  onSelectMedia,
  collectionId,
  hubTab = "home",
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
  /** Stays after leaving a collection for Home/Themes; replaced only by another open. */
  const [pinnedId, setPinnedId] = useState<number | undefined>(collectionId);
  const [activeHubTab, setActiveHubTab] = useState<HobbiesHubTab>(hubTab);
  const [collectionMenu, setCollectionMenu] =
    useState<HobbyCollectionMenu | null>(null);
  const [editorOpen, setEditorOpen] = useState<
    null | "new" | HobbyCollection
  >(null);
  const nsfwUnlocked = Boolean(getStoredProfile()?.nsfw_unlocked);

  useEffect(() => {
    setActiveId(collectionId);
    if (collectionId != null) setPinnedId(collectionId);
  }, [collectionId]);

  useEffect(() => {
    if (collectionId == null) setActiveHubTab(hubTab);
  }, [hubTab, collectionId]);

  const active = useMemo(
    () => collections.find((c) => c.id === activeId) ?? null,
    [collections, activeId]
  );

  const pinned = useMemo(
    () =>
      pinnedId != null
        ? collections.find((c) => c.id === pinnedId) ?? null
        : null,
    [collections, pinnedId]
  );

  const byPreset = useMemo(() => {
    const map = new Map<string, HobbyCollection>();
    for (const c of collections) map.set(c.preset, c);
    return map;
  }, [collections]);

  type HubTile =
    | { kind: "preset"; key: string; label: string; preset: HobbyPreset; collection?: HobbyCollection }
    | { kind: "collection"; key: string; label: string; collection: HobbyCollection };

  const hubTiles = useMemo(() => {
    const hidden = new Set(hiddenPrivatePresets);
    const tiles: HubTile[] = [];
    for (const p of presets) {
      if (hidden.has(p.id)) continue;
      if (p.id === "generic" || p.id === "custom") continue;
      tiles.push({
        kind: "preset",
        key: `preset:${p.id}`,
        label: p.label,
        preset: p,
        collection: byPreset.get(p.id),
      });
    }
    for (const c of collections) {
      if (c.preset === "custom" || c.preset === "generic" || c.is_custom) {
        tiles.push({
          kind: "collection",
          key: `col:${c.id}`,
          label: c.name,
          collection: c,
        });
      }
    }
    tiles.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
    return tiles;
  }, [presets, hiddenPrivatePresets, collections, byPreset]);

  function goHome() {
    pushHobbiesRootRoute();
    setActiveId(undefined);
    setActiveHubTab("home");
    setCollectionMenu(null);
  }

  function goThemes() {
    pushHobbiesThemesRoute();
    setActiveId(undefined);
    setActiveHubTab("themes");
    setCollectionMenu(null);
  }

  function openCollection(id: number) {
    pushHobbiesCollectionRoute(id);
    setActiveId(id);
    setPinnedId(id);
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
            active: activeId == null && activeHubTab === "home",
            onClick: () => goHome(),
          },
          {
            id: "themes",
            label: "THEMES",
            active: activeId == null && activeHubTab === "themes",
            onClick: () => goThemes(),
          },
          ...(pinned
            ? [
                {
                  id: "collection",
                  label: pinned.name.toUpperCase(),
                  active: activeId === pinned.id,
                  onClick: () => openCollection(pinned.id),
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
              onNewHobbyCollection={
                activeId == null && activeHubTab === "home"
                  ? () => setEditorOpen("new")
                  : undefined
              }
              onEditHobbyCollection={
                active
                  ? () => setEditorOpen(active)
                  : undefined
              }
              showManageCollection={Boolean(collectionMenu)}
              manageCollectionLabel="My collections"
              collectionAddLabel="Add item"
              editHobbyCollectionLabel="Edit"
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
        {activeId == null && activeHubTab === "themes" ? (
          <HobbyThemesView onOpenCollection={openCollection} />
        ) : activeId == null ? (
          <div className="hobbies-hub">
            {loading ? <p className="muted hobbies-hub__status">Loading…</p> : null}
            {hubError ? <p className="error hobbies-hub__status">{hubError}</p> : null}
            <div className="hobbies-hub__grid">
              {hubTiles.map((tile) => {
                if (tile.kind === "collection") {
                  const col = tile.collection;
                  const coverUrl = col.icon_url || null;
                  const status =
                    col.item_count === 0
                      ? "Empty"
                      : `${col.item_count} item${
                          col.item_count === 1 ? "" : "s"
                        }`;
                  return (
                    <button
                      key={tile.key}
                      type="button"
                      className="hobbies-hub__card"
                      title={tile.label}
                      onClick={() => openCollection(col.id)}
                      aria-label={`${tile.label}, ${status}`}
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
                        {coverUrl ? (
                          <img
                            src={withMediaAccess(coverUrl)}
                            alt=""
                            className="hobbies-hub__card-logo"
                          />
                        ) : (
                          <span className="hobbies-hub__card-name">
                            {tile.label}
                          </span>
                        )}
                        <span className="hobbies-hub__card-meta">{status}</span>
                      </span>
                    </button>
                  );
                }
                const p = tile.preset;
                const col = tile.collection;
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
                    key={tile.key}
                    type="button"
                    className="hobbies-hub__card"
                    title={tile.label}
                    disabled={busyTile || openingPreset != null}
                    onClick={() => void openPreset(p.id)}
                    aria-label={`${tile.label}, ${status}`}
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
                        <span className="hobbies-hub__card-name">
                          {tile.label}
                        </span>
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
              const deletedId = activeId;
              void reloadCollections().then(() => {
                if (deletedId != null && pinnedId === deletedId) {
                  setPinnedId(undefined);
                }
                goHome();
              });
            }}
          />
        ) : (
          <p className="muted">Collection not found.</p>
        )}
      </div>
      {editorOpen != null ? (
        <HobbyCollectionEditorModal
          mode={editorOpen === "new" ? "create" : "edit"}
          collection={editorOpen === "new" ? null : editorOpen}
          onClose={() => setEditorOpen(null)}
          onSaved={async (col) => {
            const wasCreate = editorOpen === "new";
            setEditorOpen(null);
            await reloadCollections();
            if (wasCreate && col?.id) openCollection(col.id);
          }}
        />
      ) : null}
    </div>
  );
}

function applyComputedFieldDeps(
  selected: Set<string>,
  catalog: HobbyFieldCatalogEntry[]
): Set<string> {
  const next = new Set(selected);
  const byKey = new Map(catalog.map((f) => [f.key, f]));
  if (next.has("pdf_url")) {
    for (const dep of ["title", "year", "theme"]) next.add(dep);
  }
  if (next.has("items_collected") || next.has("completion_pct")) {
    for (const dep of ["total_slots", "missing"]) next.add(dep);
  }
  // Drop unknown keys except custom_*
  for (const key of [...next]) {
    if (!byKey.has(key) && !key.startsWith("custom_")) next.delete(key);
  }
  return next;
}

function HobbyCollectionEditorModal({
  mode,
  collection,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  collection: HobbyCollection | null;
  onClose: () => void;
  onSaved: (col: HobbyCollection | null) => void | Promise<void>;
}) {
  const [catalog, setCatalog] = useState<HobbyFieldCatalogEntry[]>([]);
  const [name, setName] = useState(collection?.name || "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customFields, setCustomFields] = useState<HobbyCustomFieldDef[]>(
    () => collection?.custom_fields || []
  );
  const [newCustomLabel, setNewCustomLabel] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iconRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchHobbyFieldCatalog().then((data) => {
      if (cancelled) return;
      const fields = data.fields || [];
      setCatalog(fields);
      if (mode === "create") {
        setSelected(
          new Set(data.default_fields || fields.filter((f) => f.default_on).map((f) => f.key))
        );
      } else if (collection) {
        setSelected(new Set(collection.fields || []));
        setCustomFields(collection.custom_fields || []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mode, collection]);

  useEffect(() => {
    if (!iconFile) {
      setIconPreview(null);
      return;
    }
    const url = URL.createObjectURL(iconFile);
    setIconPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [iconFile]);

  function toggleField(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return applyComputedFieldDeps(next, catalog);
    });
  }

  function addCustomColumn() {
    const label = newCustomLabel.trim();
    if (!label) return;
    const key = `custom_${label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 32) || "field"}`;
    let unique = key;
    let n = 2;
    const used = new Set([
      ...catalog.map((f) => f.key),
      ...customFields.map((f) => f.key),
    ]);
    while (used.has(unique)) {
      unique = `${key}_${n}`.slice(0, 48);
      n += 1;
    }
    setCustomFields((prev) => [...prev, { key: unique, label }]);
    setSelected((prev) => new Set(prev).add(unique));
    setNewCustomLabel("");
  }

  async function save() {
    const title = name.trim();
    if (!title) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fields = [
        ...catalog.map((f) => f.key).filter((k) => selected.has(k)),
        ...customFields.map((f) => f.key).filter((k) => selected.has(k)),
      ];
      const customPayload = customFields.filter((f) => selected.has(f.key));
      let saved: HobbyCollection;
      if (mode === "create") {
        saved = await createHobbyCustomCollection({
          name: title,
          fields,
          custom_fields: customPayload,
          icon: iconFile,
        });
      } else if (collection) {
        saved = await updateHobbyCollection(collection.id, {
          name: title,
          fields,
          custom_fields: customPayload,
          set_fields: true,
        });
        if (iconFile) {
          saved = await uploadHobbyCollectionIcon(collection.id, iconFile);
        }
      } else {
        throw new Error("Missing collection");
      }
      await onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const existingIcon =
    !iconPreview && collection?.icon_path && collection.icon_url
      ? withMediaAccess(collection.icon_url)
      : null;
  const shownIcon = iconPreview || existingIcon;

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-admin-modal hobbies-collection-editor"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>{mode === "create" ? "New collection" : "Edit collection"}</h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="artist-admin-form">
          <div className="hobbies-collection-editor__identity">
            <input
              ref={iconRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => setIconFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className={`hobbies-collection-editor__icon${
                shownIcon ? " hobbies-collection-editor__icon--filled" : ""
              }`}
              onClick={() => iconRef.current?.click()}
              aria-label={shownIcon ? "Change image" : "Add image"}
            >
              {shownIcon ? (
                <>
                  <img src={shownIcon} alt="" />
                  <span className="hobbies-collection-editor__icon-overlay" aria-hidden>
                    Change
                  </span>
                </>
              ) : (
                <>
                  <span className="hobbies-collection-editor__icon-plus" aria-hidden>
                    +
                  </span>
                  <span className="hobbies-collection-editor__icon-caption">
                    Add image
                  </span>
                </>
              )}
            </button>
            <input
              className="hobbies-collection-editor__name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name of collection"
              aria-label="Name of collection"
              autoFocus
            />
          </div>
          <fieldset className="hobbies-collection-editor__fields">
            <legend>Columns</legend>
            <div className="hobbies-collection-editor__grid">
              {catalog.map((f) => (
                <label
                  key={f.key}
                  className="ms-checkbox hobbies-collection-editor__check"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(f.key)}
                    onChange={() => toggleField(f.key)}
                  />
                  <span className="ms-checkbox__box" aria-hidden="true" />
                  <span className="ms-checkbox__label">
                    {f.label}
                    {f.computed && f.key !== "pdf_url" ? " (auto)" : ""}
                  </span>
                </label>
              ))}
              {customFields.map((f) => (
                <label
                  key={f.key}
                  className="ms-checkbox hobbies-collection-editor__check"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(f.key)}
                    onChange={() => toggleField(f.key)}
                  />
                  <span className="ms-checkbox__box" aria-hidden="true" />
                  <span className="ms-checkbox__label">{f.label}</span>
                </label>
              ))}
              <div className="hobbies-collection-editor__add-custom">
                <input
                  value={newCustomLabel}
                  onChange={(e) => setNewCustomLabel(e.target.value)}
                  placeholder="New column"
                  aria-label="New column name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomColumn();
                    }
                  }}
                />
                <button
                  type="button"
                  className="hobbies-collection-editor__add-btn"
                  onClick={addCustomColumn}
                  disabled={!newCustomLabel.trim()}
                  title="Add column"
                  aria-label="Add column"
                >
                  ✓
                </button>
              </div>
            </div>
          </fieldset>
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

function HobbyThemesView({
  onOpenCollection,
}: {
  onOpenCollection: (id: number) => void;
}) {
  const [themes, setThemes] = useState<{ theme: string; item_count: number }[]>(
    []
  );
  const [selectedTheme, setSelectedTheme] = useState<string>("");
  const [items, setItems] = useState<HobbyItem[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [sort, setSort] = useState<SortState>({ col: "title", dir: "asc" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingThemes(true);
    setError(null);
    void fetchHobbyThemes()
      .then((data) => {
        if (cancelled) return;
        const list = data.themes || [];
        setThemes(list);
        setSelectedTheme((prev) => {
          if (prev && list.some((t) => t.theme === prev)) return prev;
          return list[0]?.theme || "";
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setThemes([]);
          setSelectedTheme("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingThemes(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedTheme) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoadingItems(true);
    void fetchHobbyThemeItems(selectedTheme)
      .then((data) => {
        if (!cancelled) setItems(data.items || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingItems(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTheme]);

  const sortedItems = useMemo(() => {
    const list = [...items];
    const mul = sort.dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const va = themesCellSortValue(a, sort.col);
      const vb = themesCellSortValue(b, sort.col);
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

  return (
    <div className="hobbies-collection hobbies-themes">
      <div className="hobbies-themes__toolbar">
        <label className="hobbies-themes__theme-picker">
          Theme
          <select
            value={selectedTheme}
            disabled={loadingThemes || themes.length === 0}
            onChange={(e) => setSelectedTheme(e.target.value)}
          >
            {themes.length === 0 ? (
              <option value="">No themes yet</option>
            ) : (
              themes.map((t) => (
                <option key={t.theme} value={t.theme}>
                  {t.theme} ({t.item_count})
                </option>
              ))
            )}
          </select>
        </label>
      </div>
      {error ? <p className="error hobbies-hub__status">{error}</p> : null}
      <div className="hobbies-collection__table-wrap">
        <table className="hobbies-collection__table">
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  className="hobbies-collection__sort-btn"
                  onClick={() => toggleSort("image")}
                >
                  Image{sortMark("image")}
                </button>
              </th>
              {THEMES_TABLE_COLS.map((col) => (
                <th key={col}>
                  <button
                    type="button"
                    className="hobbies-collection__sort-btn"
                    onClick={() => toggleSort(col)}
                  >
                    {FIELD_LABELS[col] || col}
                    {sortMark(col)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingThemes || loadingItems ? (
              <tr>
                <td colSpan={THEMES_TABLE_COLS.length + 1} className="muted">
                  Loading…
                </td>
              </tr>
            ) : !selectedTheme ? (
              <tr>
                <td colSpan={THEMES_TABLE_COLS.length + 1} className="muted">
                  Add a Theme on collection items to group them here.
                </td>
              </tr>
            ) : sortedItems.length === 0 ? (
              <tr>
                <td colSpan={THEMES_TABLE_COLS.length + 1} className="muted">
                  No items for this theme.
                </td>
              </tr>
            ) : (
              sortedItems.map((it) => (
                <tr
                  key={`${it.collection_id}-${it.id}`}
                  className="hobbies-collection__row"
                >
                  <td>
                    {it.image ? (
                      <img
                        src={withMediaAccess(String(it.image))}
                        alt=""
                        className="hobbies-collection__thumb"
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  {THEMES_TABLE_COLS.map((col) => (
                    <td key={col}>
                      {renderThemesCell(it, col, onOpenCollection)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function themesCellSortValue(it: HobbyItem, col: string): string | number {
  if (col === "image") return it.image ? 1 : 0;
  if (col === "collection") return it.collection_name || "";
  if (col === "type_category") return it.type || it.category || "";
  if (col === "year") return it.year ?? -Infinity;
  if (col === "shop_url") return it.shop_url || "";
  const val = (it as Record<string, unknown>)[col];
  return val == null ? "" : String(val);
}

function renderThemesCell(
  it: HobbyItem,
  col: string,
  onOpenCollection: (id: number) => void
): ReactNode {
  if (col === "collection") {
    const name = it.collection_name || "Collection";
    const id = it.collection_id;
    if (!id) return name;
    return (
      <button
        type="button"
        className="hobbies-themes__collection-link"
        onClick={() => onOpenCollection(id)}
      >
        {name}
      </button>
    );
  }
  if (col === "type_category") {
    const val = (it.type || it.category || "").trim();
    return val || "—";
  }
  if (col === "year") {
    return it.year != null ? String(it.year) : "—";
  }
  if (col === "shop_url") {
    const url = normalizeExternalUrl(it.shop_url || "");
    if (!url) return "—";
    return (
      <a
        className="hobbies-collection__ext-link"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        aria-label="Open shop"
        onClick={(e) => e.stopPropagation()}
      >
        <IconExternalLink />
      </a>
    );
  }
  const val = (it as Record<string, unknown>)[col];
  if (val == null || val === "") return "—";
  return String(val);
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
  const fieldLabels = collection.field_labels || null;

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
    const enabled = fields.filter((f) => f !== "image" && f !== "notes");
    // Prefer album-style order when those columns are enabled.
    const preferred = ALBUM_TABLE_COLS.filter((c) => enabled.includes(c));
    const rest = enabled.filter((c) => !preferred.includes(c as typeof ALBUM_TABLE_COLS[number]));
    return preferred.length ? [...preferred, ...rest] : enabled;
  }, [fields]);

  const missingTotal = useMemo(() => {
    if (!fields.includes("missing")) return 0;
    return items.reduce((sum, it) => sum + (it.missing?.length || 0), 0);
  }, [fields, items]);

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
                    {col === "missing" && missingTotal > 0
                      ? `Missing (${missingTotal})`
                      : fieldLabel(col, collection.preset, fieldLabels)}
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
  if (col === "pdf_url") {
    const url = (it.pdf_url || "").trim();
    if (!url) {
      return (
        <span
          className="hobbies-collection__ext-link hobbies-collection__ext-link--disabled"
          title="PDF not found in Books"
          aria-label="PDF not found"
          aria-disabled="true"
        >
          <IconExternalLink />
        </span>
      );
    }
    return (
      <a
        className="hobbies-collection__ext-link"
        href={withMediaAccess(url)}
        target="_blank"
        rel="noopener noreferrer"
        title="Open PDF"
        aria-label="Open PDF"
        onClick={(e) => e.stopPropagation()}
      >
        <IconExternalLink />
      </a>
    );
  }
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
  if (col === "year") {
    return it.year != null ? String(it.year) : "—";
  }
  if (col === "quantity" && collection.preset === "marbles") {
    return it.quantity;
  }
  if (col.startsWith("custom_")) {
    const extra = (it as { extra?: Record<string, string> }).extra;
    const val = extra?.[col] ?? (it as Record<string, unknown>)[col];
    if (val == null || val === "") return "—";
    return String(val);
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
  const fields = collection.fields.filter(
    (f) => f !== "items_collected" && f !== "completion_pct" && f !== "pdf_url"
  );
  const fieldLabels = collection.field_labels || null;
  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const extra = (item as { extra?: Record<string, string> } | null)?.extra || {};
    const base: Record<string, unknown> = {
      title: item?.title ?? "",
      year: item?.year ?? "",
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
    };
    for (const f of collection.fields) {
      if (f.startsWith("custom_")) {
        base[f] =
          extra[f] ??
          (item as Record<string, unknown> | null)?.[f] ??
          "";
      }
    }
    return base;
  });
  const [options, setOptions] = useState<Record<string, string[]>>({});
  const [franchiseOptions, setFranchiseOptions] = useState<string[]>([]);
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
    if (fields.includes("theme")) {
      void fetchHobbyFranchiseOptions()
        .then((res) => setFranchiseOptions(res.options || []))
        .catch(() => setFranchiseOptions([]));
    }
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
        if (f === "quantity" || f === "total_slots" || f === "year") {
          const raw = form[f];
          body[f] =
            raw === "" || raw == null
              ? f === "quantity"
                ? 1
                : null
              : Number(raw);
          continue;
        }
        if (f.startsWith("custom_")) {
          body[f] = String(form[f] ?? "").trim() || null;
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
                  {fieldLabel(f, collection.preset, fieldLabels)}
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
              const remembered = options[f] || [];
              const list =
                f === "theme"
                  ? mergeUniqueOptions(franchiseOptions, remembered)
                  : remembered;
              return (
                <label key={f}>
                  {fieldLabel(f, collection.preset, fieldLabels)}
                  <input
                    list={`hobby-opts-${f}`}
                    value={String(form[f] ?? "")}
                    onChange={(e) => setField(f, e.target.value)}
                    placeholder={
                      f === "theme"
                        ? "Franchise name (e.g. Super Mario)"
                        : f === "size" && collection.preset === "puzzle"
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
                {fieldLabel(f, collection.preset, fieldLabels)}
                <input
                  type={
                    f === "quantity" || f === "total_slots" || f === "year"
                      ? "number"
                      : "text"
                  }
                  value={String(form[f] ?? "")}
                  onChange={(e) => setField(f, e.target.value)}
                  placeholder={
                    f === "year" ? "e.g. 2018" : placeholder
                  }
                  min={f === "year" ? 1000 : undefined}
                  max={f === "year" ? 9999 : undefined}
                />
              </label>
            );
          })}
          {fields.includes("total_slots") && form.total_slots ? (
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
