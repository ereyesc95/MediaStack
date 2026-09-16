import { useEffect, useMemo, useState } from "react";
import {
  deleteCollectionItem,
  fetchCollectionItem,
  fetchCollectionMatches,
  fetchCollectionPreviewFromFolder,
  upsertCollectionItem,
  updateCollectionItem,
} from "../../api";
import type { CollectionLeaf, CollectionPreview } from "../../types";
import ModalPortal from "../ModalPortal";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  mode: "add" | "edit" | "manual";
  bandId?: number | null;
  folderPath?: string | null;
  collectionId?: number | null;
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

function sourceClass(label: string | undefined) {
  const low = (label || "").toLowerCase();
  if (low === "none" || low.split(/[/|,]/).every((p) => p.trim() === "none")) {
    return "collection-modal__none";
  }
  return undefined;
}

export default function CollectionModal({
  open,
  onClose,
  onSaved,
  mode,
  bandId,
  folderPath,
  collectionId,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
          // manual blank
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
    setPreview(data);
    setTitle(data.title || "");
    setArtist(data.artist || "");
    setEdition(data.edition || "Standard Edition");
    setReleaseType(data.release_type || "Studio Album");
    setOriginalDate(data.original_release_date || "");
    setEditionDate(data.release_date || "");
    setMediaType(data.media_type || "LP");
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
    setMediaType(item.media_type || "LP");
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

  const artworkGroups = useMemo(() => {
    if (!artwork) return [];
    return Object.entries(artwork).filter(([, items]) => items && items.length > 0);
  }, [artwork]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const body = {
      artist: artist.trim(),
      title: title.trim(),
      edition: edition.trim() || "Standard Edition",
      release_type: releaseType,
      original_date: originalDate || null,
      edition_date: editionDate || null,
      media_type: mediaType,
      version: version || null,
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
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!existingId) return;
    if (!window.confirm("Remove this release from your collection?")) return;
    setSaving(true);
    try {
      await deleteCollectionItem(existingId);
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
      : mode === "manual"
        ? "Add to my collection"
        : "Add to my collection";

  return (
    <ModalPortal onClose={onClose}>
      <div className="modal-backdrop" onClick={onClose}>
        <div
          className="modal collection-modal"
          role="dialog"
          aria-modal="true"
          aria-label={heading}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="modal__header">
            <h2>{heading}</h2>
            <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>

          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <div className="collection-modal__body">
              {error ? <p className="error">{error}</p> : null}

              <div className="collection-modal__grid">
                <label>
                  Title
                  <input value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label>
                  Artist
                  <input value={artist} onChange={(e) => setArtist(e.target.value)} />
                </label>
                <label>
                  Original release date
                  <input
                    value={originalDate}
                    onChange={(e) => setOriginalDate(e.target.value)}
                    placeholder="YYYY.MM.DD"
                  />
                  {preview?.original_release_date_display ? (
                    <span className="muted collection-modal__hint">
                      {preview.original_release_date_display}
                    </span>
                  ) : null}
                </label>
                <label>
                  Edition
                  <input value={edition} onChange={(e) => setEdition(e.target.value)} />
                </label>
                {edition.toLowerCase() !== "standard edition" ? (
                  <label>
                    Release date
                    <input
                      value={editionDate}
                      onChange={(e) => setEditionDate(e.target.value)}
                      placeholder="YYYY.MM.DD"
                    />
                  </label>
                ) : null}
                <label>
                  Country
                  <span className="collection-modal__country">
                    {countryIso ? (
                      <span className={`fi fi-${countryIso.toLowerCase()}`} aria-hidden />
                    ) : null}
                    <input value={country} onChange={(e) => setCountry(e.target.value)} />
                  </span>
                </label>
                <label>
                  Release type
                  <select value={releaseType} onChange={(e) => setReleaseType(e.target.value)}>
                    {RELEASE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Genre
                  <input value={genres} onChange={(e) => setGenres(e.target.value)} />
                </label>
                <label>
                  Media type
                  <select value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
                    {MEDIA_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Version
                  <input value={version} onChange={(e) => setVersion(e.target.value)} />
                </label>
                <label>
                  Animation
                  <input
                    className={sourceClass(animation)}
                    value={animation}
                    onChange={(e) => setAnimation(e.target.value)}
                    placeholder="AI / Official / None"
                  />
                </label>
                <label>
                  Canvas
                  <input
                    className={sourceClass(canvas)}
                    value={canvas}
                    onChange={(e) => setCanvas(e.target.value)}
                    placeholder="Apple / Spotify / None"
                  />
                </label>
                <label>
                  Autographs
                  <input
                    value={autographs}
                    onChange={(e) => setAutographs(e.target.value)}
                    placeholder="Cover, Insert…"
                  />
                </label>
                <label className="collection-modal__span2">
                  Notes
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </label>
              </div>

              {!folder && matches.length > 0 ? (
                <div className="collection-modal__matches">
                  <h3>Possible local matches</h3>
                  <ul>
                    {matches.map((m) => (
                      <li key={`${m.band_id}-${m.folder_path || m.release_id || m.title}`}>
                        <button type="button" className="btn" onClick={() => applyMatch(m)}>
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

              {folder ? (
                <p className="muted collection-modal__hint">Linked folder: {folder}</p>
              ) : (
                <p className="muted collection-modal__hint">Orphan — not linked to a local folder yet.</p>
              )}

              {artworkGroups.length > 0 ? (
                <div className="collection-modal__artwork">
                  <h3>Artwork</h3>
                  <div className="collection-modal__artwork-cols">
                    {artworkGroups.map(([group, items]) => (
                      <div key={group}>
                        <h4>{group}</h4>
                        <ul>
                          {(items || []).map((it) => (
                            <li key={it.label}>
                              {it.label}
                              {it.missing ? (
                                <span className="collection-modal__missing"> (Missing)</span>
                              ) : null}
                            </li>
                          ))}
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

          <footer className="modal__footer collection-modal__footer">
            {existingId ? (
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => void handleRemove()}
                disabled={saving}
              >
                Remove from collection
              </button>
            ) : (
              <span />
            )}
            <div className="collection-modal__footer-right">
              <button type="button" className="btn" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void handleSave()}
                disabled={saving || !title.trim() || !artist.trim()}
              >
                {saving ? "Saving…" : existingId ? "Save" : "Add"}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
