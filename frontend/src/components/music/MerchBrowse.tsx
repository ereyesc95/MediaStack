import {
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
} from "react";
import {
  createMerchCategory,
  deleteMerchCategory,
  fetchMerch,
  fetchMerchCategories,
  updateMerchCategory,
  type MerchCategory,
  type MerchItem,
  type MerchOrientation,
} from "../../api";
import { formatTrackDate } from "../../formatDate";
import { withMediaAccess } from "../../mediaFileUrl";
import {
  IconCardCover,
  IconCardLandscape,
  IconCardPortrait,
  IconSearch,
} from "../MenuIcons";
import ModalPortal from "../ModalPortal";
import SearchableDropdown from "../SearchableDropdown";
import GalleryViewerModal, {
  type GalleryViewerItem,
} from "./artist/GalleryViewerModal";

function FlipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5a5 5 0 0 1-5 5c-1.85 0-3.47-.99-4.35-2.47l-1.72 1A6.98 6.98 0 0 0 12 20c3.87 0 7-3.13 7-7s-3.13-7-7-7z"
      />
    </svg>
  );
}

function eventTitle(item: MerchItem): string {
  const place = [item.city, item.venue].filter(Boolean).join(", ");
  return place || item.tour_title || "Show";
}

function eventDateLabel(item: MerchItem): string {
  return formatTrackDate(item.date_iso) || item.date_iso || "";
}

export type MerchBrowseApi = {
  openCategories: () => void;
};

type Props = {
  isAdmin?: boolean;
  manageApiRef?: MutableRefObject<MerchBrowseApi | null>;
  onOpenArtist?: (bandId: number, name?: string) => void;
  onOpenShow?: (item: MerchItem) => void;
};

const ORIENT_OPTS: {
  id: MerchOrientation;
  label: string;
  Icon: typeof IconCardCover;
}[] = [
  { id: "landscape", label: "Landscape", Icon: IconCardLandscape },
  { id: "portrait", label: "Portrait", Icon: IconCardPortrait },
  { id: "square", label: "Square", Icon: IconCardCover },
];

