import { useEffect, useRef, useState } from "react";
import {
  createSeriesLink,
  deleteSeriesLink,
  fetchLinkCatalog,
  patchSeriesLink,
} from "../../api";
import type { LinkCatalogEntry, LinkCategory } from "../../types";
import ModalPortal from "../ModalPortal";

const CATEGORIES: { id: LinkCategory; label: string }[] = [
  { id: "social", label: "Social Media" },
  { id: "streaming", label: "Streaming" },
  { id: "shopping", label: "Shopping" },
  { id: "downloads", label: "Downloads" },
  { id: "databases", label: "Databases" },
  { id: "lyrics", label: "Lyrics" },
];

type LogoMode = "auto" | "catalog" | "upload";

export type SeriesLinkEditItem = {
  id: string;
  label: string;
  url: string;
  category?: string;
  logo_url?: string;
  logo_key?: string | null;
};

type Props = {
  franchiseId: string;
  link?: SeriesLinkEditItem;
  defaultCategory?: LinkCategory | string;
  onClose: () => void;
  onSaved: () => void;
};

export default function SeriesLinkFormModal({
  franchiseId,
  link,
  defaultCategory = "databases",
  onClose,
  onSaved,
}: Props) {
  const isEdit = link != null;
  const [category, setCategory] = useState<LinkCategory>(
    (link?.category as LinkCategory) ?? (defaultCategory as LinkCategory)
  );
  const [label, setLabel] = useState(link?.label ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const [logoMode, setLogoMode] = useState<LogoMode>(
    link?.logo_key ? "catalog" : "auto"
  );
  const [logoKey, setLogoKey] = useState(link?.logo_key ?? "");
  const [catalog, setCatalog] = useState<LinkCatalogEntry[]>([]);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    link?.logo_url ?? null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchLinkCatalog()
      .then((d) => setCatalog(d.items))
      .catch(() => {});
  }, []);

  const previewSrc =
    logoMode === "catalog" && logoKey
      ? `/assets/links/${logoKey}.svg`
      : logoPreview;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        category,
        label: label.trim() || "Link",
        url: url.trim(),
        logo_key: logoMode === "catalog" ? logoKey || null : null,
        logo_url:
          logoMode === "catalog" && logoKey
            ? `/assets/links/${logoKey}.svg`
            : logoMode === "auto"
              ? "/assets/links/link.svg"
              : logoPreview,
        clear_logo_upload: logoMode !== "catalog" && isEdit,
      };
      if (!body.url) {
        setError("URL is required");
        return;
      }
      if (isEdit && link?.id) {
        await patchSeriesLink(franchiseId, link.id, body);
      } else {
        await createSeriesLink(franchiseId, body);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!link || !window.confirm(`Remove “${link.label}”?`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteSeriesLink(franchiseId, link.id);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="modal-panel artist-admin-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-panel-header">
          <h3>{isEdit ? "Edit link" : "Add link"}</h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="artist-admin-form">
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as LinkCategory)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Page name
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="IMDb"
            />
          </label>

          <label>
            URL
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>

          <span className="series-about-edit__label">Logo</span>
          <div className="link-form__logo-row">
            <div className="link-form__logo-left">
              <div className="artist-admin-form__checks link-form__logo-options">
                <label>
                  <input
                    type="radio"
                    name="seriesLogoMode"
                    checked={logoMode === "auto"}
                    onChange={() => setLogoMode("auto")}
                  />
                  Auto-detect from URL
                </label>
                <label>
                  <input
                    type="radio"
                    name="seriesLogoMode"
                    checked={logoMode === "catalog"}
                    onChange={() => setLogoMode("catalog")}
                  />
                  Pick from catalog
                </label>
                <label>
                  <input
                    type="radio"
                    name="seriesLogoMode"
                    checked={logoMode === "upload"}
                    onChange={() => setLogoMode("upload")}
                  />
                  Upload image
                </label>
              </div>

              {logoMode === "catalog" && (
                <label className="link-form__catalog">
                  Catalog logo
                  <select
                    value={logoKey}
                    onChange={(e) => setLogoKey(e.target.value)}
                  >
                    <option value="">Select logo…</option>
                    {catalog.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {logoMode === "upload" && (
                <div className="link-form__upload-row">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const obj = URL.createObjectURL(file);
                      setLogoPreview(obj);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => fileRef.current?.click()}
                  >
                    Choose file…
                  </button>
                </div>
              )}
            </div>

            <div className="link-form__preview" aria-hidden={!previewSrc}>
              {previewSrc ? <img src={previewSrc} alt="" /> : null}
            </div>
          </div>

          <div className="modal-actions-row">
            {isEdit && (
              <button
                type="button"
                className="btn link-form__delete"
                onClick={() => void handleDelete()}
                disabled={saving}
              >
                Delete
              </button>
            )}
            <span className="modal-actions__spacer" />
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
