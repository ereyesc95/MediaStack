import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import {
  commitCollectionImport,
  exportCollectionXlsx,
  fetchCollection,
  fetchCollectionFacets,
  previewCollectionImport,
} from "../../api";
import type { CollectionLeaf } from "../../types";
import CollectionModal from "./CollectionModal";
import { IconImport, IconPlus, IconSearch } from "../MenuIcons";
import {
  DiscFlipPreview,
  ExternalSearchMenu,
  HoverBubble,
  openSearchCascade,
  PhotocardFlipPreview,
  SpotifyFlip,
  useVirtualWindow,
} from "./collectionHover";

type BrowseView = "list" | "cover" | "banner";

type Props = {
  onOpenArtist?: (bandId: number) => void;
  onOpenRelease?: (bandId: number, releaseId: string) => void;
  isAdmin?: boolean;
  view?: BrowseView;
  onViewChange?: (view: BrowseView) => void;
  manageApiRef?: MutableRefObject<CollectionBrowseApi | null>;
  onInventoryChange?: (hasItems: boolean) => void;
};

export type CollectionBrowseApi = {
  openManual: () => void;
  importExcel: () => void;
  exportExcel: () => void;
};

const ROW_HEIGHT = 44;

const COLUMNS = [
  { key: "title", label: "Title" },
  { key: "artist", label: "Artist" },
  { key: "edition", label: "Edition" },
  { key: "year", label: "Year" },
  { key: "type", label: "Type" },
  { key: "genre", label: "Genre" },
  { key: "media", label: "Media" },
  { key: "animation", label: "Animation" },
  { key: "canvas", label: "Canvas" },
  { key: "autographs", label: "Autographs" },
  { key: "pending", label: "Pending" },
] as const;

const SUBFILTERS = [
  { id: "", label: "ALL" },
  { id: "pending", label: "PENDING" },
  { id: "orphan", label: "ORPHAN" },
  { id: "media", label: "MEDIA" },
  { id: "animation", label: "ANIMATION" },
  { id: "canvas", label: "CANVAS" },
  { id: "autographs", label: "AUTOGRAPHS" },
  { id: "matched", label: "MATCHED" },
  { id: "genre", label: "GENRE" },
  { id: "country", label: "COUNTRY" },
] as const;

type FacetCounts = {
  pending: number;
  orphan: number;
  autographs: number;
  matched: number;
  media: number;
  animation: number;
  canvas: number;
  genre: number;
  country: number;
};

const EMPTY_COUNTS: FacetCounts = {
  pending: 0,
  orphan: 0,
  autographs: 0,
  matched: 0,
  media: 0,
  animation: 0,
  canvas: 0,
  genre: 0,
  country: 0,
};

function GenrePills({ genres }: { genres: string[] }) {
  const list = genres || [];
  if (!list.length) return <>—</>;
  const shown = list.slice(0, 2);
  const rest = list.slice(2);
  return (
    <span className="collection-pills">
      {shown.map((g) => (
        <span key={g} className="collection-pill">
          {g}
        </span>
      ))}
      {rest.length ? (
        <HoverBubble content={<span className="collection-pill-more">{rest.join(", ")}</span>}>
          <span className="collection-pill collection-pill--more">+{rest.length}</span>
        </HoverBubble>
      ) : null}
    </span>
  );
}

function subfilterCount(id: string, counts: FacetCounts): number {
  switch (id) {
    case "pending":
      return counts.pending;
    case "orphan":
      return counts.orphan;
    case "autographs":
      return counts.autographs;
    case "matched":
      return counts.matched;
    case "media":
      return counts.media;
    case "animation":
      return counts.animation;
    case "canvas":
      return counts.canvas;
    case "genre":
      return counts.genre;
    case "country":
      return counts.country;
    default:
      return 1;
  }
}

