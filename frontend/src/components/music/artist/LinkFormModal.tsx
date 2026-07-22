import { useEffect, useRef, useState } from "react";
import {
  createEntityLink,
  deleteEntityLink,
  fetchLinkCatalog,
  patchEntityLink,
  uploadEntityLinkLogo,
} from "../../../api";
import type { LinkCategory, LinkItem, LinkCatalogEntry } from "../../../types";
import ModalPortal from "../../ModalPortal";

const CATEGORIES: { id: LinkCategory; label: string }[] = [
  { id: "social", label: "Social Media" },
  { id: "streaming", label: "Streaming" },
  { id: "shopping", label: "Shopping" },
  { id: "downloads", label: "Downloads" },
  { id: "databases", label: "Databases" },
  { id: "lyrics", label: "Lyrics" },
];

type LogoMode = "auto" | "catalog" | "upload";

type Props = {
  entityType: "band" | "artist";
  entityId: number;
  link?: LinkItem;
  defaultCategory?: LinkCategory;
  layer?: 1 | 2;
  onClose: () => void;
  onSaved: () => void;
};

export default function LinkFormModal({
  entityType,
  entityId,
  link,
  defaultCategory = "social",
  layer = 1,
  onClose,
  onSaved,
}: Props) {
  const isEdit = link != null;
  const [category, setCategory] = useState<LinkCategory>(
    link?.category ?? defaultCategory
  );
  const [label, setLabel] = useState(link?.label ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const [logoMode, setLogoMode] = useState<LogoMode>(
    link?.logo_key ? "catalog" : "auto"
  );
  const [logoKey, setLogoKey] = useState(link?.logo_key ?? "");
  const [catalog, setCatalog] = useState<LinkCatalogEntry[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
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

  useEffect(() => {
    if (!logoFile) return;
    const obj = URL.createObjectURL(logoFile);
    setLogoPreview(obj);
    return () => URL.revokeObjectURL(obj);
  }, [logoFile]);

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
        clear_logo_upload: logoMode !== "upload" && isEdit,
      };
      if (!body.url) {
        setError("URL is required");
        return;
      }
      let linkId = link?.id;
      if (isEdit && linkId) {
        await patchEntityLink(entityType, entityId, linkId, body);
      } else {
        const created = await createEntityLink(entityType, entityId, body);
        linkId = created.id;
      }
      if (logoMode === "upload" && logoFile && linkId) {
        await uploadEntityLinkLogo(entityType, entityId, linkId, logoFile);
      }
      onSaved();
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
      await deleteEntityLink(entityType, entityId, link.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal onClose={onClose} layer={layer}>
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
              placeholder="Facebook"
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

          <span className="artist-admin-form__section">Logo</span>
          <div className="link-form__logo-row">
            <div className="link-form__logo-left">
              <div className="artist-admin-form__checks link-form__logo-options">
                <label>
                  <input
                    type="radio"
                    name="logoMode"
                    checked={logoMode === "auto"}
                    onChange={() => setLogoMode("auto")}
                  />
                  Auto-detect from URL
                </label>
                <label>
                  <input
                    type="radio"
                    name="logoMode"
                    checked={logoMode === "catalog"}
                    onChange={() => setLogoMode("catalog")}
                  />
                  Pick from catalog
                </label>
                <label>
                  <input
                    type="radio"
                    name="logoMode"
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
                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
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
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt=""
                  className={
                    logoMode === "upload"
                      ? "link-form__preview-img--upload"
                      : undefined
                  }
                />
              ) : null}
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
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
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
