import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import {
  commitCollectionImport,
  deleteCollectionItems,
  exportCollectionXlsx,
  fetchCollection,
  fetchCollectionFacets,
  fetchFilterOptions,
  previewCollectionImport,
} from "../../api";
import type { CollectionLeaf } from "../../types";
import CollectionModal from "./CollectionModal";
import ModalPortal from "../ModalPortal";
import { IconImport, IconPage, IconPlus, IconSearch } from "../MenuIcons";
import { DEFAULT_DISC_URL } from "./release/releaseTrackPanelMeta";
import {
  DiscFlipPreview,
  EditionAssetPreview,
  EditionCoverHover,
  ExternalSearchMenu,
  HoverBubble,
  openSearchCascade,
  SpotifyFlip,
  useVirtualWindow,
} from "./collectionHover";

type BrowseView = "list" | "cover" | "banner";

const PAGE_SIZE_PRESETS = [10, 20, 25, 50, 100] as const;

export type CollectionBrowseApi = {
  openManual: () => void;
  importExcel: () => void;
  exportExcel: () => void;
  startClearMode: () => void;
  cancelClearMode: () => void;
};

type Props = {
  onOpenArtist?: (bandId: number) => void;
  onOpenRelease?: (
    bandId: number,
    releaseId: string,
    artistName?: string,
    title?: string
  ) => void;
  isAdmin?: boolean;
  view?: BrowseView;
  onViewChange?: (view: BrowseView) => void;
  manageApiRef?: MutableRefObject<CollectionBrowseApi | null>;
  onInventoryChange?: (hasItems: boolean) => void;
  onClearModeChange?: (active: boolean) => void;
};

const DROPDOWN_FILTERS = new Set([
  "media",
  "animation",
  "canvas",
  "genre",
  "country",
]);

const ROW_HEIGHT = 44;

const COLUMNS = [
  { key: "title", label: "Title" },
  { key: "type", label: "Type" },
  { key: "artist", label: "Artist" },
  { key: "genre", label: "Genre" },
  { key: "edition", label: "Edition" },
  { key: "year", label: "Year" },
  { key: "media", label: "Media" },
  { key: "animation", label: "Animation" },
  { key: "canvas", label: "Canvas" },
  { key: "autographs", label: "Autographs" },
  { key: "pending", label: "Pending" },
] as const;