export default function MerchBrowse({
  isAdmin = false,
  manageApiRef,
  onOpenArtist,
  onOpenShow,
}: Props) {
  const [categories, setCategories] = useState<MerchCategory[]>([]);
  const [items, setItems] = useState<MerchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!manageApiRef) return;
    manageApiRef.current = {
      openCategories: () => setSettingsOpen(true),
    };
    return () => {
      manageApiRef.current = null;
    };
  }, [manageApiRef]);

  function reload() {
    return fetchMerch().then((data) => {
      setCategories(data.categories || []);
      setItems(data.items || []);
      const cats = data.categories || [];
      setActiveCategoryId((prev) => {
        if (prev != null && cats.some((c) => c.id === prev)) return prev;
        return cats[0]?.id ?? null;
      });
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void reload()
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCategory = useMemo(
    () => categories.find((c) => c.id === activeCategoryId) ?? null,
    [categories, activeCategoryId]
  );

  const orientation = (
    activeCategory?.orientation || "square"
  ).toLowerCase() as MerchOrientation;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (activeCategoryId != null && it.category_id !== activeCategoryId) {
        return false;
      }
      if (!q) return true;
      const hay =
        `${it.label} ${it.band_name} ${it.event_label} ${it.category_label}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, activeCategoryId, search]);

  const galleryItems: GalleryViewerItem[] = useMemo(
    () =>
      filtered.map((it) => {
        const isFlipped = Boolean(flipped[it.id]);
        const showUrl =
          isFlipped && it.back_url ? it.back_url : it.url;
        return {
          id: it.id,
          url: withMediaAccess(showUrl) || showUrl,
          caption: eventTitle(it),
          subcaption: it.band_name,
          mediaType: "image" as const,
          captionClickable: true,
          subcaptionClickable: true,
        };
      }),
    [filtered, flipped]
  );

  return (
    <div className="merch-browse">
      <div className="merch-browse__subbar filter-subbar">
        <div className="merch-browse__tabs" role="tablist" aria-label="Merch categories">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={activeCategoryId === c.id}
              className={`merch-browse__tab${
                activeCategoryId === c.id ? " is-active" : ""
              }`}
              onClick={() => setActiveCategoryId(c.id)}
            >
              {c.label}
              <span className="merch-browse__tab-count">{c.count ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="filter-subbar-search-wrap merch-browse__search">
          <IconSearch className="filter-subbar-search-icon" aria-hidden />
          <input
            className="filter-subbar-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search merch…"
            aria-label="Search merch"
          />
        </div>
      </div>

      {loading ? <p className="muted merch-browse__status">Loading merch…</p> : null}
      {error ? <p className="error merch-browse__status">{error}</p> : null}
      {!loading && !error && filtered.length === 0 ? (
        <p className="muted merch-browse__status">No merch items yet.</p>
      ) : null}

      <div
        className={`merch-browse__grid merch-browse__grid--${orientation}`}
      >
        {filtered.map((item, idx) => {
          const canFlip = Boolean(item.has_back && item.back_url);
          const isFlipped = Boolean(flipped[item.id]);
          const imgUrl =
            isFlipped && item.back_url ? item.back_url : item.url;
          const title = eventTitle(item);
          const dateLine = eventDateLabel(item);
          return (
            <article
              key={item.id}
              className={`merch-browse__card merch-browse__card--${orientation}${
                canFlip ? " merch-browse__card--flippable" : ""
              }${isFlipped ? " merch-browse__card--flipped" : ""}`}
            >
              <div
                className="merch-browse__card-media"
                role="button"
                tabIndex={0}
                title={item.label}
                onClick={() => setViewerIndex(idx)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setViewerIndex(idx);
                  }
                }}
              >
                <img
                  src={withMediaAccess(imgUrl)}
                  alt={item.label}
                  loading="lazy"
                  draggable={false}
                />
                <div className="merch-browse__card-hover">
                  <button
                    type="button"
                    className="merch-browse__event"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenShow?.(item);
                    }}
                    title={title}
                  >
                    {title}
                  </button>
                  {dateLine ? (
                    <span className="merch-browse__date">{dateLine}</span>
                  ) : null}
                  <button
                    type="button"
                    className="merch-browse__artist"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenArtist?.(item.band_id, item.band_name);
                    }}
                    title={item.band_name}
                  >
                    {item.logo_url ? (
                      <img
                        src={withMediaAccess(item.logo_url)}
                        alt=""
                        className="merch-browse__artist-logo"
                      />
                    ) : null}
                    <span>{item.band_name}</span>
                  </button>
                </div>
                {canFlip ? (
                  <button
                    type="button"
                    className="merch-browse__flip"
                    title="Flip"
                    aria-label="Flip card"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFlipped((prev) => ({
                        ...prev,
                        [item.id]: !prev[item.id],
                      }));
                    }}
                  >
                    <FlipIcon className="merch-browse__flip-icon" />
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {viewerIndex != null && galleryItems.length > 0 ? (
        <GalleryViewerModal
          items={galleryItems}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          onCaptionClick={(g) => {
            const match = filtered.find((it) => it.id === g.id);
            if (match) {
              setViewerIndex(null);
              onOpenShow?.(match);
            }
          }}
          onSubcaptionClick={(g) => {
            const match = filtered.find((it) => it.id === g.id);
            if (match) {
              setViewerIndex(null);
              onOpenArtist?.(match.band_id, match.band_name);
            }
          }}
        />
      ) : null}

      {settingsOpen && isAdmin ? (
        <MerchCategoriesModal
          onClose={() => setSettingsOpen(false)}
          onChanged={() => {
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}

function MerchCategoriesModal({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<MerchCategory[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [orientation, setOrientation] = useState<MerchOrientation>("square");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    return fetchMerchCategories().then((d) => {
      const cats = d.categories || [];
      setRows(cats);
      return cats;
    });
  }

  useEffect(() => {
    void reload().then((cats) => {
      if (cats[0] && !selected) {
        setSelected(String(cats[0].id));
        setOrientation(
          ((cats[0].orientation || "square") as MerchOrientation)
        );
      }
    });
  }, []);

  useEffect(() => {
    if (selected === "__new__") {
      setCreating(true);
      setOrientation("square");
      setNewName("");
      return;
    }
    setCreating(false);
    const row = rows.find((r) => String(r.id) === selected);
    if (row) {
      setOrientation((row.orientation || "square") as MerchOrientation);
    }
  }, [selected, rows]);

  const dropdownOptions = useMemo(
    () => [
      ...rows.map((r) => ({ value: String(r.id), label: r.label })),
      { value: "__new__", label: "New category" },
    ],
    [rows]
  );

  async function saveOrientation(next: MerchOrientation) {
    setOrientation(next);
    if (creating || !selected || selected === "__new__") return;
    setBusy(true);
    setError(null);
    try {
      await updateMerchCategory(Number(selected), { orientation: next });
      await reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createCategory() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createMerchCategory({
        label: name,
        orientation,
      });
      const cats = await reload();
      setSelected(String(created.id));
      setCreating(false);
      setNewName("");
      onChanged();
      void cats;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory() {
    if (creating || !selected || selected === "__new__") return;
    const row = rows.find((r) => String(r.id) === selected);
    if (!row) return;
    if (!window.confirm(`Remove category “${row.label}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMerchCategory(row.id);
      const cats = await reload();
      setSelected(cats[0] ? String(cats[0].id) : "__new__");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-admin-modal merch-categories-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>MERCH categories</h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="artist-admin-form merch-categories-modal__form">
          <div className="merch-categories-modal__row merch-categories-modal__row--inline">
            <span>Category</span>
            <div className="merch-categories-modal__select-wrap">
              <SearchableDropdown
                options={dropdownOptions}
                value={selected || (dropdownOptions[0]?.value ?? "")}
                onChange={setSelected}
                placeholder="Choose…"
                portal
              />
            </div>
            <div className="merch-categories-modal__orient" role="group">
              {ORIENT_OPTS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`merch-categories-modal__orient-btn${
                    orientation === id ? " is-active" : ""
                  }`}
                  title={label}
                  aria-label={label}
                  aria-pressed={orientation === id}
                  disabled={busy}
                  onClick={() => void saveOrientation(id)}
                >
                  <Icon />
                </button>
              ))}
            </div>
          </div>
          {creating ? (
            <label className="merch-categories-modal__row">
              <span>Name</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Patches"
                autoFocus
              />
            </label>
          ) : null}
          <div className="modal-panel-actions modal-panel-actions--end">
            <span className="modal-actions__spacer" />
            {creating ? (
              <button
                type="button"
                className="btn"
                disabled={busy || !newName.trim()}
                onClick={() => void createCategory()}
              >
                Add
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy || !selected || selected === "__new__"}
                onClick={() => void removeCategory()}
              >
                Remove category
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
