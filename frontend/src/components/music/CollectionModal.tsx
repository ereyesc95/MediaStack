import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  deleteCollectionItem,
  fetchCollectionItem,
  fetchCollectionMatches,
  fetchCollectionPreviewFromFolder,
  pickCollectionFolder,
  upsertCollectionItem,
  updateCollectionItem,
} from "../../api";
import { formatTrackDate } from "../../formatDate";
import type { CollectionLeaf, CollectionPreview } from "../../types";
import { IconPlus, IconSync, IconTrash } from "../MenuIcons";
import ModalPortal from "../ModalPortal";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  mode: "add" | "edit" | "manual";
  bandId?: number | null;
  folderPath?: string | null;
  collectionId?: number | null;
  isAdmin?: boolean;
};

const RELEASE_TYPES = [
  "Studio Album",
  "Extended Play",
  "Compilation",
  "Soundtrack",
  "Live Album",
  "Single",
];

const MEDIA_TYPES = [
  "LP",
  "CD",
  '7"',
  '10"',
  "BOX",
  "Cassette",
  "Digital",
  "DVD",
  "SACD",
  "MiniDisc",
  "Flexi",
];

const ARTWORK_ORDER = [
  "Cover",
  "Photo",
  "Photocards",
  "Codes",
  "Media",
  "Branding",
  "Booklet",
  "Autographs",
  "Other",
] as const;

type ArtworkItem = {
  label: string;
  missing?: boolean;
  url?: string | null;
  source?: string | null;
  canonical?: string | null;
};

const CODE_ALIASES: Record<string, string> = {
  "spotify - code": "Code - Spotify",
  "code - spotify": "Code - Spotify",
  spotify: "Code - Spotify",
  "spotify code": "Code - Spotify",
  "spotify - card": "Code - Spotify Card",
  "code - spotify card": "Code - Spotify Card",
  "spotify card": "Code - Spotify Card",
  "qr - code": "Code - QR",
  "code - qr": "Code - QR",
  qr: "Code - QR",
  "qr code": "Code - QR",
  "qr - card": "Code - QR Card",
  "code - qr card": "Code - QR Card",
  "qr card": "Code - QR Card",
};

function canonicalArtworkName(raw: string): string {
  const trimmed = raw.trim();
  return CODE_ALIASES[trimmed.toLowerCase()] || trimmed;
}

function shortArtworkLabel(canonical: string): string {
  for (const prefix of [
    "Cover - ",
    "Photo - ",
    "Photocard - ",
    "Booklet - ",
    "Code - ",
    "Autograph - ",
    "Logo - ",
  ]) {
    if (canonical.toLowerCase().startsWith(prefix.toLowerCase())) {
      return canonical.slice(prefix.length).trim();
    }
  }
  return canonical;
}

function artworkGroupFor(canonical: string, fallback: string): string {
  const low = canonical.toLowerCase();
  if (CODE_ALIASES[low] || low.startsWith("code - ") || low.startsWith("code-")) {
    return "Codes";
  }
  if (low.startsWith("cover - ") || low.startsWith("animation") || low.startsWith("canvas")) {
    return "Cover";
  }
  if (low.startsWith("photo - ") || low.startsWith("photo-")) return "Photo";
  if (low.startsWith("photocard")) return "Photocards";
  if (low.startsWith("booklet")) return "Booklet";
  if (low === "logo" || low.startsWith("logo ") || low.startsWith("logo-") || low === "icon") {
    return "Branding";
  }
  if (low.startsWith("autograph")) return "Autographs";
  if (low === "disc" || low.startsWith("side ") || low === "side a" || low === "side b") {
    return "Media";
  }
  return fallback;
}