const SUBFILTERS = [
  { id: "", label: "ALL" },
  { id: "linked", label: "LINKED" },
  { id: "unlinked", label: "UNLINKED" },
  { id: "pending", label: "INCOMPLETE" },
  { id: "media", label: "MEDIA" },
  { id: "animation", label: "ANIMATION" },
  { id: "canvas", label: "CANVAS" },
  { id: "autographs", label: "AUTOGRAPHS" },
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
        <HoverBubble
          content={<span className="collection-pill-more">{rest.join(", ")}</span>}
        >
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
    case "unlinked":
    case "orphan":
      return counts.orphan;
    case "autographs":
      return counts.autographs;
    case "linked":
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

function countsHaveData(counts: FacetCounts): boolean {
  return Object.values(counts).some((n) => n > 0);
}

/** When facets API fails or returns empty, derive visibility from loaded rows. */
function deriveCountsFromItems(
  items: CollectionLeaf[],
  inventoryTotal: number
): FacetCounts {
  let pending = 0;
  let orphan = 0;
  let matched = 0;
  let autographs = 0;
  const media = new Set<string>();
  const animation = new Set<string>();
  const canvas = new Set<string>();
  const genres = new Set<string>();
  const countries = new Set<string>();
  for (const it of items) {
    if (it.row_kind === "group") continue;
    if (it.has_pending || (it.pending || []).length) pending += 1;
    if (it.orphan || it.local === false) orphan += 1;
    else matched += 1;
    if ((it.autographs || []).length) autographs += 1;
    if (it.media_type) media.add(it.media_type);
    for (const a of it.animation || []) {
      if (a && a.toLowerCase() !== "none") animation.add(a);
    }
    for (const c of it.canvas || []) {
      if (c && c.toLowerCase() !== "none") canvas.add(c);
    }
    for (const g of it.genres || []) {
      if (g.trim()) genres.add(g.trim());
    }
    const iso = (it.country_iso || it.country || "").trim();
    if (iso) countries.add(iso.toLowerCase());
  }
  if (matched === 0 && orphan === 0 && inventoryTotal > 0) {
    matched = inventoryTotal;
  }
  return {
    pending,
    orphan,
    autographs,
    matched,
    media: media.size,
    animation: animation.size,
    canvas: canvas.size,
    genre: genres.size,
    country: countries.size,
  };
}

function editionSortRank(it: CollectionLeaf): [number, number, string, string] {
  const ed = (it.edition || "").toLowerCase();
  const media = (it.media_type || "").toLowerCase();
  const standard = ed.startsWith("standard") ? 0 : 1;
  const mediaRank =
    media === "cd" ? 0 : media === "digital" ? 1 : media === "lp" ? 2 : 3;
  return [standard, mediaRank, ed, media];
}

function sortEditions<T extends CollectionLeaf>(versions: T[]): T[] {
  return [...versions].sort((a, b) => {
    const ka = editionSortRank(a);
    const kb = editionSortRank(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });
}

function leafDisplayDate(leaf: CollectionLeaf): string {
  return (
    leaf.display_date_display ||
    leaf.edition_date_display ||
    leaf.original_date_display ||
    leaf.year ||
    ""
  );
}

/** Year for the list cell — prefer edition-specific date (same source as tooltip). */
function leafYear(leaf: CollectionLeaf): string {
  const raw =
    leaf.display_date || leaf.edition_date || leaf.original_date || leaf.year || "";
  const isoY = String(raw).match(/\b((?:19|20)\d{2})\b/);
  if (isoY) return isoY[1];
  const display = leafDisplayDate(leaf);
  const fromDisplay = String(display).match(/\b((?:19|20)\d{2})\b/);
  if (fromDisplay) return fromDisplay[1];
  return "—";
}

function assetsHave(
  editions: {
    logo_url?: string | null;
    photocard_pairs?: unknown[] | null;
  }[],
  mode: "logo" | "photocards"
): boolean {
  return editions.some((e) =>
    mode === "logo" ? Boolean(e.logo_url) : Boolean(e.photocard_pairs?.length)
  );
}

/** Drop legacy group-header rows; sort editions (Standard/CD first); mark group head. */
function normalizeTableRows(items: CollectionLeaf[]): CollectionLeaf[] {
  const leaves = items.filter((r) => r.row_kind !== "group");

  const groups = new Map<string, CollectionLeaf[]>();
  const order: string[] = [];
  for (const row of leaves) {
    const gk =
      row.group_key ||
      `${(row.artist || "").toLowerCase()}|${(row.title || "").toLowerCase()}|${(
        row.original_date || ""
      ).slice(0, 4)}`;
    if (!groups.has(gk)) {
      groups.set(gk, []);
      order.push(gk);
    }
    groups.get(gk)!.push(row);
  }

  const out: CollectionLeaf[] = [];
  for (const gk of order) {
    const versions = sortEditions(groups.get(gk) || []);
    const n = versions.length;
    const multi = n > 1;
    for (let i = 0; i < n; i++) {
      const leaf = versions[i];
      out.push({
        ...leaf,
        row_kind: multi ? "child" : "leaf",
        group_key: gk,
        is_group_head: i === 0,
        group_span: i === 0 && multi ? n : multi ? 0 : 1,
        version_count: n,
        group_title: leaf.group_title || leaf.title,
        group_artist: leaf.group_artist || leaf.artist,
        group_release_type: leaf.group_release_type ?? leaf.release_type,
        group_genres: leaf.group_genres ?? leaf.genres ?? [],
        group_country_iso: leaf.group_country_iso || leaf.country_iso,
        group_versions: multi ? versions : leaf.group_versions,
      });
    }
  }
  return out;
}

function deriveFacetsFromItems(items: CollectionLeaf[]): {
  genres: string[];
} {
  const genres = new Set<string>();
  for (const it of items) {
    if (it.row_kind === "group") continue;
    for (const g of it.genres || it.group_genres || []) {
      if (g?.trim()) genres.add(g.trim());
    }
  }
  return { genres: [...genres].sort((a, b) => a.localeCompare(b)) };
}

export default function CollectionBrowse({
  onOpenArtist,
  onOpenRelease,
  isAdmin = false,
  view: viewProp,
  onViewChange,
  manageApiRef,
  onInventoryChange,
  onClearModeChange,
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
  const [pageBarOpen, setPageBarOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownQuery, setDropdownQuery] = useState("");
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
  const [cardEditionByKey, setCardEditionByKey] = useState<Record<string, number>>({});
  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [clearMode, setClearMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [removeSeeItems, setRemoveSeeItems] = useState(false);
  const [pageSizeMenuOpen, setPageSizeMenuOpen] = useState(false);
  const pageSizeTriggerRef = useRef<HTMLButtonElement>(null);
  const [facets, setFacets] = useState<{
    media: string[];
    animation: string[];
    canvas: string[];
    genres: string[];
    subgenre_groups: {
      genre: string;
      items: { id: number | string; name: string }[];
    }[];
    country_groups: {
      continent: string;
      items: { id: number | string; name: string; iso?: string | null }[];
    }[];
    continents: { id: number; name: string }[];
    counts: FacetCounts;
  }>({
    media: [],
    animation: [],
    canvas: [],
    genres: [],
    subgenre_groups: [],
    country_groups: [],
    continents: [],
    counts: EMPTY_COUNTS,
  });

  const refreshFacets = useCallback(async () => {
    try {
      const f = await fetchCollectionFacets();
      setInventoryTotal(f.total);
      let subgenre_groups = f.subgenre_groups || [];
      let country_groups = f.country_groups || [];
      let continents = f.continents || [];
      const genres = f.genres?.length ? f.genres : deriveFacetsFromItems(items).genres;

      // Prefer catalog taxonomy parents (Rock / Metal, Europe / …) when available.
      try {
        const opts = await fetchFilterOptions();
        const genreNames =
          genres.length > 0
            ? genres
            : subgenre_groups.flatMap((g) => g.items.map((i) => i.name));
        if (genreNames.length) {
          const want = new Set(genreNames.map((g) => g.toLowerCase()));
          const tax = opts.all_subgenre_groups?.length
            ? opts.all_subgenre_groups
            : opts.subgenre_groups || [];
          const built: { genre: string; items: { id: number | string; name: string }[] }[] =
            [];
          for (const g of tax) {
            const matched = (g.items || []).filter((it) =>
              want.has((it.name || "").toLowerCase())
            );
            if (matched.length) {
              built.push({
                genre: g.genre,
                items: matched.map((it) => ({ id: it.id, name: it.name })),
              });
            }
          }
          if (built.length) subgenre_groups = built;
        }

        const isos = new Set(
          items.map((it) => (it.country_iso || "").toLowerCase()).filter(Boolean)
        );
        const nameKeys = new Set<string>();
        for (const it of items) {
          const c = (it.country || "").trim();
          if (!c) continue;
          nameKeys.add(c.toLowerCase());
          if (c.includes(",")) {
            nameKeys.add(c.split(",").pop()!.trim().toLowerCase());
          }
        }
        for (const g of f.country_groups || []) {
          for (const it of g.items || []) {
            if (it.iso) isos.add(String(it.iso).toLowerCase());
            if (it.name) nameKeys.add(String(it.name).toLowerCase());
          }
        }
        if (isos.size || nameKeys.size) {
          const src = opts.all_country_groups?.length
            ? opts.all_country_groups
            : opts.country_groups || [];
          const builtCountries: {
            continent: string;
            items: { id: number | string; name: string; iso?: string | null }[];
          }[] = [];
          const contSet = new Map<number, string>();
          for (const g of src) {
            const matched = (g.items || []).filter((it) => {
              const iso = (it.iso || "").toLowerCase();
              const nm = (it.name || "").toLowerCase();
              return (iso && isos.has(iso)) || (nm && nameKeys.has(nm));
            });
            if (matched.length) {
              builtCountries.push({
                continent: g.continent,
                items: matched.map((it) => ({
                  id: it.id,
                  name: it.name,
                  iso: it.iso ?? null,
                })),
              });
              for (const it of matched) {
                if (it.continent_id != null) {
                  contSet.set(Number(it.continent_id), g.continent);
                } else if (g.continent) {
                  // Fall back to continent name as id when taxonomy omits continent_id
                  const fakeId =
                    Math.abs(
                      [...g.continent].reduce((a, ch) => a + ch.charCodeAt(0), 0)
                    ) || 1;
                  contSet.set(fakeId, g.continent);
                }
              }
            }
          }
          if (builtCountries.length) {
            country_groups = builtCountries;
            continents = [...contSet.entries()]
              .map(([id, name]) => ({ id, name }))
              .sort((a, b) => a.name.localeCompare(b.name));
          }
        }
      } catch {
        /* taxonomy enrichment is best-effort — keep API facet groups */
      }

      // Never drop API-provided groups if enrichment left them empty.
      if (!subgenre_groups.length && (f.subgenre_groups || []).length) {
        subgenre_groups = f.subgenre_groups;
      }
      if (!country_groups.length && (f.country_groups || []).length) {
        country_groups = f.country_groups;
      }
      if (!continents.length && (f.continents || []).length) {
        continents = f.continents;
      }

      setFacets({
        media: f.media || [],
        animation: f.animation || [],
        canvas: f.canvas || [],
        genres,
        subgenre_groups,
        country_groups,
        continents,
        counts: { ...EMPTY_COUNTS, ...(f.counts || {}) },
      });
    } catch {
      /* keep prior facets */
    }
  }, [items]);

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
      const groupHeaders = data.items.filter((r) => r.row_kind === "group").length;
      setTotal(Math.max(0, data.total - groupHeaders));
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
    // Drop previous view payload so table rows never flash as cover/banner cards.
    setItems([]);
    setCardEditionByKey({});
    setLoading(true);
  }, [apiView]);

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
      startClearMode: () => {
        setClearMode(true);
        setSelectedIds(new Set());
        setPageBarOpen(true);
        if (view !== "list") onViewChange?.("list");
      },
      cancelClearMode: () => {
        setClearMode(false);
        setSelectedIds(new Set());
        setRemoveConfirm(false);
        setRemoveSeeItems(false);
      },
    };
    return () => {
      manageApiRef.current = null;
    };
  });

  useEffect(() => {
    onClearModeChange?.(clearMode);
  }, [clearMode, onClearModeChange]);

  useEffect(() => {
    if (!pageSizeMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(".collection-browse__page-size")) return;
      setPageSizeMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pageSizeMenuOpen]);

  useEffect(() => {
    if (!clearMode) setSelectedIds(new Set());
  }, [clearMode, page, pageSize]);

  useEffect(() => {
    setDropdownQuery("");
  }, [openDropdown]);

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

  const effectiveCounts = useMemo(() => {
    if (countsHaveData(facets.counts)) return facets.counts;
    return deriveCountsFromItems(items, inventoryTotal);
  }, [facets.counts, items, inventoryTotal]);

  const visibleSubfilters = useMemo(() => {
    return SUBFILTERS.filter(
      (sf) => !sf.id || subfilterCount(sf.id, effectiveCounts) > 0
    );
  }, [effectiveCounts]);

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
    const normalized = normalizeTableRows(items);
    return normalized.filter((row) => {
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

  const pageIds = useMemo(
    () =>
      renderRows
        .map((r) => r.id)
        .filter((id): id is number => typeof id === "number" && id > 0),
    [renderRows]
  );

  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  function toggleSelectAllPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  function toggleSelectId(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  function onFilterTabClick(id: string) {
    if (DROPDOWN_FILTERS.has(id)) {
      setSubfilter(id);
      setOpenDropdown((cur) => (cur === id ? null : id));
      setPage(1);
      return;
    }
    setOpenDropdown(null);
    selectSubfilter(id);
  }

  useEffect(() => {
    if (!openDropdown) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(".collection-browse__filter-item")) return;
      setOpenDropdown(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openDropdown]);

  function navigateTitle(row: CollectionLeaf) {
    if (row.local && row.band_id && row.release_id) {
      onOpenRelease?.(row.band_id, row.release_id, row.artist, row.title);
      return;
    }
    openSearchCascade("title", row.artist, row.title);
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
      setPageSizeMenuOpen(false);
      return;
    }
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 10 && n <= 100) {
      setPageSize(n);
      setPageSizeInput(String(n));
      setPage(1);
      setPageSizeMenuOpen(false);
    } else {
      setPageSizeInput(pageSize === "all" ? "all" : String(pageSize));
    }
  }

  function applyPageSize(n: number | "all") {
    setPageSize(n);
    setPageSizeInput(n === "all" ? "all" : String(n));
    setPage(1);
    setPageSizeMenuOpen(false);
  }

  async function confirmRemoveSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBusy("Removing…");
    try {
      await deleteCollectionItems(ids);
      setRemoveConfirm(false);
      setRemoveSeeItems(false);
      setClearMode(false);
      setSelectedIds(new Set());
      await load();
      await refreshFacets();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
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
          {row.orphan ? <span className="collection-badge">Unlinked</span> : null}
        </button>
      );
    }
    return (
      <ExternalSearchMenu kind="title" artist={row.artist} title={row.title}>
        {row.title}
        {row.orphan ? <span className="collection-badge">Unlinked</span> : null}
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

  function editIdFor(card: CollectionLeaf): number | undefined {
    return card.id ?? card.versions?.[0]?.id;
  }

  function openEdit(card: CollectionLeaf) {
    const id = editIdFor(card);
    if (id) setModal({ mode: "edit", id });
  }

  function renderCard(card: CollectionLeaf) {
    const versions = sortEditions(card.versions?.length ? card.versions : [card]);
    const gkey = card.group_key || `${card.artist}-${card.title}-${card.id}`;
    const selectedIdx = Math.min(
      cardEditionByKey[gkey] ?? 0,
      Math.max(0, versions.length - 1)
    );
    const leaf = versions[selectedIdx] || versions[0] || card;
    const editionLine = leaf.edition || card.edition || "—";
    const coverUrl = leaf.cover_url || card.cover_url || DEFAULT_DISC_URL;
    const bannerUrl = leaf.cover_banner_url || card.cover_banner_url;
    const logoUrl = leaf.logo_url || card.logo_url;
    const pendingList = leaf.pending || card.pending || [];
    const showPending = Boolean(leaf.has_pending || card.has_pending || pendingList.length);
    const dateLabel = leafDisplayDate(leaf) || leafDisplayDate(card);

    const pendingBtn = showPending ? (
      <button
        type="button"
        className="collection-card__alert"
        title={
          pendingList.length
            ? `${pendingList.length} item${pendingList.length === 1 ? "" : "s"} pending`
            : "Items pending"
        }
        onClick={(e) => {
          e.stopPropagation();
          openEdit(leaf.id ? leaf : card);
        }}
      >
        !
      </button>
    ) : null;

    const editionsLine =
      versions.length > 1 ? (
        <div
          className={`collection-card__editions${
            view === "banner" ? " collection-card__editions--banner" : ""
          }`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {versions.map((v, i) => (
            <span key={v.id ?? `${v.edition}-${v.media_type}-${i}`}>
              {i > 0 ? " · " : null}
              <button
                type="button"
                className={`collection-card__edition-btn${
                  i === selectedIdx ? " is-active" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setCardEditionByKey((prev) => ({ ...prev, [gkey]: i }));
                }}
              >
                {v.media_type || "—"}
                {v.version ? (
                  <span className="collection-table__media-variant"> {v.version}</span>
                ) : null}
              </button>
            </span>
          ))}
        </div>
      ) : null;

    if (view === "banner") {
      const bannerBg = bannerUrl
        ? `url("${bannerUrl}")`
        : "linear-gradient(135deg, #1a1f2e, #2d3548)";
      return (
        <article
          key={gkey}
          className="media-release-card media-release-card--banner media-release-card--clickable collection-card"
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
          {pendingBtn}
          <span
            className="media-release-card__banner-bg"
            style={bannerUrl ? undefined : { backgroundImage: bannerBg }}
          >
            {bannerUrl ? (
              <img
                src={bannerUrl}
                alt=""
                className="media-release-card__banner-bg-img"
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            ) : null}
          </span>
          <span className="media-release-card__banner-overlay">
            <span className="media-release-card__banner-glass" aria-hidden />
            <span className="media-release-card__banner-cover">
              <img
                src={coverUrl}
                alt=""
                className="media-release-card__banner-cover-img"
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            </span>
            <span className="media-release-card__banner-meta">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  className="media-release-card__banner-release-logo"
                  draggable={false}
                />
              ) : (
                <span className="media-release-card__banner-title">{card.title}</span>
              )}
              <span className="media-release-card__banner-artist">
                {leaf.country_iso ? (
                  <span
                    className={`fi fi-${leaf.country_iso.toLowerCase()}`}
                    aria-hidden
                  />
                ) : null}{" "}
                {card.artist}
              </span>
              {dateLabel ? (
                <span className="media-release-card__banner-date">{dateLabel}</span>
              ) : null}
              <span className="media-release-card__banner-date">{editionLine}</span>
              {editionsLine}
            </span>
          </span>
        </article>
      );
    }

    return (
      <article
        key={gkey}
        className="media-release-card media-release-card--clickable collection-card"
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
        {pendingBtn}
        <span className="media-release-card__cover">
          <img
            src={coverUrl}
            alt=""
            className="media-release-card__cover-img"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </span>
        <span className="media-release-card__dim" aria-hidden />
        <span className="media-release-card__hover">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="media-release-card__logo"
              draggable={false}
            />
          ) : (
            <span className="media-release-card__title-hover">{card.title}</span>
          )}
        </span>
        <span className="media-release-card__date">
          <span className="media-release-card__source-artist">
            {leaf.country_iso ? (
              <span
                className={`fi fi-${leaf.country_iso.toLowerCase()}`}
                aria-hidden
              />
            ) : null}{" "}
            {card.artist}
          </span>
          {dateLabel ? (
            <span className="media-release-card__date-label">{dateLabel}</span>
          ) : (
            <span className="media-release-card__date-label">{editionLine}</span>
          )}
          {editionsLine}
        </span>
      </article>
    );
  }

  function renderFilterDropdown(id: string) {
    if (openDropdown !== id) return null;
    if (id === "media") {
      return (
        <ul className="collection-browse__dropdown" role="listbox">
          <li>
            <button
              type="button"
              className={!mediaFilter ? "active" : undefined}
              onClick={() => {
                setMediaFilter("");
                setOpenDropdown(null);
                setPage(1);
              }}
            >
              All
            </button>
          </li>
          {facets.media.map((m) => (
            <li key={m}>
              <button
                type="button"
                className={mediaFilter === m ? "active" : undefined}
                onClick={() => {
                  setMediaFilter(m);
                  setOpenDropdown(null);
                  setPage(1);
                }}
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      );
    }
    if (id === "animation") {
      return (
        <ul className="collection-browse__dropdown" role="listbox">
          <li>
            <button
              type="button"
              className={!animFilter ? "active" : undefined}
              onClick={() => {
                setAnimFilter("");
                setOpenDropdown(null);
                setPage(1);
              }}
            >
              All
            </button>
          </li>
          {facets.animation.map((m) => (
            <li key={m}>
              <button
                type="button"
                className={animFilter === m ? "active" : undefined}
                onClick={() => {
                  setAnimFilter(m);
                  setOpenDropdown(null);
                  setPage(1);
                }}
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      );
    }
    if (id === "canvas") {
      return (
        <ul className="collection-browse__dropdown" role="listbox">
          <li>
            <button
              type="button"
              className={!canvasFilter ? "active" : undefined}
              onClick={() => {
                setCanvasFilter("");
                setOpenDropdown(null);
                setPage(1);
              }}
            >
              All
            </button>
          </li>
          {facets.canvas.map((m) => (
            <li key={m}>
              <button
                type="button"
                className={canvasFilter === m ? "active" : undefined}
                onClick={() => {
                  setCanvasFilter(m);
                  setOpenDropdown(null);
                  setPage(1);
                }}
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      );
    }
    if (id === "genre") {
      const qn = dropdownQuery.trim().toLowerCase();
      const groups = facets.subgenre_groups
        .map((group) => ({
          ...group,
          items: group.items.filter((it) =>
            !qn
              ? true
              : it.name.toLowerCase().includes(qn) ||
                group.genre.toLowerCase().includes(qn)
          ),
        }))
        .filter((g) => g.items.length > 0);
      const flat =
        groups.length === 0
          ? facets.genres.filter((name) =>
              !qn ? true : name.toLowerCase().includes(qn)
            )
          : [];
      return (
        <div className="collection-browse__dropdown collection-browse__dropdown--searchable">
          <input
            type="text"
            className="collection-browse__dropdown-search"
            placeholder="Search genres…"
            value={dropdownQuery}
            autoFocus
            onChange={(e) => setDropdownQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <ul role="listbox">
            <li>
              <button
                type="button"
                className={!genreFilter ? "active" : undefined}
                onClick={() => {
                  setGenreFilter("");
                  setOpenDropdown(null);
                  setPage(1);
                }}
              >
                All
              </button>
            </li>
            {groups.length > 0
              ? groups.map((group) => (
                  <li key={group.genre} className="collection-browse__dropdown-group">
                    <span className="collection-browse__dropdown-group-label">
                      {group.genre}
                    </span>
                    <ul>
                      {group.items.map((item) => (
                        <li key={String(item.id)}>
                          <button
                            type="button"
                            className={
                              genreFilter === item.name ? "active" : undefined
                            }
                            onClick={() => {
                              setGenreFilter(item.name);
                              setOpenDropdown(null);
                              setPage(1);
                            }}
                          >
                            {item.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))
              : flat.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      className={genreFilter === name ? "active" : undefined}
                      onClick={() => {
                        setGenreFilter(name);
                        setOpenDropdown(null);
                        setPage(1);
                      }}
                    >
                      {name}
                    </button>
                  </li>
                ))}
            {groups.length === 0 && flat.length === 0 ? (
              <li className="collection-browse__dropdown-empty">No matches</li>
            ) : null}
          </ul>
        </div>
      );
    }
    if (id === "country") {
      const qn = dropdownQuery.trim().toLowerCase();
      const groups = facets.country_groups
        .map((group) => ({
          ...group,
          items: group.items.filter((it) => {
            if (!qn) return true;
            const name = (it.name || "").toLowerCase();
            const iso = (it.iso || "").toLowerCase();
            return (
              name.includes(qn) ||
              iso.includes(qn) ||
              group.continent.toLowerCase().includes(qn)
            );
          }),
        }))
        .filter((g) => g.items.length > 0);
      return (
        <div className="collection-browse__dropdown collection-browse__dropdown--searchable">
          <input
            type="text"
            className="collection-browse__dropdown-search"
            placeholder="Search countries…"
            value={dropdownQuery}
            autoFocus
            onChange={(e) => setDropdownQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <ul role="listbox">
            <li>
              <button
                type="button"
                className={!countryFilter && !continentFilter ? "active" : undefined}
                onClick={() => {
                  setCountryFilter("");
                  setContinentFilter("");
                  setOpenDropdown(null);
                  setPage(1);
                }}
              >
                All
              </button>
            </li>
            {groups.map((group) => (
              <li key={group.continent} className="collection-browse__dropdown-group">
                <span className="collection-browse__dropdown-group-label">
                  {group.continent}
                </span>
                <ul>
                  {group.items.map((item) => {
                    const value = (item.iso || item.name || "").trim();
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={
                            countryFilter.toLowerCase() === value.toLowerCase()
                              ? "active"
                              : undefined
                          }
                          onClick={() => {
                            setCountryFilter(value);
                            setContinentFilter("");
                            setOpenDropdown(null);
                            setPage(1);
                          }}
                        >
                          {item.iso ? (
                            <span
                              className={`fi fi-${String(item.iso).toLowerCase()}`}
                              aria-hidden
                            />
                          ) : null}{" "}
                          {item.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {groups.length === 0 ? (
              <li className="collection-browse__dropdown-empty">No matches</li>
            ) : null}
          </ul>
        </div>
      );
    }
    return null;
  }

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
        <div className="collection-browse__sticky artist-browse-sticky">
          <div
            className="sub-nav sub-nav--spread sub-nav--compact collection-browse__filterbar"
            aria-label="Collection filters"
          >
            {visibleSubfilters.map((sf) => {
              const sub = tabSubtext(sf.id);
              const isDropdown = DROPDOWN_FILTERS.has(sf.id);
              return (
                <div
                  key={sf.id || "all"}
                  className="sub-nav-item-wrap collection-browse__filter-item"
                >
                  <button
                    type="button"
                    className={
                      subfilter === sf.id || openDropdown === sf.id
                        ? "active"
                        : undefined
                    }
                    aria-haspopup={isDropdown ? "listbox" : undefined}
                    aria-expanded={isDropdown ? openDropdown === sf.id : undefined}
                    onClick={() => onFilterTabClick(sf.id)}
                  >
                    <span>{sf.label}</span>
                    {sub ? (
                      <span className="collection-browse__filter-sub">{sub}</span>
                    ) : null}
                  </button>
                  {isDropdown ? renderFilterDropdown(sf.id) : null}
                </div>
              );
            })}
            <div className="filter-subbar-search-wrap">
              <IconSearch className="filter-subbar-search-icon" aria-hidden />
              <input
                className="filter-subbar-search"
                placeholder="Search title"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <button
              type="button"
              className={`collection-browse__page-toggle${
                pageBarOpen ? " is-open" : ""
              }`}
              title={pageBarOpen ? "Hide page bar" : "See page bar"}
              aria-label={pageBarOpen ? "Hide page bar" : "See page bar"}
              aria-expanded={pageBarOpen}
              onClick={() => setPageBarOpen((v) => !v)}
            >
              <IconPage className="collection-browse__page-toggle-icon" />
            </button>
          </div>
          <div
            className={`collection-browse__pagebar-wrap${
              pageBarOpen ? " is-open" : ""
            }`}
            aria-hidden={!pageBarOpen}
          >
            <div className="collection-browse__pagebar-inner">
              <div className="filter-subbar filter-subbar--pagination collection-browse__pagebar">
                <div className="collection-browse__page-size">
                  <span className="collection-browse__page-size-label">Per page</span>
                  <button
                    ref={pageSizeTriggerRef}
                    type="button"
                    className={`collection-browse__page-size-trigger${
                      pageSizeMenuOpen ? " is-open" : ""
                    }`}
                    aria-haspopup="listbox"
                    aria-expanded={pageSizeMenuOpen}
                    onClick={() => setPageSizeMenuOpen((v) => !v)}
                  >
                    {pageSize === "all" ? "All" : pageSize}
                    <span aria-hidden> ▾</span>
                  </button>
                  {pageSizeMenuOpen ? (
                    <ul
                      className="collection-browse__page-size-menu"
                      role="listbox"
                    >
                      {PAGE_SIZE_PRESETS.map((n) => (
                        <li key={n}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={pageSize === n}
                            className={pageSize === n ? "active" : undefined}
                            onClick={() => applyPageSize(n)}
                          >
                            {n}
                          </button>
                        </li>
                      ))}
                      <li>
                        <button
                          type="button"
                          role="option"
                          aria-selected={pageSize === "all"}
                          className={pageSize === "all" ? "active" : undefined}
                          onClick={() => applyPageSize("all")}
                        >
                          All
                        </button>
                      </li>
                      <li className="collection-browse__page-size-custom">
                        <label>
                          Custom (10–100)
                          <input
                            type="text"
                            inputMode="numeric"
                            className="collection-browse__page-size-input"
                            aria-label="Custom items per page"
                            value={pageSizeInput === "all" ? "" : pageSizeInput}
                            onChange={(e) =>
                              setPageSizeInput(e.target.value.replace(/[^\d]/g, ""))
                            }
                            onBlur={commitPageSizeInput}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitPageSizeInput();
                              }
                            }}
                          />
                        </label>
                      </li>
                    </ul>
                  ) : null}
                </div>
                <div className="pagination-info collection-browse__page-center">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="collection-browse__page-num-input"
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
                <div className="collection-browse__page-nav">
                  {clearMode ? (
                    <>
                      <button
                        type="button"
                        className="collection-browse__remove-btn"
                        disabled={selectedIds.size === 0 || Boolean(busy)}
                        onClick={() => setRemoveConfirm(true)}
                      >
                        Remove
                        {selectedIds.size ? `\u00a0(${selectedIds.size})` : ""}
                      </button>
                      <button
                        type="button"
                        className="collection-browse__clear-cancel"
                        onClick={() => {
                          setClearMode(false);
                          setSelectedIds(new Set());
                          setRemoveConfirm(false);
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="pagination-arrow"
                        disabled={page <= 1 || pageSize === "all"}
                        aria-label="Previous page"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <span className="collection-browse__page-nav-label">‹ Prev</span>
                      </button>
                      <button
                        type="button"
                        className="pagination-arrow"
                        disabled={page >= pageCount || pageSize === "all"}
                        aria-label="Next page"
                        onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      >
                        <span className="collection-browse__page-nav-label">Next ›</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {busy ? <p className="muted">{busy}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {importPreview ? (
        <div className="collection-import-preview">
          <p>
            Import preview: add {importPreview.counts.add ?? 0}, update{" "}
            {importPreview.counts.update ?? 0}, unlinked{" "}
            {importPreview.counts.orphan ?? 0} ({importPreview.rows.length} rows)
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
        loading ? null : (
        <div
          className={`media-release-grid collection-cards${
            view === "banner"
              ? " media-release-grid--banner collection-cards--banner"
              : " collection-cards--cover"
          }`}
        >
          {items.map((card) => renderCard(card))}
        </div>
        )
      ) : (
        <div
          className="collection-table-wrap"
          ref={tableWrapRef}
          onScroll={virtualize ? virt.onScroll : undefined}
        >
          <table className="collection-table">
            <thead>
              <tr>
                {clearMode ? (
                  <th className="collection-table__check">
                    <label className="ms-checkbox" title="Select all on this page">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleSelectAllPage}
                        aria-label="Select all on this page"
                      />
                      <span className="ms-checkbox__box" aria-hidden />
                    </label>
                  </th>
                ) : null}
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
                const isChild = row.row_kind === "child";
                const isHead = Boolean(row.is_group_head) || row.row_kind === "leaf";
                const sharedTitle = row.group_title || row.title;
                const sharedArtist = row.group_artist || row.artist;
                const sharedType = row.group_release_type ?? row.release_type;
                const sharedGenres = row.group_genres ?? row.genres ?? [];
                const sharedIso = row.group_country_iso || row.country_iso;
                const siblings =
                  row.group_versions && row.group_versions.length > 0
                    ? row.group_versions
                    : renderRows.filter(
                        (r) =>
                          (r.group_key || `${r.artist}|${r.title}`) ===
                          (row.group_key || `${row.artist}|${row.title}`)
                      );
                const groupEditions = siblings.map((v) => ({
                  id: v.id,
                  label: v.edition || v.media_type || "Edition",
                  logo_url: v.logo_url,
                  photocard_pairs: v.photocard_pairs,
                }));
                const logoEditions = groupEditions.length
                  ? groupEditions
                  : [
                      {
                        id: row.id,
                        label: row.edition || "Edition",
                        logo_url: row.logo_url,
                        photocard_pairs: row.photocard_pairs,
                      },
                    ];
                const hasLogos = assetsHave(logoEditions, "logo");
                const hasPhotocards = assetsHave(logoEditions, "photocards");
                const canFlipDisc = Boolean(row.disc_url && row.disc_b_url);
                const titleRow: CollectionLeaf = {
                  ...row,
                  title: sharedTitle,
                  artist: sharedArtist,
                  country_iso: sharedIso,
                };
                const artistRow: CollectionLeaf = {
                  ...row,
                  artist: sharedArtist,
                  country_iso: sharedIso,
                };
                const blankShared = !isHead;
                const rowId = row.id;

                return (
                  <tr
                    key={
                      rowId ??
                      `${row.artist}-${row.title}-${row.edition}-${row.media_type}-${row.group_key || ""}`
                    }
                    className={
                      isChild
                        ? `collection-table__child${
                            row.is_group_head ? " collection-table__child--head" : ""
                          }`
                        : undefined
                    }
                    style={virtualize ? { height: ROW_HEIGHT } : undefined}
                  >
                    {clearMode ? (
                      <td className="collection-table__check">
                        {rowId ? (
                          <label className="ms-checkbox">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(rowId)}
                              onChange={() => toggleSelectId(rowId)}
                              aria-label={`Select ${row.edition || row.title}`}
                            />
                            <span className="ms-checkbox__box" aria-hidden />
                          </label>
                        ) : null}
                      </td>
                    ) : null}
                    <td
                      className={
                        isHead && (row.group_span || 0) > 1
                          ? "collection-table__shared collection-table__indent"
                          : blankShared
                            ? "collection-table__shared-blank"
                            : undefined
                      }
                    >
                      {blankShared ? null : (
                        <HoverBubble
                          disabled={!hasLogos}
                          content={
                            <EditionAssetPreview mode="logo" editions={logoEditions} />
                          }
                        >
                          <span className="collection-table__group-title">
                            <span className="collection-table__group-title-main">
                              {titleControl(titleRow)}
                            </span>
                            {(row.group_span || 0) > 1 ? (
                              <span className="collection-table__group-title-sub">
                                {row.group_span} versions
                              </span>
                            ) : null}
                          </span>
                        </HoverBubble>
                      )}
                    </td>
                    <td
                      className={`collection-table__type${
                        blankShared ? " collection-table__shared-blank" : ""
                      }`}
                    >
                      {blankShared ? null : sharedType || "—"}
                    </td>
                    <td className={blankShared ? "collection-table__shared-blank" : undefined}>
                      {blankShared ? null : (
                        <HoverBubble
                          bare
                          disabled={!hasPhotocards}
                          content={
                            <EditionAssetPreview
                              mode="photocards"
                              editions={logoEditions}
                            />
                          }
                        >
                          {artistControl(artistRow)}
                        </HoverBubble>
                      )}
                    </td>
                    <td
                      className={`collection-table__genres${
                        blankShared ? " collection-table__shared-blank" : ""
                      }`}
                    >
                      {blankShared ? null : <GenrePills genres={sharedGenres} />}
                    </td>
                    <td>
                      <span className="collection-edition">
                        <SpotifyFlip
                          active={Boolean(
                            row.spotify_icon_active ||
                              (row.cover_banner_url &&
                                (row.spotify_code_url || row.spotify_card_url))
                          )}
                          bannerUrl={row.cover_banner_url}
                          cardUrl={row.spotify_card_url}
                          codeUrl={row.spotify_code_url}
                        />
                        <EditionCoverHover
                          coverUrl={row.cover_url}
                          photoSquareUrl={row.photo_square_url}
                          onNavigate={() => navigateTitle(row)}
                        >
                          {row.edition || "—"}
                        </EditionCoverHover>
                      </span>
                    </td>
                    <td className="collection-table__year">
                      <HoverBubble
                        bare
                        disabled={!leafDisplayDate(row)}
                        content={
                          <span className="collection-year-tip">
                            {leafDisplayDate(row)}
                          </span>
                        }
                      >
                        {leafYear(row)}
                      </HoverBubble>
                    </td>
                    <td>
                      <HoverBubble
                        disabled={!row.disc_url && !row.disc_b_url}
                        interactive={canFlipDisc}
                        content={
                          <DiscFlipPreview
                            discUrl={row.disc_url}
                            discBUrl={row.disc_b_url}
                            mediaType={row.media_type}
                          />
                        }
                      >
                        {row.media_type || "—"}
                        {row.version ? (
                          <span className="collection-table__media-variant">
                            {" "}
                            · {row.version}
                          </span>
                        ) : null}
                      </HoverBubble>
                    </td>
                    <td>
                      <HoverBubble
                        bare
                        disabled={!row.animation_url}
                        content={
                          row.animation_url ? (
                            <video
                              src={row.animation_url}
                              muted
                              autoPlay
                              loop
                              playsInline
                              className="collection-hover__media"
                            />
                          ) : null
                        }
                      >
                        <span className={!row.animation_url ? "is-muted" : undefined}>
                          {(row.animation || []).join(" / ") || "—"}
                        </span>
                      </HoverBubble>
                    </td>
                    <td>
                      <HoverBubble
                        bare
                        disabled={!row.canvas_url}
                        content={
                          row.canvas_url ? (
                            <video
                              src={row.canvas_url}
                              muted
                              autoPlay
                              loop
                              playsInline
                              className="collection-hover__canvas"
                            />
                          ) : null
                        }
                      >
                        <span className={!row.canvas_url ? "is-muted" : undefined}>
                          {(row.canvas || []).join(" / ") || "—"}
                        </span>
                      </HoverBubble>
                    </td>
                    <td>
                      <HoverBubble
                        disabled={
                          !(row.autograph_images && row.autograph_images.length > 0)
                        }
                        content={
                          row.autograph_images && row.autograph_images.length > 0 ? (
                            <div className="collection-hover__photos">
                              {row.autograph_images.map((a) =>
                                a.url ? <img key={a.label} src={a.url} alt={a.label} /> : null
                              )}
                            </div>
                          ) : null
                        }
                      >
                        {(row.autographs || []).join(", ") || "—"}
                      </HoverBubble>
                    </td>
                    <td className="collection-table__pending">
                      {(row.pending || []).length ? (
                        <button
                          type="button"
                          className="collection-table__pending-btn"
                          onClick={() => {
                            if (row.id) setModal({ mode: "edit", id: row.id });
                          }}
                          title={`${(row.pending || []).length} item${
                            (row.pending || []).length === 1 ? "" : "s"
                          } pending`}
                        >
                          {(row.pending || []).length} item
                          {(row.pending || []).length === 1 ? "" : "s"}
                        </button>
                      ) : (
                        "—"
                      )}
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

      {removeConfirm ? (
        <ModalPortal
          onClose={() => {
            if (busy) return;
            setRemoveConfirm(false);
            setRemoveSeeItems(false);
          }}
        >
          <div
            className="modal-panel collection-remove-modal__panel"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-panel-header">
              <h3>Remove from collection</h3>
              <button
                type="button"
                className="modal-close-x"
                aria-label="Close"
                onClick={() => {
                  setRemoveConfirm(false);
                  setRemoveSeeItems(false);
                }}
                disabled={Boolean(busy)}
              >
                ×
              </button>
            </div>
            <p>
              You are about to permanently remove{" "}
              <strong>{selectedIds.size}</strong> item
              {selectedIds.size === 1 ? "" : "s"} from your collection. This cannot be
              undone.{" "}
              <button
                type="button"
                className="collection-remove-modal__see-items"
                onClick={() => setRemoveSeeItems((v) => !v)}
              >
                {removeSeeItems ? "Hide items" : "See items"}
              </button>
            </p>
            {removeSeeItems ? (
              <ul className="collection-remove-modal__list">
                {visibleRows
                  .filter((r) => r.id && selectedIds.has(r.id))
                  .map((r) => (
                    <li key={r.id}>
                      {[r.artist, r.title].filter(Boolean).join(" — ")}
                      {r.edition || r.media_type
                        ? ` (${[r.edition, r.media_type].filter(Boolean).join(" · ")})`
                        : ""}
                    </li>
                  ))}
              </ul>
            ) : null}
            <div className="modal-panel-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void confirmRemoveSelected()}
                disabled={Boolean(busy) || selectedIds.size === 0}
              >
                Remove
              </button>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}
