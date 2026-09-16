import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  commitCollectionImport,
  exportCollectionXlsx,
  fetchCollection,
  previewCollectionImport,
} from "../../api";
import type { CardOrientation, CollectionLeaf } from "../../types";
import CollectionModal from "./CollectionModal";
import {
  DiscFlipPreview,
  ExternalSearchMenu,
  HoverBubble,
  openSearchCascade,
  PhotocardFlipPreview,
  SpotifyFlip,
  useVirtualWindow,
} from "./collectionHover";

type Props = {
  cardOrientation?: CardOrientation;
  onOpenArtist?: (bandId: number) => void;
  onOpenRelease?: (bandId: number, releaseId: string) => void;
};

const PAGE_PRESETS = [10, 30, 70, 100] as const;
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
  { id: "", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "autographs", label: "Autographs" },
  { id: "orphan", label: "Orphan" },
  { id: "matched", label: "Matched" },
  { id: "media", label: "Media" },
  { id: "animation", label: "Animation" },
  { id: "canvas", label: "Canvas" },
] as const;

export default function CollectionBrowse({
  cardOrientation = "portrait",
  onOpenArtist,
  onOpenRelease,
}: Props) {
  const [view, setView] = useState<"table" | "cards">("table");
  const [items, setItems] = useState<CollectionLeaf[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [subfilter, setSubfilter] = useState("");
  const [mediaFilter, setMediaFilter] = useState("");
  const [animFilter, setAnimFilter] = useState("");
  const [canvasFilter, setCanvasFilter] = useState("");
  const [sort, setSort] = useState("artist");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | "all">(30);
  const [customPageSize, setCustomPageSize] = useState("");
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
        sort,
        order,
        view,
        page: pageSize === "all" ? 1 : page,
        page_size: size,
      });
      setItems(data.items);
      setTotal(data.total);
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
    sort,
    order,
    view,
    page,
    pageSize,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = useMemo(() => {
    if (pageSize === "all") return 1;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);

  const visibleRows = useMemo(() => {
    return items.filter((row) => {
      if (row.row_kind === "child" && expandedGroups[row.group_key || ""] === false) {
        return false;
      }
      return true;
    });
  }, [items, expandedGroups]);

  const virtualize = pageSize === "all" && view === "table" && visibleRows.length > 80;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

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

  const empty = !loading && items.length === 0;

  return (
    <div className="collection-browse">
      <div className="collection-browse__toolbar">
        <div className="collection-browse__tabs">
          {SUBFILTERS.map((sf) => (
            <button
              key={sf.id || "all"}
              type="button"
              className={subfilter === sf.id ? "active" : undefined}
              onClick={() => {
                setSubfilter(sf.id);
                setPage(1);
              }}
            >
              {sf.label}
            </button>
          ))}
        </div>
        <div className="collection-browse__actions">
          <input
            className="collection-browse__search"
            placeholder="Search collection…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <button type="button" className="btn" onClick={() => setView(view === "table" ? "cards" : "table")}>
            {view === "table" ? "Cards" : "List"}
          </button>
          <button type="button" className="btn" onClick={() => setModal({ mode: "manual" })}>
            Add manually
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import Excel
          </button>
          <button type="button" className="btn" onClick={() => void onExport()}>
            Export Excel
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => void onPickImport(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      {subfilter === "media" ? (
        <div className="collection-browse__subrow">
          <input
            placeholder="Media type (LP, CD…)"
            value={mediaFilter}
            onChange={(e) => setMediaFilter(e.target.value)}
          />
        </div>
      ) : null}
      {subfilter === "animation" ? (
        <div className="collection-browse__subrow">
          <input
            placeholder="Animation source"
            value={animFilter}
            onChange={(e) => setAnimFilter(e.target.value)}
          />
        </div>
      ) : null}
      {subfilter === "canvas" ? (
        <div className="collection-browse__subrow">
          <input
            placeholder="Canvas source"
            value={canvasFilter}
            onChange={(e) => setCanvasFilter(e.target.value)}
          />
        </div>
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
            Import an Excel file, add manually, or use <strong>Add to my collection</strong> on a
            release tracklist.
          </p>
          <div className="collection-browse__empty-actions">
            <button type="button" className="btn btn--primary" onClick={() => fileRef.current?.click()}>
              Import Excel
            </button>
            <button type="button" className="btn" onClick={() => setModal({ mode: "manual" })}>
              Add manually
            </button>
          </div>
        </div>
      ) : view === "cards" ? (
        <div className={`collection-cards collection-cards--${cardOrientation}`}>
          {items.map((card) => (
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
              <button
                type="button"
                className="collection-card__cover"
                onClick={() => {
                  const leaf = card.versions?.[0] || card;
                  navigateTitle(leaf);
                }}
              >
                {card.cover_url ? (
                  <img src={card.cover_url} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="collection-card__placeholder">No cover</span>
                )}
              </button>
              <div className="collection-card__meta">
                <button type="button" className="collection-card__title" onClick={() => navigateTitle(card.versions?.[0] || card)}>
                  {card.title}
                </button>
                <button type="button" className="collection-card__artist" onClick={() => navigateArtist(card.versions?.[0] || card)}>
                  {card.country_iso ? (
                    <span className={`fi fi-${card.country_iso.toLowerCase()}`} aria-hidden />
                  ) : null}
                  {card.artist}
                </button>
                {(card.version_count || card.versions?.length || 0) > 1 ? (
                  <details className="collection-card__versions">
                    <summary>{card.version_count || card.versions?.length} versions</summary>
                    <ul>
                      {(card.versions || []).map((v) => (
                        <li key={v.id}>
                          {v.edition}
                          {v.version ? ` · ${v.version}` : ""} · {v.media_type}
                          {v.orphan ? " (orphan)" : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <span className="muted">
                    {(card.versions?.[0] || card).edition} · {(card.versions?.[0] || card).media_type}
                  </span>
                )}
              </div>
            </article>
          ))}
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
                      row.row_kind === "child"
                        ? "collection-table__child"
                        : undefined
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
                      <span className="collection-pills">
                        {(row.genres || []).map((g) => (
                          <span key={g} className="collection-pill">
                            {g}
                          </span>
                        ))}
                      </span>
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
                      {(row.pending || []).length
                        ? (row.pending || []).slice(0, 3).join(", ") +
                          ((row.pending || []).length > 3 ? "…" : "")
                        : "—"}
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

      {!empty ? (
        <div className="collection-browse__pager">
          <label>
            Per page{" "}
            <select
              value={pageSize === "all" ? "all" : String(pageSize)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "all") setPageSize("all");
                else setPageSize(Number(v));
                setPage(1);
              }}
            >
              {PAGE_PRESETS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="all">All</option>
            </select>
          </label>
          <label>
            Custom{" "}
            <input
              value={customPageSize}
              onChange={(e) => setCustomPageSize(e.target.value)}
              onBlur={() => {
                const n = Number(customPageSize);
                if (n > 0) {
                  setPageSize(Math.min(10000, Math.floor(n)));
                  setPage(1);
                }
              }}
              placeholder="e.g. 50"
            />
          </label>
          <span className="muted">
            {total} item{total === 1 ? "" : "s"}
          </span>
          {pageSize !== "all" ? (
            <span className="collection-browse__pager-nav">
              <button
                type="button"
                className="btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <span>
                {page} / {pageCount}
              </span>
              <button
                type="button"
                className="btn"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                Next
              </button>
            </span>
          ) : null}
        </div>
      ) : null}

      {modal ? (
        <CollectionModal
          open
          mode={modal.mode}
          collectionId={modal.id}
          onClose={() => setModal(null)}
          onSaved={() => void load()}
        />
      ) : null}
    </div>
  );
}