function normalizeArtworkGroups(
  artwork: CollectionPreview["artwork"]
): [string, ArtworkItem[]][] {
  if (!artwork) return [];
  const buckets = new Map<string, ArtworkItem[]>();
  for (const [group, items] of Object.entries(artwork)) {
    for (const item of items || []) {
      const raw = (item.canonical || item.label || "").trim();
      const canonical = canonicalArtworkName(raw);
      const nextGroup = artworkGroupFor(canonical, group);
      const label = shortArtworkLabel(canonical);
      const list = buckets.get(nextGroup) ?? [];
      list.push({ ...item, label, canonical });
      buckets.set(nextGroup, list);
    }
  }
  const entries: [string, ArtworkItem[]][] = [];
  for (const [group, items] of buckets) {
    const byLabel = new Map<string, ArtworkItem>();
    for (const item of items) {
      const key = item.label.toLowerCase();
      const prev = byLabel.get(key);
      if (!prev || (prev.missing && !item.missing)) byLabel.set(key, item);
    }
    const sorted = [...byLabel.values()].sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
    if (sorted.length) entries.push([group, sorted]);
  }
  entries.sort((a, b) => {
    const ia = ARTWORK_ORDER.indexOf(a[0] as (typeof ARTWORK_ORDER)[number]);
    const ib = ARTWORK_ORDER.indexOf(b[0] as (typeof ARTWORK_ORDER)[number]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return entries;
}

function sourceClass(label: string | undefined) {
  const low = (label || "").toLowerCase();
  if (low === "none" || low.split(/[/|,]/).every((p) => p.trim() === "none")) {
    return "collection-modal__none";
  }
  return undefined;
}

function dispatchCollectionChanged() {
  window.dispatchEvent(new CustomEvent("collection-changed"));
}

export default function CollectionModal({
  open,
  onClose,
  onSaved,
  mode,
  bandId,
  folderPath,
  collectionId,
  isAdmin = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkToast, setLinkToast] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [preview, setPreview] = useState<CollectionPreview | null>(null);
  const [existingId, setExistingId] = useState<number | null>(collectionId ?? null);

  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [edition, setEdition] = useState("Standard Edition");
  const [releaseType, setReleaseType] = useState("Studio Album");
  const [originalDate, setOriginalDate] = useState("");
  const [editionDate, setEditionDate] = useState("");
  const [mediaType, setMediaType] = useState("LP");
  const [version, setVersion] = useState("");
  const [country, setCountry] = useState("");
  const [countryIso, setCountryIso] = useState("");
  const [genres, setGenres] = useState("");
  const [animation, setAnimation] = useState("");
  const [canvas, setCanvas] = useState("");
  const [autographs, setAutographs] = useState("");
  const [notes, setNotes] = useState("");
  const [folder, setFolder] = useState(folderPath || "");
  const [releaseFolder, setReleaseFolder] = useState("");
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [resolvedBandId, setResolvedBandId] = useState<number | null>(bandId ?? null);
  const [artwork, setArtwork] = useState<CollectionPreview["artwork"]>(undefined);
  const [missing, setMissing] = useState<string[]>([]);
  const [matches, setMatches] = useState<
    {
      band_id: number;
      artist?: string | null;
      title?: string | null;
      folder_path?: string | null;
      release_id?: string | null;
    }[]
  >([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setConfirmRemove(false);
    setLinkToast(null);
    setLoading(true);

    (async () => {
      try {
        if ((mode === "edit" || mode === "add") && collectionId) {
          const item = await fetchCollectionItem(collectionId);
          if (cancelled) return;
          applyLeaf(item);
          setExistingId(item.id ?? collectionId);
        } else if (mode === "add" && bandId && folderPath) {
          const data = await fetchCollectionPreviewFromFolder(bandId, folderPath);
          if (cancelled) return;
          applyPreview(data);
          setExistingId(data.collection_id ?? null);
        } else {
          resetManual();
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, mode, bandId, folderPath, collectionId]);

  function resetManual() {
    setTitle("");
    setArtist("");
    setEdition("Standard Edition");
    setReleaseType("Studio Album");
    setOriginalDate("");
    setEditionDate("");
    setMediaType("LP");
    setVersion("");
    setCountry("");
    setCountryIso("");
    setGenres("");
    setAnimation("");
    setCanvas("");
    setAutographs("");
    setNotes("");
    setFolder("");
    setReleaseFolder("");
    setReleaseId(null);
    setResolvedBandId(null);
    setArtwork(undefined);
    setMissing([]);
    setExistingId(null);
    setPreview(null);
    setMatches([]);
  }

  useEffect(() => {
    if (!open) return;
    if (folder) {
      setMatches([]);
      return;
    }
    const a = artist.trim();
    const t = title.trim();
    if (!a) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void fetchCollectionMatches(a, t)
        .then((res) => {
          if (!cancelled) setMatches(res.items || []);
        })
        .catch(() => {
          if (!cancelled) setMatches([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, artist, title, folder]);

  useEffect(() => {
    if (!linkToast) return;
    const t = window.setTimeout(() => setLinkToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [linkToast]);

  function applyMatch(m: {
    band_id: number;
    artist?: string | null;
    title?: string | null;
    folder_path?: string | null;
    release_id?: string | null;
  }) {
    setResolvedBandId(m.band_id);
    if (m.folder_path) {
      setFolder(m.folder_path);
      setReleaseFolder(m.folder_path);
    }
    if (m.release_id) setReleaseId(m.release_id);
    if (m.artist) setArtist(m.artist);
    if (m.title) setTitle(m.title);
  }

  function applyPreview(data: CollectionPreview) {
    setPreview(data);
    setTitle(data.title || "");
    setArtist(data.artist || "");
    setEdition(data.edition || "Standard Edition");
    setReleaseType(data.release_type || "Studio Album");
    setOriginalDate(data.original_release_date || "");
    setEditionDate(data.release_date || "");
    setMediaType(data.media_type || "Digital");
    setVersion(data.version || "");
    setCountry(data.country || "");
    setCountryIso(data.country_iso || "");
    setGenres((data.genres || []).join(", "));
    setAnimation((data.animation || []).join(" / "));
    setCanvas((data.canvas || []).join(" / "));
    setAutographs((data.autographs || []).join(", "));
    setFolder(data.folder_path || folderPath || "");
    setReleaseFolder(data.release_folder_path || "");
    setReleaseId(data.release_id || null);
    setResolvedBandId(data.band_id ?? bandId ?? null);
    setArtwork(data.artwork);
    setMissing(data.missing_mandatory || []);
  }

  function applyLeaf(item: CollectionLeaf) {
    setTitle(item.title || "");
    setArtist(item.artist || "");
    setEdition(item.edition || "Standard Edition");
    setReleaseType(item.release_type || "Studio Album");
    setOriginalDate(item.original_date || "");
    setEditionDate(item.edition_date || "");
    setMediaType(item.media_type || "Digital");
    setVersion(item.version || "");
    setCountry(item.country || "");
    setCountryIso(item.country_iso || "");
    setGenres((item.genres || []).join(", "));
    setAnimation((item.animation || []).join(" / "));
    setCanvas((item.canvas || []).join(" / "));
    setAutographs((item.autographs || []).join(", "));
    setNotes(item.notes || "");
    setFolder(item.folder_path || "");
    setReleaseFolder(item.release_folder_path || "");
    setReleaseId(item.release_id || null);
    setResolvedBandId(item.band_id ?? null);
    setArtwork(item.artwork as CollectionPreview["artwork"]);
    setMissing(item.missing_mandatory || item.pending || []);
  }

  const isStandardEdition = edition.trim().toLowerCase() === "standard edition";
  const showEditionDate = !isStandardEdition && Boolean(editionDate || preview?.release_date);
  const showVersion = !isStandardEdition && Boolean(version.trim());

  const artworkGroups = useMemo(() => normalizeArtworkGroups(artwork), [artwork]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) return;
    const check = () => {
      el.classList.toggle("is-scrollable", el.scrollHeight > el.clientHeight + 2);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [open, artworkGroups, folder, genres, edition, notes]);

  async function handleSyncLocal() {
    if (!resolvedBandId || !folder) {
      setLinkToast("Link a local folder before syncing artwork.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await fetchCollectionPreviewFromFolder(resolvedBandId, folder);
      setArtwork(data.artwork);
      setMissing(data.missing_mandatory || []);
      setAnimation((data.animation || []).join(" / "));
      setCanvas((data.canvas || []).join(" / "));
      setAutographs((data.autographs || []).join(", "));
      setPreview((prev) => ({ ...(prev || {}), ...data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleLinkFolder() {
    setError(null);
    try {
      const res = await pickCollectionFolder();
      if (res.cancelled) return;
      if (!res.ok) {
        setLinkToast(res.error || "Source folder not valid.");
        return;
      }
      if (res.preview) {
        applyPreview(res.preview);
        setExistingId(res.preview.collection_id ?? null);
      } else if (res.folder_path) {
        setFolder(res.folder_path);
        setReleaseFolder(res.folder_path);
        if (res.band_id) setResolvedBandId(res.band_id);
        if (res.artist_name) setArtist(res.artist_name);
        if (res.title) setTitle(res.title);
      }
    } catch (e) {
      setLinkToast(e instanceof Error ? e.message : "Source folder not valid.");
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const body = {
      artist: artist.trim(),
      title: title.trim(),
      edition: edition.trim() || "Standard Edition",
      release_type: releaseType,
      original_date: originalDate || null,
      edition_date: showEditionDate ? editionDate || null : null,
      media_type: mediaType,
      version: showVersion ? version || null : null,
      genres: genres
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      country: country || null,
      country_iso: countryIso || null,
      animation: animation
        .split(/[/|,]/)
        .map((s) => s.trim())
        .filter(Boolean),
      canvas: canvas
        .split(/[/|,]/)
        .map((s) => s.trim())
        .filter(Boolean),
      autographs: autographs
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      folder_path: folder || null,
      release_folder_path: releaseFolder || null,
      band_id: resolvedBandId,
      release_id: releaseId,
      notes: notes || null,
    };
    try {
      if (existingId) {
        await updateCollectionItem(existingId, body);
      } else {
        await upsertCollectionItem(body);
      }
      dispatchCollectionChanged();
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveConfirmed() {
    if (!existingId) return;
    setSaving(true);
    setConfirmRemove(false);
    try {
      await deleteCollectionItem(existingId);
      dispatchCollectionChanged();
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const heading =
    mode === "edit" || existingId
      ? "Edit in my collection"
      : "Add to my collection";

  const originalDisplay =
    preview?.original_release_date_display ||
    formatTrackDate(originalDate) ||
    originalDate ||
    "";
  const editionDisplay =
    preview?.release_date_display ||
    formatTrackDate(editionDate) ||
    editionDate ||
    "";

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-backdrop" onClick={onClose}>
        <div
          className="modal-panel collection-modal"
          role="dialog"
          aria-modal="true"
          aria-label={heading}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="modal-panel-header collection-modal__header">
            <h3>{heading}</h3>
            <button
              type="button"
              className="artist-word-cloud-modal__close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <div className="collection-modal__scroll" ref={scrollRef}>
            {folder ? (
              <p className="muted collection-modal__hint collection-modal__linked">
                <span className="collection-badge">Linked</span>{" "}
                {folder}
              </p>
            ) : (
              <p className="muted collection-modal__hint collection-modal__linked">
                <span className="collection-badge">Unlinked</span> No local folder
                yet,{" "}
                <button
                  type="button"
                  className="collection-modal__linkish"
                  onClick={() => void handleLinkFolder()}
                >
                  link here
                </button>
              </p>
            )}

            {linkToast ? (
              <p className="collection-modal__toast" role="status">
                {linkToast}
              </p>
            ) : null}

            {loading ? (
              <p className="muted">Loading…</p>
            ) : (
              <div className="collection-modal__body">
                {error ? <p className="error">{error}</p> : null}

                <div className="collection-modal__columns">
                  <section className="collection-modal__col">
                    <h4 className="collection-modal__section-title">Release</h4>
                    <EditableField
                      label="Title"
                      value={title}
                      onChange={setTitle}
                      editable={isAdmin}
                    />
                    <EditableField
                      label="Artist"
                      value={artist}
                      onChange={setArtist}
                      editable={isAdmin}
                    />
                    <EditableField
                      label="Release date"
                      value={originalDate}
                      displayValue={originalDisplay}
                      onChange={setOriginalDate}
                      editable={isAdmin}
                    />
                    <EditableField
                      label="Edition"
                      value={edition}
                      onChange={setEdition}
                      editable={isAdmin}
                    />
                    {showEditionDate ? (
                      <EditableField
                        label="Edition date"
                        value={editionDate}
                        displayValue={editionDisplay}
                        onChange={setEditionDate}
                        editable={isAdmin}
                      />
                    ) : null}
                    <EditableField
                      label="Country"
                      value={country}
                      onChange={setCountry}
                      editable={isAdmin}
                      prefix={
                        countryIso ? (
                          <span
                            className={`fi fi-${countryIso.toLowerCase()}`}
                            aria-hidden
                          />
                        ) : null
                      }
                    />
                    <EditableField
                      label="Genre"
                      value={genres}
                      onChange={setGenres}
                      editable={isAdmin}
                    />
                  </section>

                  <section className="collection-modal__col">
                    <h4 className="collection-modal__section-title">Media</h4>
                    <EditableField
                      label="Release type"
                      value={releaseType}
                      onChange={setReleaseType}
                      options={RELEASE_TYPES}
                      editable={isAdmin}
                    />
                    <EditableField
                      label="Media type"
                      value={mediaType}
                      onChange={setMediaType}
                      options={MEDIA_TYPES}
                      editable={isAdmin}
                    />
                    {showVersion ? (
                      <EditableField
                        label="Version"
                        value={version}
                        onChange={setVersion}
                        editable={isAdmin}
                      />
                    ) : null}
                    <EditableField
                      label="Animation"
                      value={animation}
                      onChange={setAnimation}
                      noneClass
                      editable={isAdmin}
                    />
                    <EditableField
                      label="Canvas"
                      value={canvas}
                      onChange={setCanvas}
                      noneClass
                      editable={isAdmin}
                    />
                    <EditableField
                      label="Autographs"
                      value={autographs}
                      onChange={setAutographs}
                      noneClass
                      editable={isAdmin}
                    />
                    <EditableField
                      label="Notes"
                      value={notes}
                      onChange={setNotes}
                      multiline
                      noneClass
                      editable={isAdmin}
                    />
                  </section>
                </div>

                {!folder && matches.length > 0 ? (
                  <div className="collection-modal__matches">
                    <h3>Possible local matches</h3>
                    <ul>
                      {matches.map((m) => (
                        <li
                          key={`${m.band_id}-${m.folder_path || m.release_id || m.title}`}
                        >
                          <button
                            type="button"
                            className="btn"
                            onClick={() => applyMatch(m)}
                          >
                            Link
                          </button>
                          <span>
                            {m.artist || artist}
                            {m.title ? ` — ${m.title}` : ""}
                            {m.folder_path ? (
                              <span className="muted"> · {m.folder_path}</span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {artworkGroups.length > 0 ? (
                  <div className="collection-modal__artwork">
                    <h4 className="collection-modal__section-title">Artwork</h4>
                    <div className="collection-modal__artwork-cols">
                      {artworkGroups.map(([group, items]) => (
                        <div key={group}>
                          <h5 className="collection-modal__artwork-group">
                            {group}
                          </h5>
                          <ul>
                            {(items || []).map((it) => {
                              const showSource =
                                !it.missing &&
                                (group === "Cover") &&
                                /^(animation|canvas)$/i.test(it.label);
                              const src =
                                it.source ||
                                (showSource ? "Official" : null);
                              return (
                                <li
                                  key={`${it.label}-${it.missing ? "m" : "p"}`}
                                  className={
                                    it.missing
                                      ? "collection-modal__missing-item"
                                      : undefined
                                  }
                                >
                                  {it.label}
                                  {showSource && src ? (
                                    <span className="collection-modal__art-source">
                                      {" "}
                                      ({src})
                                    </span>
                                  ) : null}
                                  {it.missing ? (
                                    <span className="collection-modal__missing">
                                      {" "}
                                      (Missing)
                                    </span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : missing.length > 0 ? (
                  <p className="muted">
                    Pending:{" "}
                    {missing.map((m) => (
                      <span key={m} className="collection-modal__missing">
                        {m};{" "}
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <footer className="modal__footer collection-modal__footer">
            {existingId ? (
              <button
                type="button"
                className="btn btn--danger collection-modal__remove"
                onClick={() => setConfirmRemove(true)}
                disabled={saving}
              >
                <IconTrash className="collection-modal__btn-icon" />
                Remove from collection
              </button>
            ) : (
              <span />
            )}
            <div className="collection-modal__footer-right">
              {folder ? (
                <button
                  type="button"
                  className="btn collection-modal__sync"
                  onClick={() => void handleSyncLocal()}
                  disabled={saving}
                >
                  <IconSync className="collection-modal__btn-icon" />
                  Sync local files
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn--primary collection-modal__add"
                onClick={() => void handleSave()}
                disabled={saving || !title.trim() || !artist.trim()}
              >
                <IconPlus className="collection-modal__btn-icon" />
                {saving ? "Saving…" : existingId ? "Save" : "Add"}
              </button>
            </div>
          </footer>

          {confirmRemove ? (
            <div className="collection-modal__confirm" role="alertdialog">
              <p>Remove this release from your collection?</p>
              <div className="collection-modal__confirm-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setConfirmRemove(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => void handleRemoveConfirmed()}
                  disabled={saving}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </ModalPortal>
  );
}

type EditableFieldProps = {
  label: string;
  value: string;
  displayValue?: string;
  onChange: (next: string) => void;
  options?: readonly string[];
  multiline?: boolean;
  noneClass?: boolean;
  prefix?: ReactNode;
  editable?: boolean;
};

function EditableField({
  label,
  value,
  displayValue,
  onChange,
  options,
  multiline,
  noneClass,
  prefix,
  editable = false,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const shown = (displayValue ?? value).trim();
  const isEmpty = !shown;
  const text = isEmpty ? "None" : shown;

  if (editable && editing) {
    if (options) {
      return (
        <div className="collection-modal__row collection-modal__row--editing">
          <span className="collection-modal__row-label">{label}:</span>
          <select
            autoFocus
            value={value || options[0]}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setEditing(false)}
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    }
    if (multiline) {
      return (
        <div className="collection-modal__row collection-modal__row--editing">
          <span className="collection-modal__row-label">{label}:</span>
          <textarea
            autoFocus
            rows={2}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setEditing(false)}
          />
        </div>
      );
    }
    return (
      <div className="collection-modal__row collection-modal__row--editing">
        <span className="collection-modal__row-label">{label}:</span>
        <input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setEditing(false);
          }}
        />
      </div>
    );
  }

  const valueInner = (
    <>
      {prefix}
      <span
        className={
          isEmpty || (noneClass && sourceClass(value))
            ? "collection-modal__none"
            : undefined
        }
      >
        {text}
      </span>
      {editable ? (
        <span className="collection-modal__edit-icon" aria-hidden>
          ✎
        </span>
      ) : null}
    </>
  );

  return (
    <div className="collection-modal__row">
      <span className="collection-modal__row-label">{label}:</span>
      {editable ? (
        <button
          type="button"
          className="collection-modal__row-value"
          onClick={() => setEditing(true)}
        >
          {valueInner}
        </button>
      ) : (
        <span className="collection-modal__row-value collection-modal__row-value--static">
          {valueInner}
        </span>
      )}
    </div>
  );
}
