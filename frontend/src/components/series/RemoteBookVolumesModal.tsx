import { useEffect, useState } from "react";
import {
  fetchBooksRemote,
  saveBooksRemote,
  type RemoteBookVolumePayload,
} from "../../api";
import ModalPortal from "../ModalPortal";

type VolumeDraft = {
  key: string;
  number: string;
  title: string;
  date_iso: string;
  url: string;
};

type Props = {
  folderPath: string;
  title?: string;
  onClose: () => void;
  onSaved: () => void;
};

let draftKey = 0;
function nextKey() {
  draftKey += 1;
  return `vol_${draftKey}`;
}

function emptyVolume(): VolumeDraft {
  return { key: nextKey(), number: "", title: "", date_iso: "", url: "" };
}

export default function RemoteBookVolumesModal({
  folderPath,
  onClose,
  onSaved,
}: Props) {
  const [volumes, setVolumes] = useState<VolumeDraft[]>([emptyVolume()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchBooksRemote(folderPath)
      .then((data) => {
        if (cancelled) return;
        const rows = (data.volumes || []).map((v) => ({
          key: nextKey(),
          number: v.number != null && v.number > 0 ? String(v.number) : "",
          title: v.title || "",
          date_iso: (v.date_iso || "").slice(0, 10),
          url: v.url || "",
        }));
        setVolumes(rows.length ? rows : [emptyVolume()]);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setVolumes([emptyVolume()]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [folderPath]);

  const updateVolume = (key: string, patch: Partial<VolumeDraft>) => {
    setVolumes((prev) =>
      prev.map((v) => (v.key === key ? { ...v, ...patch } : v))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const payload: RemoteBookVolumePayload[] = [];
    volumes.forEach((v, i) => {
      const volTitle = v.title.trim();
      const url = v.url.trim();
      if (!volTitle || !url) return;
      const num = v.number.trim() ? Number(v.number) : i + 1;
      payload.push({
        number: Number.isFinite(num) && num > 0 ? num : i + 1,
        title: volTitle,
        date_iso: v.date_iso.trim() || null,
        url,
        sort_order: payload.length,
      });
    });
    try {
      await saveBooksRemote(folderPath, payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal onClose={onClose}>
      <div
        className="artist-word-cloud-modal__panel release-video-set-modal remote-media-modal remote-media-modal--wide"
        role="dialog"
        aria-labelledby="remote-book-modal-title"
      >
        <div className="artist-word-cloud-modal__head">
          <h2 id="remote-book-modal-title">Set volumes</h2>
          <button
            type="button"
            className="modal-close-x"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {loading ? <p className="muted">Loading…</p> : null}
        {!loading ? (
          <ul className="release-video-set-modal__list ms-scrollbar">
            <li className="release-video-set-modal__item">
              <div className="release-video-set-modal__videos">
                {volumes.map((vol, i) => (
                  <div
                    key={vol.key}
                    className="release-video-set-modal__video-row"
                  >
                    <input
                      type="text"
                      className="release-video-set-modal__meta-input remote-media-modal__num"
                      value={vol.number}
                      placeholder={String(i + 1)}
                      aria-label="Volume number"
                      onChange={(e) =>
                        updateVolume(vol.key, { number: e.target.value })
                      }
                    />
                    <input
                      type="text"
                      className="release-video-set-modal__label-input remote-media-modal__title"
                      value={vol.title}
                      placeholder="Volume title"
                      onChange={(e) =>
                        updateVolume(vol.key, { title: e.target.value })
                      }
                    />
                    <input
                      type="date"
                      className="release-video-set-modal__meta-input release-video-set-modal__meta-input--date remote-media-modal__date"
                      value={vol.date_iso}
                      aria-label="Volume date"
                      onChange={(e) =>
                        updateVolume(vol.key, { date_iso: e.target.value })
                      }
                    />
                    <input
                      type="text"
                      className="release-video-set-modal__input"
                      value={vol.url}
                      placeholder="URL"
                      onChange={(e) =>
                        updateVolume(vol.key, { url: e.target.value })
                      }
                    />
                    {volumes.length > 1 ? (
                      <button
                        type="button"
                        className="release-video-set-modal__icon-btn release-video-set-modal__icon-btn--remove"
                        title="Remove volume"
                        aria-label="Remove volume"
                        onClick={() =>
                          setVolumes((prev) =>
                            prev.filter((x) => x.key !== vol.key)
                          )
                        }
                      >
                        ×
                      </button>
                    ) : (
                      <span
                        className="release-video-set-modal__row-spacer"
                        aria-hidden
                      />
                    )}
                  </div>
                ))}
              </div>
            </li>
          </ul>
        ) : null}
        <div className="modal-actions-row remote-media-modal__actions">
          <button
            type="button"
            className="btn ghost"
            disabled={saving || loading}
            onClick={() => setVolumes((prev) => [...prev, emptyVolume()])}
          >
            Add volume
          </button>
          <button
            type="button"
            className="btn"
            disabled={saving || loading}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
