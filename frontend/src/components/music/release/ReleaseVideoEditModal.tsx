import { useEffect, useState } from "react";
import { fetchTrackYoutube, saveTrackYoutube } from "../../../api";
import { trackDisplayTitle, trackMainTitle } from "./releaseTrackPanelMeta";
import ModalPortal from "../../ModalPortal";

type Props = {
  bandId: number;
  artistName: string;
  trackTitle: string;
  displayTitle?: string;
  playPath?: string;
  initialUrl?: string | null;
  onClose: () => void;
  onSaved: (url: string | null) => void;
};

export default function ReleaseVideoEditModal({
  bandId,
  artistName,
  trackTitle,
  displayTitle,
  playPath,
  initialUrl,
  onClose,
  onSaved,
}: Props) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!initialUrl);
  const [error, setError] = useState<string | null>(null);
  const title = displayTitle ?? trackDisplayTitle(trackTitle);

  useEffect(() => {
    if (initialUrl !== undefined) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void fetchTrackYoutube(artistName, trackMainTitle(trackTitle), playPath, bandId)
      .then((res) => {
        if (cancelled) return;
        setUrl(res.youtube_url ?? "");
      })
      .catch(() => {
        if (!cancelled) setUrl("");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artistName, bandId, initialUrl, playPath, trackTitle]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const trimmed = url.trim();
      const res = await saveTrackYoutube({
        artist: artistName,
        title: trackMainTitle(trackTitle),
        play_path: playPath,
        youtube_url: trimmed || null,
        band_id: bandId,
      });
      onSaved(res.youtube_url ?? null);
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
        className="artist-word-cloud-modal__panel release-lyrics-edit-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="artist-word-cloud-modal__head">
          <h3>{title}</h3>
          <button
            type="button"
            className="artist-word-cloud-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {error && <p className="error">{error}</p>}

        <div className="artist-admin-form">
          <label>
            Official YouTube URL
            <input
              type="url"
              value={url}
              disabled={loading}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=… or video ID"
            />
          </label>
          <p className="muted release-video-edit-modal__hint">
            Stored in the database for this track. Leave empty to remove.
          </p>
        </div>

        <div className="modal-actions-row">
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
