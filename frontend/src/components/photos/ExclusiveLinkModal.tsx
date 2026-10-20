import { useEffect, useMemo, useState } from "react";
import {
  createExclusiveLink,
  fetchExclusiveLinkEntities,
  patchExclusiveLink,
  suggestExclusiveLinkTitle,
  type ExclusiveLinkEntityOption,
  type ExclusiveLinkRecord,
} from "../../api";
import ModalPortal from "../ModalPortal";

const MEDIA_TYPES = [
  { value: "photos", label: "Photos" },
  { value: "music", label: "Music" },
  { value: "movies", label: "Movies" },
  { value: "series", label: "Series" },
  { value: "books", label: "Books" },
  { value: "games", label: "Games" },
] as const;

const CONTENT_TYPES = [
  { value: "photo", label: "Photo" },
  { value: "video", label: "Video" },
] as const;

type Prefill = {
  media_type?: string;
  entity_name?: string;
  entity_id?: string | null;
  franchise_name?: string | null;
};

type Props = {
  link?: ExclusiveLinkRecord | null;
  prefill?: Prefill | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function ExclusiveLinkModal({
  link,
  prefill,
  onClose,
  onSaved,
}: Props) {
  const isEdit = link != null;
  const [mediaType, setMediaType] = useState(
    link?.media_type || prefill?.media_type || "photos"
  );
  const [contentType, setContentType] = useState(
    link?.content_type === "video" ? "video" : "photo"
  );
  const [title, setTitle] = useState(link?.title || "");
  const [url, setUrl] = useState(link?.url || "");
  const [entityName, setEntityName] = useState(
    link?.entity_name || prefill?.entity_name || ""
  );
  const [entityId, setEntityId] = useState<string | null>(
    link?.entity_id ?? prefill?.entity_id ?? null
  );
  const [franchiseName, setFranchiseName] = useState(
    link?.franchise_name || prefill?.franchise_name || ""
  );
  const [entities, setEntities] = useState<ExclusiveLinkEntityOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleTouched, setTitleTouched] = useState(Boolean(link?.title));

  useEffect(() => {
    void fetchExclusiveLinkEntities(mediaType)
      .then((d) => setEntities(d.items || []))
      .catch(() => setEntities([]));
  }, [mediaType]);

  useEffect(() => {
    if (isEdit || titleTouched) return;
    void suggestExclusiveLinkTitle(mediaType, contentType)
      .then((d) => setTitle(d.title || ""))
      .catch(() => {});
  }, [mediaType, contentType, isEdit, titleTouched]);

  const listId = useMemo(
    () => `exclusive-link-entities-${mediaType}`,
    [mediaType]
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        media_type: mediaType,
        content_type: contentType,
        title: title.trim() || undefined,
        url: url.trim(),
        entity_name: entityName.trim(),
        entity_id: entityId,
        franchise_name: franchiseName.trim() || null,
      };
      if (!body.url) {
        setError("URL is required");
        return;
      }
      if (!body.entity_name) {
        setError("Person / franchise name is required");
        return;
      }
      if (isEdit && link) {
        await patchExclusiveLink(link.id, body);
      } else {
        await createExclusiveLink(body);
      }
      onSaved();
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
          <h3>{isEdit ? "Edit Exclusive link" : "Add Exclusive link"}</h3>
          <button type="button" className="modal-close-x" onClick={onClose}>
            ×
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="artist-admin-form">
          <label>
            Media type
            <select
              value={mediaType}
              onChange={(e) => {
                setMediaType(e.target.value);
                if (!prefill?.entity_name) {
                  setEntityName("");
                  setEntityId(null);
                  setFranchiseName("");
                }
              }}
            >
              {MEDIA_TYPES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Content type
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
            >
              {CONTENT_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Title
            <input
              value={title}
              onChange={(e) => {
                setTitleTouched(true);
                setTitle(e.target.value);
              }}
              placeholder="Photo 01"
            />
          </label>

          <label>
            {mediaType === "photos"
              ? "Person"
              : mediaType === "music"
                ? "Artist"
                : "Title / leaf"}
            <input
              list={listId}
              value={entityName}
              onChange={(e) => {
                const v = e.target.value;
                setEntityName(v);
                const hit = entities.find(
                  (row) => row.name.toLowerCase() === v.toLowerCase()
                );
                setEntityId(hit?.id ?? null);
                setFranchiseName(hit?.franchise || "");
              }}
              placeholder="Type or pick from suggestions…"
            />
            <datalist id={listId}>
              {entities.map((e) => (
                <option
                  key={`${e.key}-${e.id || ""}`}
                  value={e.name}
                  label={e.franchise || undefined}
                />
              ))}
            </datalist>
          </label>

          <label>
            URL
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… or example.com"
            />
          </label>
        </div>

        <div className="modal-panel-actions modal-panel-actions--end">
          <button
            type="button"
            className="btn btn--primary"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
