import { useState } from "react";
import { saveTrackLyrics } from "../../../api";
import { trackDisplayTitle, trackMainTitle } from "./releaseTrackPanelMeta";
import ModalPortal from "../../ModalPortal";

type Props = {
  artistName: string;
  trackTitle: string;
  displayTitle?: string;
  playPath?: string;
  initialLyrics: string;
  onClose: () => void;
  onSaved: (lyrics: string, syncedLyrics: string | null) => void;
};

export default function ReleaseLyricsEditModal({
  artistName,
  trackTitle,
  displayTitle,
  playPath,
  initialLyrics,
  onClose,
  onSaved,
}: Props) {
  const [lyrics, setLyrics] = useState(initialLyrics);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = displayTitle ?? trackDisplayTitle(trackTitle);

  async function handleSave() {
    const text = lyrics.trim();
    if (!text) {
      setError("Lyrics cannot be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await saveTrackLyrics({
        artist: artistName,
        title: trackMainTitle(trackTitle),
        play_path: playPath,
        lyrics: text,
      });
      onSaved(res.lyrics ?? text, res.synced_lyrics ?? null);
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
            Lyrics
            <textarea
              className="release-lyrics-edit-modal__textarea ms-scrollbar"
              rows={14}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Paste or type lyrics for this track…"
            />
          </label>
          <p className="muted release-lyrics-edit-modal__note">
            Editing plain text here does not remove synced timestamps if this
            track already has an .lrc file stored.
          </p>
        </div>

        <div className="modal-actions-row">
          <button
            type="button"
            className="btn"
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