export default function CollectionBrowse({
  onOpenArtist,
  onOpenRelease,
  isAdmin = false,
  view: viewProp,
  onViewChange,
  manageApiRef,
  onInventoryChange,
}: Props) {
  const [viewLocal] = useState<BrowseView>("list");
  const view = viewProp ?? viewLocal;

  const apiView = view === "list" ? "table" : "cards";

  const [items, setItems] = useState<CollectionLeaf[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [subfilter, setSubfilter] = useState("");
  const [mediaFilter, setMediaFilter] = useState("");
  const [animFilter, setAnimFilter] = useState("");
  const [canvasFilter, setCanvasFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [continentFilter, setContinentFilter] = useState("");
  const [sort, setSort] = useState("artist");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | "all">(30);
  const [pageSizeInput, setPageSizeInput] = useState("30");
  const [pageInput, setPageInput] = useState("1");
  const [modal, setModal] = useState<{
    mode: "edit" | "manual";
    id?: number;
  } | null>(null);
  const [importPreview, setImportPreview] = useState<{
    counts: Record<string, number>;
    rows: Record<string, unknown>[];
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [facets, setFacets] = useState<{
    media: string[];
    animation: string[];
    canvas: string[];
    subgenre_groups: {
      genre: string;
      items: { id: number | string; name: string }[];
    }[];
    country_groups: {
      continent: string;
      items: { id: number; name: string; iso?: string | null }[];
    }[];
    continents: { id: number; name: string }[];
    counts: FacetCounts;
  }>({
    media: [],
    animation: [],
    canvas: [],
    subgenre_groups: [],
    country_groups: [],
    continents: [],
    counts: EMPTY_COUNTS,
  });

  const refreshFacets = useCallback(async () => {
    try {
      const f = await fetchCollectionFacets();
      setInventoryTotal(f.total);
      setFacets({
        media: f.media || [],
        animation: f.animation || [],
        canvas: f.canvas || [],
        subgenre_groups: f.subgenre_groups || [],
        country_groups: f.country_groups || [],
        continents: f.continents || [],
        counts: { ...EMPTY_COUNTS, ...(f.counts || {}) },
      });
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const size = pageSize === "all" ? 10000 : pageSize;
      const data = await fetchCollection({
        q: q || undefined,
        subfilter: subfilter || undefined,
        media: mediaFilter || undefined,
        animation: animFilter || undefined,
        canvas: canvasFilter || undefined,
        genre: genreFilter || undefined,
        country: countryFilter || undefined,
        continent: continentFilter || undefined,
        sort,
        order,
        view: apiView,
        page: pageSize === "all" ? 1 : page,
        page_size: size,
      });
      setItems(data.items);
      setTotal(data.total);
      const unfiltered =
        !q &&
        !subfilter &&
        !mediaFilter &&
        !animFilter &&
        !canvasFilter &&
        !genreFilter &&
        !countryFilter &&
        !continentFilter;
      if (unfiltered) setInventoryTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [
    q,
    subfilter,
    mediaFilter,
    animFilter,
    canvasFilter,
    genreFilter,
    countryFilter,
    continentFilter,
    sort,
    order,
    apiView,
    page,
    pageSize,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshFacets();
  }, [refreshFacets]);

  useEffect(() => {
    const onChanged = () => {
      void load();
      void refreshFacets();
    };
    window.addEventListener("collection-changed", onChanged);
    return () => window.removeEventListener("collection-changed", onChanged);
  }, [load, refreshFacets]);

  async function onExport() {
    setBusy("Exporting…");
    try {
      const blob = await exportCollectionXlsx();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Collection.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!manageApiRef) return;
    manageApiRef.current = {
      openManual: () => setModal({ mode: "manual" }),
      importExcel: () => fileRef.current?.click(),
      exportExcel: () => void onExport(),
    };
    return () => {
      manageApiRef.current = null;
    };
  });

  const pageCount = useMemo(() => {
    if (pageSize === "all") return 1;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  useEffect(() => {
    setPageSizeInput(pageSize === "all" ? "all" : String(pageSize));
  }, [pageSize]);

  const visibleSubfilters = useMemo(() => {
    const counts = facets.counts;
    return SUBFILTERS.filter((sf) => !sf.id || subfilterCount(sf.id, counts) > 0);
  }, [facets.counts]);

  useEffect(() => {
    if (subfilter && !visibleSubfilters.some((sf) => sf.id === subfilter)) {
      setSubfilter("");
      setMediaFilter("");
      setAnimFilter("");
      setCanvasFilter("");
      setGenreFilter("");
      setCountryFilter("");
      setContinentFilter("");
      setPage(1);
    }
  }, [visibleSubfilters, subfilter]);

  const tabSubtext = useCallback(
    (id: string): string | null => {
      switch (id) {
        case "media":
          return mediaFilter || "All";
        case "animation":
          return animFilter || "All";
        case "canvas":
          return canvasFilter || "All";
        case "genre":
          return genreFilter || "All";
        case "country": {
          if (countryFilter) {
            const match = facets.country_groups
              .flatMap((g) => g.items)
              .find(
                (c) =>
                  (c.iso || "").toLowerCase() === countryFilter.toLowerCase() ||
                  (c.name || "").toLowerCase() === countryFilter.toLowerCase()
              );
            return match?.name || countryFilter;
          }
          if (continentFilter) {
            const cont = facets.continents.find(
              (c) =>
                String(c.id) === continentFilter ||
                c.name.toLowerCase() === continentFilter.toLowerCase()
            );
            return cont?.name || continentFilter;
          }
          return "All";
        }
        default:
          return null;
      }
    },
    [
      mediaFilter,
      animFilter,
      canvasFilter,
      genreFilter,
      countryFilter,
      continentFilter,
      facets.country_groups,
      facets.continents,
    ]
  );

  const emptyInventory =
    !loading && inventoryTotal === 0 && total === 0 && items.length === 0;
  const hasInventory = !loading && (inventoryTotal > 0 || items.length > 0 || total > 0);

  useEffect(() => {
    onInventoryChange?.(hasInventory);
  }, [hasInventory, onInventoryChange]);

  const visibleRows = useMemo(() => {
    return items.filter((row) => {
      if (row.row_kind === "child" && expandedGroups[row.group_key || ""] === false) {
        return false;
      }
      return true;
    });
  }, [items, expandedGroups]);

  const virtualize = pageSize === "all" && view === "list" && visibleRows.length > 80;
  const virt = useVirtualWindow(visibleRows.length, ROW_HEIGHT, virtualize);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (tableWrapRef.current) virt.setViewportEl(tableWrapRef.current);
  }, [virt, virtualize, visibleRows.length]);

  const renderRows = virtualize
    ? visibleRows.slice(virt.start, virt.end)
    : visibleRows;

  function toggleSort(key: string) {
    if (sort === key) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setOrder("asc");
    }
    setPage(1);
  }

  function selectSubfilter(id: string) {
    setSubfilter(id);
    if (id !== "media") setMediaFilter("");
    if (id !== "animation") setAnimFilter("");
    if (id !== "canvas") setCanvasFilter("");
    if (id !== "genre") setGenreFilter("");
    if (id !== "country") {
      setCountryFilter("");
      setContinentFilter("");
    }
    setPage(1);
  }

  function commitPageInput() {
    const n = parseInt(pageInput.trim(), 10);
    if (!Number.isFinite(n)) {
      setPageInput(String(page));
      return;
    }
    const clamped = Math.min(pageCount, Math.max(1, n));
    setPageInput(String(clamped));
    if (clamped !== page) setPage(clamped);
  }

  function commitPageSizeInput() {
    const raw = pageSizeInput.trim();
    if (!raw) {
      setPageSizeInput(pageSize === "all" ? "all" : String(pageSize));
      return;
    }
    if (raw.toLowerCase() === "all") {
      setPageSize("all");
      setPage(1);
      return;
    }
    const n = parseInt(raw, 10);
    if (n > 0) {
      setPageSize(Math.min(10000, n));
      setPage(1);
    } else {
      setPageSizeInput(pageSize === "all" ? "all" : String(pageSize));
    }
  }

  function navigateTitle(row: CollectionLeaf) {
    if (row.local && row.band_id && row.release_id) {
      onOpenRelease?.(row.band_id, row.release_id);
      return;
    }
    openSearchCascade("title", row.artist, row.title);
  }

  function navigateArtist(row: CollectionLeaf) {
    if (row.local && row.band_id) {
      onOpenArtist?.(row.band_id);
      return;
    }
    openSearchCascade("artist", row.artist);
  }

  function titleControl(row: CollectionLeaf) {
    if (row.local && row.band_id && row.release_id) {
      return (
        <button type="button" className="linkish" onClick={() => navigateTitle(row)}>
          {row.title}
          {row.orphan ? <span className="collection-badge">Orphan</span> : null}
        </button>
      );
    }
    return (
      <ExternalSearchMenu kind="title" artist={row.artist} title={row.title}>
        {row.title}
        {row.orphan ? <span className="collection-badge">Orphan</span> : null}
      </ExternalSearchMenu>
    );
  }

  function artistControl(row: CollectionLeaf) {
    if (row.local && row.band_id) {
      return (
        <button type="button" className="linkish" onClick={() => navigateArtist(row)}>
          {row.country_iso ? (
            <span className={`fi fi-${row.country_iso.toLowerCase()}`} aria-hidden />
          ) : null}{" "}
          {row.artist}
        </button>
      );
    }
    return (
      <ExternalSearchMenu kind="artist" artist={row.artist}>
        {row.country_iso ? (
          <span className={`fi fi-${row.country_iso.toLowerCase()}`} aria-hidden />
        ) : null}{" "}
        {row.artist}
      </ExternalSearchMenu>
    );
  }

  async function onPickImport(file: File | null) {
    if (!file) return;
    setBusy("Importing…");
    try {
      const preview = await previewCollectionImport(file);
      setImportPreview({ counts: preview.counts, rows: preview.rows });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    setBusy("Saving import…");
    try {
      await commitCollectionImport(importPreview.rows);
      setImportPreview(null);
      await load();
      await refreshFacets();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function renderCard(card: CollectionLeaf) {
    const leaf = card.versions?.[0] || card;
    const editionLine = `${leaf.edition || "—"} · ${leaf.media_type || "—"}`;
    return (
      <article
        key={card.group_key || `${card.artist}-${card.title}-${card.id}`}
        className="collection-card"
      >
        {card.has_pending ? (
          <span
            className="collection-card__alert"
            title={(card.pending || []).join(", ")}
          >
            !
          </span>
        ) : null}
        <div
          className="collection-card__cover"
          role="button"
          tabIndex={0}
          onClick={() => navigateTitle(leaf)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigateTitle(leaf);
            }
          }}
        >
          {card.cover_url ? (
            <img src={card.cover_url} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="collection-card__placeholder">No cover</span>
          )}
          <span className="collection-card__overlay">
            <span className="artist-card-footer">
              <button
                type="button"
                className="collection-card__title"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateTitle(leaf);
                }}
              >
                {card.title}
              </button>
              <button
                type="button"
                className="collection-card__artist"
                onClick={(e) => {
                  e.stopPropagation();
                  navigateArtist(leaf);
                }}
              >
                {leaf.country_iso ? (
                  <span className={`fi fi-${leaf.country_iso.toLowerCase()}`} aria-hidden />
                ) : null}
                {card.artist}
              </button>
              <span className="collection-card__edition muted">{editionLine}</span>
            </span>
          </span>
        </div>
      </article>
    );
  }

  const facetSecondRow = useMemo(() => {
    if (subfilter === "media") {
      return (
        <div className="filter-subbar filter-subbar--single collection-browse__facet-row">
          <button
            type="button"
            className={!mediaFilter ? "active" : undefined}
            onClick={() => {
              setMediaFilter("");
              setPage(1);
            }}
          >
            All
          </button>
          {facets.media.map((m) => (
            <button
              key={m}
              type="button"
              className={mediaFilter === m ? "active" : undefined}
              onClick={() => {
                setMediaFilter(m);
                setPage(1);
              }}
            >
              {m}
            </button>
          ))}
        </div>
      );
    }
    if (subfilter === "animation") {
      return (
        <div className="filter-subbar filter-subbar--single collection-browse__facet-row">
          <button
            type="button"
            className={!animFilter ? "active" : undefined}
            onClick={() => {
              setAnimFilter("");
              setPage(1);
            }}
          >
            All
          </button>
          {facets.animation.map((m) => (
            <button
              key={m}
              type="button"
              className={animFilter === m ? "active" : undefined}
              onClick={() => {
                setAnimFilter(m);
                setPage(1);
              }}
            >
              {m}
            </button>
          ))}
        </div>
      );
    }
    if (subfilter === "canvas") {
      return (
        <div className="filter-subbar filter-subbar--single collection-browse__facet-row">
          <button
            type="button"
            className={!canvasFilter ? "active" : undefined}
            onClick={() => {
              setCanvasFilter("");
              setPage(1);
            }}
          >
            All
          </button>
          {facets.canvas.map((m) => (
            <button
              key={m}
              type="button"
              className={canvasFilter === m ? "active" : undefined}
              onClick={() => {
                setCanvasFilter(m);
                setPage(1);
              }}
            >
              {m}
            </button>
          ))}
        </div>
      );
    }
    if (subfilter === "genre") {
      return (
        <div className="filter-subbar filter-subbar--single collection-browse__facet-row">
          <button
            type="button"
            className={!genreFilter ? "active" : undefined}
            onClick={() => {
              setGenreFilter("");
              setPage(1);
            }}
          >
            All
          </button>
          {facets.subgenre_groups.map((group) => (
            <span key={group.genre} className="collection-browse__facet-group">
              <span className="collection-browse__facet-group-label">{group.genre}</span>
              {group.items.map((item) => (
                <button
                  key={String(item.id)}
                  type="button"
                  className={genreFilter === item.name ? "active" : undefined}
                  onClick={() => {
                    setGenreFilter(item.name);
                    setPage(1);
                  }}
                >
                  {item.name}
                </button>
              ))}
            </span>
          ))}
        </div>
      );
    }
    if (subfilter === "country") {
      return (
        <div className="filter-subbar filter-subbar--single collection-browse__facet-row">
          <button
            type="button"
            className={!countryFilter && !continentFilter ? "active" : undefined}
            onClick={() => {
              setCountryFilter("");
              setContinentFilter("");
              setPage(1);
            }}
          >
            All
          </button>
          {facets.continents.map((cont) => (
            <button
              key={cont.id}
              type="button"
              className={continentFilter === String(cont.id) ? "active" : undefined}
              onClick={() => {
                setContinentFilter(String(cont.id));
                setCountryFilter("");
                setPage(1);
              }}
            >
              {cont.name}
            </button>
          ))}
          {facets.country_groups.map((group) => (
            <span key={group.continent} className="collection-browse__facet-group">
              <span className="collection-browse__facet-group-label">{group.continent}</span>
              {group.items.map((item) => {
                const value = (item.iso || item.name || "").trim();
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={
                      countryFilter.toLowerCase() === value.toLowerCase() ? "active" : undefined
                    }
                    onClick={() => {
                      setCountryFilter(value);
                      setContinentFilter("");
                      setPage(1);
                    }}
                  >
                    {item.name}
                  </button>
                );
              })}
            </span>
          ))}
        </div>
      );
    }
    return null;
  }, [
    subfilter,
    facets,
    mediaFilter,
    animFilter,
    canvasFilter,
    genreFilter,
    countryFilter,
    continentFilter,
  ]);

  const emptyFiltered = !loading && !emptyInventory && items.length === 0;
  const empty = emptyInventory;

  return (
    <div className="collection-browse">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e) => void onPickImport(e.target.files?.[0] ?? null)}
      />

      {!emptyInventory ? (
        <>
          <div
            className="sub-nav sub-nav--spread sub-nav--compact collection-browse__filterbar"
            aria-label="Collection filters"
          >
            {visibleSubfilters.map((sf) => {
              const sub = tabSubtext(sf.id);
              return (
                <button
                  key={sf.id || "all"}
                  type="button"
                  className={subfilter === sf.id ? "active" : undefined}
                  onClick={() => selectSubfilter(sf.id)}
                >
                  <span>{sf.label}</span>
                  {sub ? (
                    <span className="collection-browse__filter-sub">{sub}</span>
                  ) : null}
                </button>
              );
            })}
            <div className="filter-subbar-search-wrap">
              <IconSearch className="filter-subbar-search-icon" aria-hidden />
              <input
                className="filter-subbar-search"
                placeholder="Search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          {facetSecondRow}
          <div className="filter-subbar filter-subbar--pagination">
            <label className="collection-browse__page-size">
              <span className="muted">Per page</span>
              <input
                type="text"
                className="pagination-page-input collection-browse__page-size-input"
                aria-label="Items per page"
                value={pageSizeInput}
                onChange={(e) => setPageSizeInput(e.target.value)}
                onBlur={commitPageSizeInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitPageSizeInput();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="pagination-arrow"
              disabled={page <= 1 || pageSize === "all"}
              aria-label="Previous page"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹ Prev
            </button>
            <div className="pagination-info">
              <input
                type="text"
                inputMode="numeric"
                className="pagination-page-input"
                aria-label="Page number"
                value={pageInput}
                disabled={pageSize === "all"}
                onChange={(e) =>
                  setPageInput(e.target.value.replace(/[^\d]/g, ""))
                }
                onBlur={commitPageInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitPageInput();
                  }
                }}
              />
              <span className="pagination-of">/ {pageCount}</span>
              <span className="pagination-count">
                · {total} item{total === 1 ? "" : "s"}
              </span>
            </div>
            <button
              type="button"
              className="pagination-arrow"
              disabled={page >= pageCount || pageSize === "all"}
              aria-label="Next page"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next ›
            </button>
          </div>
        </>
      ) : null}

      {busy ? <p className="muted">{busy}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {importPreview ? (
        <div className="collection-import-preview">
          <p>
            Import preview: add {importPreview.counts.add ?? 0}, update{" "}
            {importPreview.counts.update ?? 0}, orphan {importPreview.counts.orphan ?? 0} (
            {importPreview.rows.length} rows)
          </p>
          <button type="button" className="btn btn--primary" onClick={() => void confirmImport()}>
            Confirm import
          </button>
          <button type="button" className="btn" onClick={() => setImportPreview(null)}>
            Cancel
          </button>
        </div>
      ) : null}

      {empty ? (
        <div className="collection-browse__empty">
          <p>Your collection is empty.</p>
          <p className="muted">
            Import an Excel file, add manually, or use Add to my collection on a
            release tracklist.
          </p>
          <div className="collection-browse__empty-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => fileRef.current?.click()}
            >
              <IconImport className="collection-browse__empty-icon" />
              Import Excel
            </button>
            <button type="button" className="btn" onClick={() => setModal({ mode: "manual" })}>
              <IconPlus className="collection-browse__empty-icon" />
              Add manually
            </button>
          </div>
        </div>
      ) : emptyFiltered ? (
        <div className="collection-browse__empty">
          <p>No items match these filters.</p>
        </div>
      ) : view === "cover" || view === "banner" ? (
        <div
          className={`collection-cards ${
            view === "banner" ? "collection-cards--banner" : "collection-cards--cover"
          }`}
        >
          {items.map((card) => renderCard(card))}
        </div>
      ) : (
        <div
          className="collection-table-wrap"
          ref={tableWrapRef}
          onScroll={virtualize ? virt.onScroll : undefined}
        >
          <table className="collection-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key}>
                    <button type="button" onClick={() => toggleSort(col.key)}>
                      {col.label}
                      {sort === col.key ? (order === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
                <th aria-label="Edit" />
              </tr>
            </thead>
            <tbody>
              {virtualize ? (
                <tr aria-hidden style={{ height: virt.offsetY }}>
                  <td colSpan={12} />
                </tr>
              ) : null}
              {renderRows.map((row) => {
                if (row.row_kind === "group") {
                  const open = expandedGroups[row.group_key || ""] !== false;
                  return (
                    <tr key={`g-${row.group_key}`} className="collection-table__group">
                      <td colSpan={12}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedGroups((prev) => ({
                              ...prev,
                              [row.group_key || ""]: !open,
                            }))
                          }
                        >
                          {row.title}{" "}
                          <span className="muted">{row.version_count} versions</span>
                        </button>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr
                    key={row.id ?? `${row.artist}-${row.title}-${row.edition}-${row.media_type}`}
                    className={
                      row.row_kind === "child" ? "collection-table__child" : undefined
                    }
                    style={virtualize ? { height: ROW_HEIGHT } : undefined}
                  >
                    <td>
                      <HoverBubble
                        content={
                          row.logo_url ? (
                            <img src={row.logo_url} alt="" className="collection-hover__img" />
                          ) : (
                            <span className="muted">No logo</span>
                          )
                        }
                      >
                        {titleControl(row)}
                      </HoverBubble>
                    </td>
                    <td>
                      <HoverBubble
                        content={
                          row.photocard_pairs && row.photocard_pairs.length > 0 ? (
                            <PhotocardFlipPreview pairs={row.photocard_pairs} />
                          ) : (
                            <span className="muted">No photocards</span>
                          )
                        }
                      >
                        {artistControl(row)}
                      </HoverBubble>
                    </td>
                    <td>
                      <span className="collection-edition">
                        <SpotifyFlip
                          active={Boolean(row.spotify_icon_active)}
                          bannerUrl={row.cover_banner_url}
                          cardUrl={row.spotify_card_url}
                        />
                        <HoverBubble
                          content={
                            row.cover_url ? (
                              <img src={row.cover_url} alt="" className="collection-hover__img" />
                            ) : (
                              <span className="muted">No cover</span>
                            )
                          }
                        >
                          {row.local && row.band_id && row.release_id ? (
                            <button type="button" className="linkish" onClick={() => navigateTitle(row)}>
                              {row.edition}
                              {row.version ? ` · ${row.version}` : ""}
                            </button>
                          ) : (
                            <ExternalSearchMenu kind="title" artist={row.artist} title={row.title}>
                              {row.edition}
                              {row.version ? ` · ${row.version}` : ""}
                            </ExternalSearchMenu>
                          )}
                        </HoverBubble>
                      </span>
                    </td>
                    <td title={row.original_date_display || row.original_date || undefined}>
                      {row.year || "—"}
                    </td>
                    <td>{row.release_type || "—"}</td>
                    <td>
                      <GenrePills genres={row.genres || []} />
                    </td>
                    <td>
                      <HoverBubble
                        content={
                          <DiscFlipPreview
                            discUrl={row.disc_url}
                            discBUrl={row.disc_b_url}
                            mediaType={row.media_type}
                          />
                        }
                      >
                        {row.media_type || "—"}
                      </HoverBubble>
                    </td>
                    <td>
                      <HoverBubble
                        content={
                          row.animation_url ? (
                            <video src={row.animation_url} muted autoPlay loop playsInline />
                          ) : (
                            <span className="muted">No animation</span>
                          )
                        }
                      >
                        <span className={!row.animation_url ? "is-muted" : undefined}>
                          {(row.animation || []).join(" / ") || "—"}
                        </span>
                      </HoverBubble>
                    </td>
                    <td>
                      <HoverBubble
                        content={
                          row.canvas_url ? (
                            <video src={row.canvas_url} muted autoPlay loop playsInline />
                          ) : (
                            <span className="muted">No canvas</span>
                          )
                        }
                      >
                        <span className={!row.canvas_url ? "is-muted" : undefined}>
                          {(row.canvas || []).join(" / ") || "—"}
                        </span>
                      </HoverBubble>
                    </td>
                    <td>
                      <HoverBubble
                        content={
                          row.autograph_images && row.autograph_images.length > 0 ? (
                            <div className="collection-hover__photos">
                              {row.autograph_images.map((a) =>
                                a.url ? <img key={a.label} src={a.url} alt={a.label} /> : null
                              )}
                            </div>
                          ) : (
                            <span className="muted">No images</span>
                          )
                        }
                      >
                        {(row.autographs || []).join(", ") || "—"}
                      </HoverBubble>
                    </td>
                    <td className="collection-table__pending">
                      {(row.pending || []).length ? (row.pending || []).length : "—"}
                    </td>
                    <td className="collection-table__edit">
                      {row.id ? (
                        <button
                          type="button"
                          className="collection-edit-btn"
                          title="Edit"
                          onClick={() => setModal({ mode: "edit", id: row.id })}
                        >
                          ✎
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {virtualize ? (
                <tr
                  aria-hidden
                  style={{
                    height: Math.max(
                      0,
                      virt.totalHeight - virt.offsetY - renderRows.length * ROW_HEIGHT
                    ),
                  }}
                >
                  <td colSpan={12} />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {modal ? (
        <CollectionModal
          open
          mode={modal.mode}
          collectionId={modal.id}
          isAdmin={isAdmin}
          onClose={() => setModal(null)}
          onSaved={() => {
            void load();
            void refreshFacets();
          }}
        />
      ) : null}
    </div>
  );
}
